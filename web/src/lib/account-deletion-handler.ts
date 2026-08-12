import { getWebAuthMode } from './auth-mode.ts'
import {
  readWebSessionToken,
  WEB_SESSION_COOKIE,
} from './cognito-session.ts'
import { getHouseholdMembershipsBySubject } from './household-memberships.ts'
import {
  HouseholdAuthError,
  makeAuthenticatedHousehold,
  unauthorizedHouseholdResponse,
} from './household.ts'
import { readCookie } from './mvp-access.ts'
import {
  ACCOUNT_DELETION_CONFIRMATION,
  deleteHouseholdAccountData,
  type AccountDeletionContext,
} from './account-deletion.ts'

type Environment = Record<string, string | undefined>

export function isAccountDeletionEnabled(env: Environment = process.env) {
  return env.ACCOUNT_DELETION_ENABLED === 'true'
}

async function resolveDeletionContext(
  request: Request,
  env: Environment,
  dependencies: {
    readSession?: typeof readWebSessionToken
    getMemberships?: typeof getHouseholdMembershipsBySubject
  }
): Promise<AccountDeletionContext> {
  if (getWebAuthMode(env) !== 'cognito') {
    throw new HouseholdAuthError('この認証方式ではデータ削除を利用できません', 409)
  }
  const readSession = dependencies.readSession ?? readWebSessionToken
  const session = await readSession(
    readCookie(request.headers.get('cookie'), WEB_SESSION_COOKIE),
    env
  )
  if (!session) throw new HouseholdAuthError()

  const getMemberships = dependencies.getMemberships ?? getHouseholdMembershipsBySubject
  let memberships
  try {
    memberships = await getMemberships(session.subject)
  } catch {
    throw new HouseholdAuthError('現在データ削除を利用できません。時間をおいてお試しください。', 503)
  }
  const candidates = memberships.filter(({ status }) => status === 'active' || status === 'deleting')
  if (candidates.length !== 1) {
    throw new HouseholdAuthError('このアカウントではデータ削除を利用できません', 403)
  }

  const household = {
    ...makeAuthenticatedHousehold({
      ...env,
      HOUSEHOLD_ID: candidates[0].householdId,
      HOUSEHOLD_PARTITION_MODE: 'household',
    }),
    providerSubject: session.subject,
  }
  return { household, providerSubject: session.subject }
}

function originIsAllowed(request: Request, env: Environment) {
  const expected = env.APP_ORIGIN ?? new URL(request.url).origin
  return request.headers.get('origin') === expected
}

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return Response.json(body, { ...init, headers })
}

export function makeAccountDeletionHandlers({
  env = process.env,
  readSession,
  getMemberships,
  deleteData = deleteHouseholdAccountData,
}: {
  env?: Environment
  readSession?: typeof readWebSessionToken
  getMemberships?: typeof getHouseholdMembershipsBySubject
  deleteData?: typeof deleteHouseholdAccountData
} = {}) {
  return {
    async GET() {
      return noStoreJson({
        available: isAccountDeletionEnabled(env),
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
        scope: ['records', 'settings', 'household_links'],
        recovery: '削除後も、障害復旧用バックアップには最大35日間データが残る場合があります。通常の画面からは参照できず、この操作の取り消しには利用できません。',
        externalData: 'この操作では、Alexaアプリのリマインダーとログイン用認証アカウントは削除されません。AlexaのリマインダーはAlexaアプリで削除し、認証アカウントの削除は運営者へご連絡ください。',
      })
    },

    async DELETE(request: Request) {
      if (!isAccountDeletionEnabled(env)) {
        return noStoreJson({ error: 'データ削除は現在準備中です' }, { status: 503 })
      }
      if (!originIsAllowed(request, env)) {
        return noStoreJson({ error: '不正なリクエストです' }, { status: 403 })
      }

      let input: Record<string, unknown>
      try {
        input = await request.json() as Record<string, unknown>
      } catch {
        return noStoreJson({ error: 'JSONの形式が正しくありません' }, { status: 400 })
      }
      if (
        input.confirmation !== ACCOUNT_DELETION_CONFIRMATION
        || input.understandsRecovery !== true
        || input.understandsExternalData !== true
      ) {
        return noStoreJson({ error: '削除内容と復旧条件の確認が必要です' }, { status: 400 })
      }

      let context
      try {
        context = await resolveDeletionContext(request, env, { readSession, getMemberships })
      } catch (error) {
        return unauthorizedHouseholdResponse(error) ?? noStoreJson(
          { error: 'データ削除を開始できませんでした' },
          { status: 500 }
        )
      }

      try {
        await deleteData(context)
      } catch {
        return noStoreJson(
          { error: '削除を完了できませんでした。時間をおいてもう一度お試しください。' },
          { status: 503 }
        )
      }

      const response = noStoreJson({
        success: true,
        message: 'この世帯の記録、設定、アプリ内の連携情報を削除しました。',
      })
      response.headers.append(
        'Set-Cookie',
        `${WEB_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${env.NODE_ENV === 'production' ? '; Secure' : ''}`
      )
      return response
    },
  }
}
