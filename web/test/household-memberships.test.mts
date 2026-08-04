import assert from 'node:assert/strict'
import test from 'node:test'
import { getHouseholdMembershipsBySubject } from '../src/lib/household-memberships.ts'

function captureClient(items: unknown[] | undefined) {
  const calls: Array<{ input: Record<string, unknown> }> = []
  return {
    calls,
    async send(command: unknown) {
      calls.push(command as { input: Record<string, unknown> })
      return { Items: items }
    },
  }
}

test('membership lookup queries only the verified provider subject partition', async () => {
  const client = captureClient([
    { SK: 'MEMBERSHIP#household-a', householdId: 'household-a', status: 'active' },
  ])
  const memberships = await getHouseholdMembershipsBySubject('provider-user-a', client)
  const values = client.calls[0].input.ExpressionAttributeValues as Record<string, string>

  assert.equal(values[':pk'], 'USER#provider-user-a')
  assert.equal(values[':prefix'], 'MEMBERSHIP#')
  assert.deepEqual(memberships, [{ householdId: 'household-a', status: 'active' }])
})

test('membership lookup retains disabled state and ignores malformed rows', async () => {
  const client = captureClient([
    { SK: 'MEMBERSHIP#household-a', status: 'disabled' },
    { SK: 'OTHER#household-b' },
    { SK: 'MEMBERSHIP#household-a', householdId: 'household-b', status: 'active' },
    { SK: 'MEMBERSHIP#household-c', status: 'pending' },
  ])
  assert.deepEqual(
    await getHouseholdMembershipsBySubject('provider-user-a', client),
    [{ householdId: 'household-a', status: 'disabled' }]
  )
})

test('membership lookup exposes deleting state for idempotent deletion recovery', async () => {
  const client = captureClient([
    { SK: 'MEMBERSHIP#household-a', householdId: 'household-a', status: 'deleting' },
  ])
  assert.deepEqual(
    await getHouseholdMembershipsBySubject('provider-user-a', client),
    [{ householdId: 'household-a', status: 'deleting' }]
  )
})

test('membership lookup rejects a missing or malformed provider subject', async () => {
  await assert.rejects(
    getHouseholdMembershipsBySubject('', captureClient([])),
    /subject/
  )
})
