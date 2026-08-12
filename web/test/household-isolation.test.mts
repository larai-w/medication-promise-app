import assert from 'node:assert/strict'
import test from 'node:test'
import { encodeSK } from '../src/lib/dynamodb.ts'
import { makeAuthenticatedHousehold } from '../src/lib/household.ts'
import {
  createRecordForHousehold,
  deleteRecordForHousehold,
  listRecordsForHousehold,
  updateRecordForHousehold,
} from '../src/lib/household-records.ts'
import { getMedicationSettings, putMedicationSettings } from '../src/lib/settings-store.ts'

function captureClient(result: Record<string, unknown> = {}) {
  const calls: unknown[] = []
  return {
    calls,
    async send(command: unknown) {
      calls.push(command)
      return result
    },
  }
}

const householdA = {
  ...makeAuthenticatedHousehold({
    HOUSEHOLD_ID: 'household-a',
    HOUSEHOLD_PARTITION_MODE: 'household',
    USER_ID: 'default-user',
  }),
  providerSubject: 'provider-user-a',
}

const householdB = {
  ...makeAuthenticatedHousehold({
    HOUSEHOLD_ID: 'household-b',
    HOUSEHOLD_PARTITION_MODE: 'household',
    USER_ID: 'default-user',
  }),
  providerSubject: 'provider-user-b',
}

test('records queries use the authenticated household partition', async () => {
  const clientA = captureClient({ Items: [] })
  const clientB = captureClient({ Items: [] })

  await listRecordsForHousehold(householdA, { date: '2026-07-19' }, clientA)
  await listRecordsForHousehold(householdB, { from: '2026-07-01', to: '2026-07-31' }, clientB)

  const queryA = clientA.calls[0] as { input: { ExpressionAttributeValues: Record<string, string> } }
  const queryB = clientB.calls[0] as { input: { ExpressionAttributeValues: Record<string, string> } }

  assert.equal(queryA.input.ExpressionAttributeValues[':pk'], 'HOUSEHOLD#household-a')
  assert.equal(queryB.input.ExpressionAttributeValues[':pk'], 'HOUSEHOLD#household-b')
  assert.notEqual(queryA.input.ExpressionAttributeValues[':pk'], queryB.input.ExpressionAttributeValues[':pk'])
})

test('record mutations stay within each household partition', async () => {
  const createClient = captureClient({ Attributes: { PK: 'HOUSEHOLD#household-a' } })
  const updateClient = captureClient({
    Item: {
      PK: 'HOUSEHOLD#household-a',
      SK: 'RECORD#2026-07-19T08:00:00#abc',
      userId: 'household-a',
      date: '2026-07-19',
      time: '08:00',
      timing: '朝',
      source: 'manual',
      notes: 'done',
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
    },
  })
  const deleteClient = captureClient({})

  await createRecordForHousehold(householdA, { date: '2026-07-19', time: '08:00', timing: '朝' }, createClient)
  await updateRecordForHousehold(householdA, encodeSK('RECORD#2026-07-19T08:00:00#abc'), { notes: 'done' }, updateClient)
  await deleteRecordForHousehold(householdB, encodeSK('RECORD#2026-07-19T08:00:00#abc'), deleteClient)

  const createCall = createClient.calls[0] as { input: { TransactItems: Array<Record<string, unknown>> } }
  const updateCall = updateClient.calls[0] as { input: { TransactItems: Array<Record<string, unknown>> } }
  const deleteCall = deleteClient.calls[0] as { input: { TransactItems: Array<Record<string, unknown>> } }
  const createCondition = createCall.input.TransactItems[0].ConditionCheck as {
    Key: { PK: string; SK: string }
    ConditionExpression: string
  }
  const createPut = createCall.input.TransactItems[1].Put as { Item: { PK: string; userId: string } }
  const updateMutation = updateCall.input.TransactItems[1].Update as { Key: { PK: string } }
  const deleteMutation = deleteCall.input.TransactItems[1].Delete as { Key: { PK: string } }

  assert.equal(createCondition.Key.PK, 'USER#provider-user-a')
  assert.equal(createCondition.Key.SK, 'MEMBERSHIP#household-a')
  assert.match(createCondition.ConditionExpression, /#status = :active/)
  assert.equal(createPut.Item.PK, 'HOUSEHOLD#household-a')
  assert.equal(createPut.Item.userId, 'household-a')
  assert.equal(updateMutation.Key.PK, 'HOUSEHOLD#household-a')
  assert.equal(deleteMutation.Key.PK, 'HOUSEHOLD#household-b')
})

test('settings reads and writes stay within each household partition', async () => {
  const getClient = captureClient({ Item: undefined })
  const putClient = captureClient({})

  await getMedicationSettings(householdA, getClient)
  await putMedicationSettings(
    {
      medicationName: 'お薬A',
      reminderSchedule: [
        { timing: '朝', time: '08:00' },
        { timing: '昼', time: '12:00' },
        { timing: '晩', time: '18:00' },
        { timing: '夜8時', time: '20:00' },
        { timing: '夜9時', time: '21:00' },
      ],
    },
    householdB,
    putClient
  )

  const getCall = getClient.calls[0] as { input: { Key: { PK: string } } }
  const putCall = putClient.calls[0] as { input: { TransactItems: Array<Record<string, unknown>> } }
  const condition = putCall.input.TransactItems[0].ConditionCheck as { Key: { PK: string; SK: string } }
  const mutation = putCall.input.TransactItems[1].Put as { Item: { PK: string; userId: string } }

  assert.equal(getCall.input.Key.PK, 'HOUSEHOLD#household-a')
  assert.equal(condition.Key.PK, 'USER#provider-user-b')
  assert.equal(condition.Key.SK, 'MEMBERSHIP#household-b')
  assert.equal(mutation.Item.PK, 'HOUSEHOLD#household-b')
  assert.equal(mutation.Item.userId, 'household-b')
})

test('household mutations refuse a context without a verified provider subject', async () => {
  const unresolved = makeAuthenticatedHousehold({
    HOUSEHOLD_ID: 'household-a',
    HOUSEHOLD_PARTITION_MODE: 'household',
  })
  const client = captureClient()

  await assert.rejects(
    createRecordForHousehold(
      unresolved,
      { date: '2026-07-19', time: '08:00', timing: '朝' },
      client
    ),
    /verified provider subject/
  )
  assert.equal(client.calls.length, 0)
})

test('legacy development mode keeps its non-membership write path', async () => {
  const legacy = makeAuthenticatedHousehold({
    HOUSEHOLD_ID: 'owner-household',
    HOUSEHOLD_PARTITION_MODE: 'legacy-user',
    USER_ID: 'default-user',
  })
  const client = captureClient()

  await createRecordForHousehold(
    legacy,
    { date: '2026-07-19', time: '08:00', timing: '朝' },
    client
  )

  const command = client.calls[0] as {
    constructor: { name: string }
    input: { Item: { PK: string } }
  }
  assert.equal(command.constructor.name, 'PutCommand')
  assert.equal(command.input.Item.PK, 'USER#default-user')
})
