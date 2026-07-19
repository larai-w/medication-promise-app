import { isMvpRequestAuthorized } from './mvp-access.ts'
import { USER_ID, makeHouseholdPK, makePK } from './dynamodb.ts'

export type HouseholdPartitionMode = 'legacy-user' | 'household'

export interface AuthenticatedHousehold {
  householdId: string
  partitionKey: string
  partitionMode: HouseholdPartitionMode
}

export class HouseholdAuthError extends Error {
  constructor(message = 'この記録にアクセスするにはログインが必要です') {
    super(message)
    this.name = 'HouseholdAuthError'
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

export async function resolveRequestHousehold(request: Request): Promise<AuthenticatedHousehold> {
  if (!(await isMvpRequestAuthorized(request))) throw new HouseholdAuthError()
  return makeAuthenticatedHousehold()
}

export function unauthorizedHouseholdResponse(error: unknown) {
  if (!(error instanceof HouseholdAuthError)) return null
  return Response.json(
    { error: error.message },
    { status: 401, headers: { 'Cache-Control': 'no-store' } }
  )
}
