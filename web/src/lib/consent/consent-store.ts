// 同意レコードの保存層。
//
// ## 設計からの逸脱を1つ記録する
//
// veai-private の設計は共通テーブル `veai-consent-records` を3プロダクトで
// 共有する案だった。**ここでは既存の DrugAndOathRecords に載せる。**
//
// 理由:
//
// 1. **共有ストアは依存を増やす。** 3プロダクトが1つのテーブルに依存すると、
//    そこが落ちたとき全部が同時に止まる。対象は高齢者・介護者で、代わりの
//    手段を持たないことが多い（CLAUDE.md §2.6）。同意の読み取りが失敗して
//    fail closed すると、記録そのものができなくなる
// 2. 各プロダクトのテーブルはリージョンも違う。共有すると
//    クロスリージョンの読み取りが同意判定の経路に入る
// 3. 既存テーブルには **PITR と削除保護が既に入っている**（2026-08-24 適用）。
//    新規テーブルを作ると保護をまた別途入れることになる
//
// **共有するのはストアではなくスキーマ**（consent-record-v1）。
// 集計が必要になったら、各プロダクトの export を読む側で束ねる。
//
// この判断はオーナー確認が要る。設計書 §9 の Phase 1 を、この形で実装した。

import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

import { docClient, TABLE_NAME, makePK } from '../dynamodb.ts'
import {
  buildGrantRecord,
  buildRevokeRecord,
  evaluateAll,
  evaluateConsent,
  latestRecord,
  type ConsentEvaluation,
  type ConsentRecord,
  type ConsentType,
  type GrantInput,
} from './consent-record.ts'

/** SK の前づけ。既存の RECORD# と混ざらないようにする。 */
export const CONSENT_SK_PREFIX = 'CONSENT#'

export function makeConsentSK(consentType: ConsentType, consentId: string): string {
  return `${CONSENT_SK_PREFIX}${consentType}#${consentId}`
}

/** その利用者の同意レコードをすべて読む。撤回済みも期限切れも含む（監査のため消さない）。 */
export async function listConsentRecords(userId: string): Promise<ConsentRecord[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': makePK(userId),
        ':sk': CONSENT_SK_PREFIX,
      },
    }),
  )
  return (result.Items ?? []) as ConsentRecord[]
}

/** 同意を記録する。既存レコードは書き換えず、積む。 */
export async function grantConsent(input: GrantInput, now = new Date()): Promise<ConsentRecord> {
  const record = buildGrantRecord(input, now)
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: makePK(record.userId),
        SK: makeConsentSK(record.consentType, record.consentId),
        ...record,
      },
    }),
  )
  return record
}

/**
 * 同意を撤回する。撤回対象が無ければ null を返す（何も書かない）。
 * 「無いものを撤回した」を成功として返さない。
 */
export async function revokeConsent(
  userId: string,
  consentType: ConsentType,
  consentId: string,
  now = new Date(),
): Promise<ConsentRecord | null> {
  const records = await listConsentRecords(userId)
  const previous = latestRecord(records.filter((r) => r.consentType === consentType))
  if (!previous || previous.status === 'revoked') return null

  const record = buildRevokeRecord(previous, consentId, now)
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: makePK(userId),
        SK: makeConsentSK(consentType, consentId),
        ...record,
      },
    }),
  )
  return record
}

/**
 * ゲート用。**読み取りに失敗したら granted を返さない。**
 *
 * DynamoDB が落ちているときに「判断がつかないので通す」をやると、
 * 撤回済みの利用者のデータを扱ってしまう。fail closed。
 * ただし呼び出し側は、これが false のときに「同意していない」と
 * 「確認できなかった」を区別できないので、必ずログに残すこと。
 */
export async function hasConsent(
  userId: string,
  consentType: ConsentType,
  now = new Date(),
): Promise<ConsentEvaluation> {
  try {
    const records = await listConsentRecords(userId)
    return evaluateConsent(records, consentType, now)
  } catch (error) {
    // 握りつぶすが、grep できる印を残す（CLAUDE.md §2.55）。
    // Errors メトリクスは上がらないので、この文字列にフィルタを張る。
    console.error(
      `[CONSENT READ FAILED] userId=${userId} consentType=${consentType}`,
      error instanceof Error ? error.message : error,
    )
    return { granted: false, ownStatus: 'absent' }
  }
}

/** 画面の設定表示用。全種別をまとめて返す。 */
export async function getConsentState(userId: string, now = new Date()) {
  const records = await listConsentRecords(userId)
  return evaluateAll(records, now)
}
