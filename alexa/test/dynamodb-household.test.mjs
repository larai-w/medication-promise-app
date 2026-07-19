import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getMedicationSettingsForHousehold,
  recordMedicationForHousehold,
} from '../dynamodb.mjs'

// Synthetic household only — never a real household id or the legacy partition.
const HOUSEHOLD = { householdId: 'household-a', partitionKey: 'HOUSEHOLD#household-a' }

// Minimal fake that captures the command input the way the AWS SDK would see it.
function fakeClient(getItem) {
  const sent = []
  return {
    sent,
    async send(command) {
      sent.push(command.input)
      if (command.input?.Key) return { Item: getItem ? getItem(command.input) : undefined }
      return {}
    },
  }
}

test('recordMedicationForHousehold writes into the household partition, not the legacy one', async () => {
  const client = fakeClient()
  const result = await recordMedicationForHousehold(HOUSEHOLD, '朝', { client })

  assert.equal(client.sent.length, 1)
  const { Item } = client.sent[0]
  assert.equal(Item.PK, 'HOUSEHOLD#household-a')
  assert.equal(Item.userId, 'household-a')
  assert.equal(Item.timing, '朝')
  assert.equal(Item.source, 'alexa')
  assert.match(Item.SK, /^RECORD#\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00#/)
  assert.doesNotMatch(Item.PK, /USER#default-user/)
  assert.equal(result.timing, '朝')
})

test('getMedicationSettingsForHousehold reads from the household partition', async () => {
  const client = fakeClient(() => ({
    medicationName: 'お薬A',
    reminderSchedule: [{ timing: '朝', time: '08:15' }],
  }))
  const settings = await getMedicationSettingsForHousehold(HOUSEHOLD, { client })

  assert.equal(client.sent[0].Key.PK, 'HOUSEHOLD#household-a')
  assert.equal(client.sent[0].Key.SK, 'SETTINGS#medication')
  assert.equal(settings.medicationName, 'お薬A')
  assert.deepEqual(settings.reminderSchedule, [{ timing: '朝', time: '08:15' }])
})

test('missing settings item resolves to an empty object', async () => {
  const client = fakeClient(() => undefined)
  const settings = await getMedicationSettingsForHousehold(HOUSEHOLD, { client })
  assert.deepEqual(settings, {})
})

test('household-scoped helpers refuse an unresolved household', async () => {
  const client = fakeClient()
  await assert.rejects(recordMedicationForHousehold(undefined, '朝', { client }))
  await assert.rejects(getMedicationSettingsForHousehold({}, { client }))
  assert.equal(client.sent.length, 0)
})
