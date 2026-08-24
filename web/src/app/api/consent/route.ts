// 同意の取得・記録・撤回。
//
// COMP-01。**同意の記録は監査要件なので、書けなかったら成功を返さない。**
// 「同意した」と画面に出したのに記録が無い、が一番まずい。

import { randomUUID } from 'node:crypto'

import { resolveRequestHousehold, unauthorizedHouseholdResponse } from '@/lib/household'
import {
  CONSENT_TYPES,
  type ConsentType,
} from '@/lib/consent/consent-record'
import { getConsentState, grantConsent, revokeConsent } from '@/lib/consent/consent-store'
import { ConsentSubjectError, consentSubjectFor } from '@/lib/consent/consent-subject'
import { CONSENT_TEXT_METADATA } from '@/lib/consent/consent-text'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

async function resolve(request: Request) {
  try {
    return { household: await resolveRequestHousehold(request) }
  } catch (error) {
    const response = unauthorizedHouseholdResponse(error)
    if (response) return { response }
    throw error
  }
}

function parseConsentType(value: unknown): ConsentType {
  if (typeof value !== 'string' || !CONSENT_TYPES.includes(value as ConsentType)) {
    throw new InvalidConsentRequest('同意の種類が正しくありません')
  }
  return value as ConsentType
}

class InvalidConsentRequest extends Error {}

export async function GET(request: Request) {
  const resolved = await resolve(request)
  if (resolved.response) return resolved.response

  let subject: string
  try {
    subject = consentSubjectFor(resolved.household)
  } catch (error) {
    if (error instanceof ConsentSubjectError) {
      return Response.json({ error: error.message }, { status: 503, headers: NO_STORE })
    }
    throw error
  }

  try {
    const state = await getConsentState(subject)
    return Response.json({ state, versions: CONSENT_TEXT_METADATA }, { headers: NO_STORE })
  } catch (error) {
    // **読めなかったことを「同意していない」として返さない。**
    // 画面が同意画面を出してしまい、押しても書き込みが失敗する。
    console.error(
      `[CONSENT READ FAILED] subject=${subject}`,
      error instanceof Error ? error.message : error,
    )
    return Response.json(
      { error: '同意の状態を確認できませんでした', unavailable: true },
      { status: 503, headers: NO_STORE },
    )
  }
}

export async function POST(request: Request) {
  const resolved = await resolve(request)
  if (resolved.response) return resolved.response

  let subject: string
  try {
    subject = consentSubjectFor(resolved.household)
  } catch (error) {
    if (error instanceof ConsentSubjectError) {
      return Response.json({ error: error.message }, { status: 503, headers: NO_STORE })
    }
    throw error
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'リクエストを読み取れませんでした' }, { status: 400, headers: NO_STORE })
  }

  let consentType: ConsentType
  try {
    consentType = parseConsentType(body.consentType)
  } catch (error) {
    if (error instanceof InvalidConsentRequest) {
      return Response.json({ error: error.message }, { status: 400, headers: NO_STORE })
    }
    throw error
  }

  const action = body.action
  if (action !== 'grant' && action !== 'revoke') {
    return Response.json({ error: '操作が正しくありません' }, { status: 400, headers: NO_STORE })
  }

  try {
    if (action === 'revoke') {
      const revoked = await revokeConsent(subject, consentType, randomUUID())
      if (!revoked) {
        return Response.json({ error: '撤回できる同意がありません' }, { status: 409, headers: NO_STORE })
      }
    } else {
      // 画面がどの版を見せたかを、そのまま記録する。**クライアントの申告は使わない。**
      // 古い画面がキャッシュされていても、記録は必ずサーバ側の版になる。
      await grantConsent({
        consentId: randomUUID(),
        userId: subject,
        consentType,
        ppVersion: CONSENT_TEXT_METADATA.ppVersion,
        consentTextVersion: CONSENT_TEXT_METADATA.consentTextVersion,
        source: 'app_ui',
      })
    }
  } catch (error) {
    console.error(
      `[CONSENT WRITE FAILED] subject=${subject} action=${action} consentType=${consentType}`,
      error instanceof Error ? error.message : error,
    )
    return Response.json(
      { error: '記録できませんでした。時間をおいてお試しください' },
      { status: 503, headers: NO_STORE },
    )
  }

  const state = await getConsentState(subject)
  return Response.json({ state, versions: CONSENT_TEXT_METADATA }, { headers: NO_STORE })
}
