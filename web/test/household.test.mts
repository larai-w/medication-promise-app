import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getConfiguredHouseholdId,
  makeAuthenticatedHousehold,
  makePartitionKeyForHousehold,
  parseHouseholdPartitionMode,
} from '../src/lib/household.ts'

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
