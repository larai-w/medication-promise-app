import { isMvpRequestAuthorized } from './mvp-access.ts'
import { readCookie } from './mvp-access.ts'
import { getWebAuthMode } from './auth-mode.ts'
import { readWebSessionToken, WEB_SESSION_COOKIE } from './cognito-session.ts'
import { getHouseholdMembershipsBySubject } from './household-memberships.ts'
import { USER_ID, makeHouseholdPK, makePK } from './dynamodb.ts'

export type HouseholdPartitionMode = 'legacy-user' | 'household'

export interface AuthenticatedHousehold {
  householdId: string
  partitionKey: string
  partitionMode: HouseholdPartitionMode
}

export class HouseholdAuthError extends Error {
  readonly status: number

  constructor(
    message = 'この記録にアクセスするにはログインが必要です',
    status = 401
  ) {
    super(message)
    this.name = 'HouseholdAuthError'
    this.status = status
  }
}

const HOUSEHOLD_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/

export function parseHouseholdPartitionMode(value: string | undefined): HouseholdPartitionMode {
  if (!value || value === 'legacy-user') return 'legacy-user'
  if (value === 'household') return 'household'
  throw new Error('HOUSEHOLD_PARTITION_MODE must be "legacy-user" or "household"')
}

export function getConfiguredHouseholdId(env: Record<string, string | undefined> = process.env) {
  const householdId = env.HOUSEHOLD_ID || 'owner-household'
  if (!HOUSEHOLD_ID_PATTERN.test(householdId)) {
    throw new Error('HOUSEHOLD_ID must be 3-64 lowercase letters, numbers, underscores, or hyphens')
  }
  return householdId
}

export function makePartitionKeyForHousehold(
  householdId: string,
  mode: HouseholdPartitionMode,
  legacyUserId = USER_ID
) {
  return mode === 'household' ? makeHouseholdPK(householdId) : makePK(legacyUserId)
}

export function makeAuthenticatedHousehold(
  env: Record<string, string | undefined> = process.env
): AuthenticatedHousehold {
  const householdId = getConfiguredHouseholdId(env)
  const partitionMode = parseHouseholdPartitionMode(env.HOUSEHOLD_PARTITION_MODE)
  return {
    householdId,
    partitionMode,
    partitionKey: makePartitionKeyForHousehold(householdId, partitionMode, env.USER_ID || USER_ID),
  }
}

interface ResolveHouseholdDependencies {
  getMembershipsBySubject?: typeof getHouseholdMembershipsBySubject
  readSession?: typeof readWebSessionToken
}

export async function resolveRequestHousehold(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  dependencies: ResolveHouseholdDependencies = {}
): Promise<AuthenticatedHousehold> {
  if (getWebAuthMode(env) === 'mvp') {
    if (!(await isMvpRequestAuthorized(request, env))) throw new HouseholdAuthError()
    return makeAuthenticatedHousehold(env)
  }

  if (parseHouseholdPartitionMode(env.HOUSEHOLD_PARTITION_MODE) !== 'household') {
    throw new HouseholdAuthError('現在ログインを利用できません。管理者へご連絡ください。', 503)
  }

  const readSession = dependencies.readSession ?? readWebSessionToken
  const session = await readSession(
    readCookie(request.headers.get('cookie'), WEB_SESSION_COOKIE),
    env
  )
  if (!session) throw new HouseholdAuthError()

  let memberships
  try {
    const lookup = dependencies.getMembershipsBySubject ?? getHouseholdMembershipsBySubject
    memberships = await lookup(session.subject)
  } catch {
    throw new HouseholdAuthError('現在ログインを利用できません。管理者へご連絡ください。', 503)
  }

  const active = memberships.filter((membership) => membership.status === 'active')
  if (active.length !== 1) {
    throw new HouseholdAuthError('このアカウントでは現在記録を利用できません', 403)
  }

  return makeAuthenticatedHousehold({
    ...env,
    HOUSEHOLD_ID: active[0].householdId,
    HOUSEHOLD_PARTITION_MODE: 'household',
  })
}

export function unauthorizedHouseholdResponse(error: unknown) {
  if (!(error instanceof HouseholdAuthError)) return null
  return Response.json(
    { error: error.message },
    { status: error.status, headers: { 'Cache-Control': 'no-store' } }
  )
}
