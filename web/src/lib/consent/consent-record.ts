// 同意レコード（consent-record-v1）。
//
// COMP-01 C-06「同意日時・バージョンの保存」。これまで同意状態を持っていたのは
// localStorage の `metrics_consent` だけで、これは BEN-004 の計測オプトインで
// あって健康データ取得の同意ではなかった。端末を変えれば消え、
// 「いつ・どの版の説明に同意したか」がどこにも残らなかった。
//
// スキーマの正本は veai-private の governance/consent-store/。
// ここは Medication Promise 側の型と、AWS を呼ばずに検算できる純粋ロジック。

export type ProductId = 'parkinsync' | 'gutpacer' | 'medpromise'

export type ConsentType = 'basic' | 'event_export' | 'ai_analysis' | 'third_party'

export type ConsentStatus = 'granted' | 'revoked' | 'expired'

export type ConsentSource = 'app_ui' | 'api' | 'import'

export interface ConsentRecord {
  consentId: string
  userId: string
  productId: ProductId
  consentType: ConsentType
  status: ConsentStatus
  grantedAt: string
  revokedAt?: string
  expiresAt?: string
  ppVersion: string
  consentTextVersion: string
  ipAddress?: string
  userAgent?: string
  source: ConsentSource
  createdAt: string
  updatedAt: string
}

// 同意種別の前提条件。event_export は basic が無ければ成立しない。
// 「event_export だけ granted で basic が revoked」を有効と読まないための表。
export const CONSENT_PREREQUISITES: Record<ConsentType, readonly ConsentType[]> = {
  basic: [],
  event_export: ['basic'],
  ai_analysis: ['basic'],
  third_party: ['basic', 'event_export'],
}

export const CONSENT_TYPES: readonly ConsentType[] = [
  'basic',
  'event_export',
  'ai_analysis',
  'third_party',
]

/**
 * 同じ種別の同意が複数あるとき、どれが今の状態かを決める。
 *
 * 最後に作られたものが勝つ（updatedAt の降順）。撤回してから同意し直す、
 * という順序を正しく扱うため。同着は createdAt、それも同着なら consentId で
 * 決める（機械の時計が粗いときに順序が揺れないように）。
 */
export function latestRecord(records: readonly ConsentRecord[]): ConsentRecord | undefined {
  if (records.length === 0) return undefined
  return [...records].sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
    return a.consentId < b.consentId ? 1 : -1
  })[0]
}

/**
 * 保存されている status をそのまま信じない。
 *
 * expiresAt を過ぎていれば expired。期限切れは書き込み時ではなく読み取り時に
 * 判定する（バッチが止まっていても、期限切れの同意を有効と読まないため）。
 */
export function effectiveStatus(record: ConsentRecord, now: Date): ConsentStatus {
  if (record.status === 'revoked') return 'revoked'
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= now.getTime()) {
    return 'expired'
  }
  return record.status
}

export interface ConsentEvaluation {
  /** 前提条件も含めて、この種別の同意が今も有効か */
  granted: boolean
  /** この種別そのものの状態。前提条件は見ていない */
  ownStatus: ConsentStatus | 'absent'
  /** granted でない理由。前提条件で落ちた場合はその種別名 */
  blockedBy?: ConsentType
}

/**
 * ある種別の同意が今も有効かを、前提条件込みで判定する。
 *
 * **fail closed。** レコードが無い・期限切れ・撤回済み・前提条件が欠けている、
 * のいずれでも granted は false。「判断がつかないので通す」はしない。
 */
export function evaluateConsent(
  records: readonly ConsentRecord[],
  consentType: ConsentType,
  now: Date,
): ConsentEvaluation {
  const own = latestRecord(records.filter((r) => r.consentType === consentType))
  if (!own) return { granted: false, ownStatus: 'absent' }

  const ownStatus = effectiveStatus(own, now)
  if (ownStatus !== 'granted') return { granted: false, ownStatus }

  for (const prerequisite of CONSENT_PREREQUISITES[consentType]) {
    const upstream = evaluateConsent(records, prerequisite, now)
    if (!upstream.granted) {
      return { granted: false, ownStatus, blockedBy: prerequisite }
    }
  }
  return { granted: true, ownStatus }
}

/** 全種別をまとめて評価する。画面や API のゲートで使う。 */
export function evaluateAll(
  records: readonly ConsentRecord[],
  now: Date,
): Record<ConsentType, ConsentEvaluation> {
  const out = {} as Record<ConsentType, ConsentEvaluation>
  for (const type of CONSENT_TYPES) {
    out[type] = evaluateConsent(records, type, now)
  }
  return out
}

export interface GrantInput {
  consentId: string
  userId: string
  consentType: ConsentType
  ppVersion: string
  consentTextVersion: string
  source?: ConsentSource
  expiresAt?: string
  ipAddress?: string
  userAgent?: string
}

/**
 * 同意レコードを組み立てる。AWS を呼ばずに中身を検算できるよう切り出す。
 *
 * 監査情報（ipAddress / userAgent）は**渡されたときだけ**入れる。
 * 既定で集めない。
 */
export function buildGrantRecord(input: GrantInput, now: Date): ConsentRecord {
  const iso = now.toISOString()
  const record: ConsentRecord = {
    consentId: input.consentId,
    userId: input.userId,
    productId: 'medpromise',
    consentType: input.consentType,
    status: 'granted',
    grantedAt: iso,
    ppVersion: input.ppVersion,
    consentTextVersion: input.consentTextVersion,
    source: input.source ?? 'app_ui',
    createdAt: iso,
    updatedAt: iso,
  }
  if (input.expiresAt) record.expiresAt = input.expiresAt
  if (input.ipAddress) record.ipAddress = input.ipAddress
  if (input.userAgent) record.userAgent = input.userAgent
  return record
}

/**
 * 撤回。**元のレコードは書き換えず、撤回した新しいレコードを積む。**
 * 監査要件として、いつ同意していつ撤回したかの両方を残す。
 */
export function buildRevokeRecord(
  previous: ConsentRecord,
  consentId: string,
  now: Date,
): ConsentRecord {
  const iso = now.toISOString()
  return {
    ...previous,
    consentId,
    status: 'revoked',
    revokedAt: iso,
    updatedAt: iso,
    createdAt: iso,
  }
}
