import assert from 'node:assert/strict'
import test from 'node:test'
import { getHouseholdMembershipsBySubject } from '../dynamodb.mjs'

// Synthetic provider subject only — never a real Amazon account identifier.
const SUBJECT_A = 'provider-user-a'

function fakeClient(items) {
  const sent = []
  return {
    sent,
    async send(command) {
      sent.push(command.input)
      return { Items: items }
    },
  }
}

test('queries the linked subject partition for membership items', async () => {
  const client = fakeClient([{ SK: 'MEMBERSHIP#household-a', householdId: 'household-a', status: 'active' }])
  const memberships = await getHouseholdMembershipsBySubject(SUBJECT_A, { client })

  assert.equal(client.sent[0].ExpressionAttributeValues[':pk'], 'USER#provider-user-a')
  assert.equal(client.sent[0].ExpressionAttributeValues[':prefix'], 'MEMBERSHIP#')
  assert.deepEqual(memberships, [{ householdId: 'household-a', status: 'active' }])
})

test('derives householdId from the SK when the attribute is absent', async () => {
  const client = fakeClient([{ SK: 'MEMBERSHIP#household-b' }])
  const memberships = await getHouseholdMembershipsBySubject(SUBJECT_A, { client })
  assert.deepEqual(memberships, [{ householdId: 'household-b', status: undefined }])
})

test('returns every membership so the caller can detect ambiguity', async () => {
  const client = fakeClient([
    { SK: 'MEMBERSHIP#household-a', householdId: 'household-a', status: 'active' },
    { SK: 'MEMBERSHIP#household-b', householdId: 'household-b', status: 'active' },
  ])
  const memberships = await getHouseholdMembershipsBySubject(SUBJECT_A, { client })
  assert.equal(memberships.length, 2)
})

test('no membership items resolve to an empty list (not an error)', async () => {
  const client = fakeClient(undefined)
  const memberships = await getHouseholdMembershipsBySubject(SUBJECT_A, { client })
  assert.deepEqual(memberships, [])
})

test('ignores malformed items with no resolvable householdId', async () => {
  const client = fakeClient([{ SK: 'NOT_A_MEMBERSHIP' }, { SK: 'MEMBERSHIP#household-a' }])
  const memberships = await getHouseholdMembershipsBySubject(SUBJECT_A, { client })
  assert.deepEqual(memberships, [{ householdId: 'household-a', status: undefined }])
})

test('requires a provider subject', async () => {
  await assert.rejects(getHouseholdMembershipsBySubject('', { client: fakeClient([]) }))
})

test('composes with resolveAlexaHousehold as the membership lookup', async () => {
  // The adapter output shape must feed resolveAlexaHousehold unchanged.
  const { resolveAlexaHousehold } = await import('../household.mjs')
  const client = fakeClient([{ SK: 'MEMBERSHIP#household-a', householdId: 'household-a', status: 'active' }])

  const household = await resolveAlexaHousehold(
    { context: { System: { user: { accessToken: 'good' } } } },
    {
      verifyLinkedToken: async () => ({ subject: SUBJECT_A }),
      getMembershipsBySubject: (subject) => getHouseholdMembershipsBySubject(subject, { client }),
    }
  )

  assert.equal(household.partitionKey, 'HOUSEHOLD#household-a')
})
