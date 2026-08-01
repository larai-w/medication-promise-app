import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getConfiguredHouseholdId,
  makeAuthenticatedHousehold,
  makePartitionKeyForHousehold,
  parseHouseholdPartitionMode,
  resolveRequestHousehold,
} from '../src/lib/household.ts'
import { createWebSessionToken, WEB_SESSION_COOKIE } from '../src/lib/cognito-session.ts'

const cognitoEnv = {
  WEB_AUTH_MODE: 'cognito',
  HOUSEHOLD_PARTITION_MODE: 'household',
  MVP_SESSION_SECRET: 'a-session-secret-that-is-longer-than-thirty-two-characters',
}

test('household partition mode defaults to the current legacy user partition', () => {
  const household = makeAuthenticatedHousehold({
    HOUSEHOLD_ID: 'owner-household',
    USER_ID: 'default-user',
  })

  assert.deepEqual(household, {
    householdId: 'owner-household',
    partitionMode: 'legacy-user',
    partitionKey: 'USER#default-user',
  })
})

test('household partition mode derives a tenant-scoped DynamoDB partition key', () => {
  const household = makeAuthenticatedHousehold({
    HOUSEHOLD_ID: 'household-a',
    USER_ID: 'default-user',
    HOUSEHOLD_PARTITION_MODE: 'household',
  })

  assert.deepEqual(household, {
    householdId: 'household-a',
    partitionMode: 'household',
    partitionKey: 'HOUSEHOLD#household-a',
  })
  assert.notEqual(household.partitionKey, makePartitionKeyForHousehold('household-b', 'household'))
})

test('household IDs and partition modes are validated before data access', () => {
  assert.equal(getConfiguredHouseholdId({ HOUSEHOLD_ID: 'beta_family-01' }), 'beta_family-01')
  assert.throws(() => getConfiguredHouseholdId({ HOUSEHOLD_ID: 'Family 01' }), /HOUSEHOLD_ID/)
  assert.throws(() => parseHouseholdPartitionMode('public'), /HOUSEHOLD_PARTITION_MODE/)
})

test('Cognito session resolves exactly one active membership on every request', async () => {
  const token = await createWebSessionToken('provider-user-a', cognitoEnv)
  const request = new Request('https://example.test/api/records', {
    headers: { cookie: `${WEB_SESSION_COOKIE}=${token}` },
  })
  const household = await resolveRequestHousehold(request, cognitoEnv, {
    getMembershipsBySubject: async (subject) => {
      assert.equal(subject, 'provider-user-a')
      return [{ householdId: 'household-a', status: 'active' }]
    },
  })

  assert.deepEqual(household, {
    householdId: 'household-a',
    partitionMode: 'household',
    partitionKey: 'HOUSEHOLD#household-a',
  })
})

test('Cognito household resolution fails closed for missing and ambiguous membership', async () => {
  const token = await createWebSessionToken('provider-user-a', cognitoEnv)
  const request = new Request('https://example.test/api/records', {
    headers: { cookie: `${WEB_SESSION_COOKIE}=${token}` },
  })

  await assert.rejects(
    resolveRequestHousehold(new Request('https://example.test/api/records'), cognitoEnv),
    (error: unknown) => error instanceof Error && error.name === 'HouseholdAuthError'
  )
  await assert.rejects(
    resolveRequestHousehold(request, cognitoEnv, {
      getMembershipsBySubject: async () => [
        { householdId: 'household-a', status: 'active' },
        { householdId: 'household-b', status: 'active' },
      ],
    }),
    (error: unknown) => (
      error instanceof Error
      && error.name === 'HouseholdAuthError'
      && (error as Error & { status: number }).status === 403
    )
  )
})
