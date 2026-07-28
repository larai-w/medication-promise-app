import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler } from '../index.mjs'
import { AlexaHouseholdError } from '../household.mjs'

// Synthetic identities only.
const HOUSEHOLD = { householdId: 'household-a', partitionKey: 'HOUSEHOLD#household-a' }

function linkedIntent(name, accessToken = 'good') {
  return {
    request: { type: 'IntentRequest', intent: { name } },
    context: {
      System: {
        apiEndpoint: 'https://api.amazonalexa.test',
        apiAccessToken: 'test-token',
        user: { accessToken },
      },
    },
  }
}

test('linked mode records into the resolved household, not the legacy path', async () => {
  const recorded = []
  const legacy = []
  const handler = createHandler({
    mode: 'household',
    resolveHouseholdFn: async () => HOUSEHOLD,
    recordMedicationForHouseholdFn: async (household, timing) => recorded.push({ household, timing }),
    recordMedicationFn: async (timing) => legacy.push(timing),
  })

  const response = await handler(linkedIntent('RecordMorningIntent'))
  assert.deepEqual(recorded, [{ household: HOUSEHOLD, timing: '朝' }])
  assert.deepEqual(legacy, []) // legacy writer never called in linked mode
  assert.equal(response.response.outputSpeech.text, '朝の服薬を記録しました。')
})

test('linked mode fails closed and speaks when the household cannot be resolved', async () => {
  const recorded = []
  const handler = createHandler({
    mode: 'household',
    resolveHouseholdFn: async () => {
      throw new AlexaHouseholdError('no-token')
    },
    recordMedicationForHouseholdFn: async (...args) => recorded.push(args),
  })

  const response = await handler(linkedIntent('RecordMorningIntent', undefined))
  assert.equal(recorded.length, 0) // nothing recorded when identity is unresolved
  assert.match(response.response.outputSpeech.text, /アカウントリンク/)
})

test('linked mode reads reminder settings from the resolved household', async () => {
  const seen = []
  const handler = createHandler({
    mode: 'household',
    resolveHouseholdFn: async () => HOUSEHOLD,
    getMedicationSettingsForHouseholdFn: async (household) => {
      seen.push(household)
      return { medicationName: 'お薬A', reminderSchedule: [{ timing: '朝', time: '08:15' }] }
    },
    fetchFn: async (url, init = {}) => {
      if (!init.method) return Response.json({ alerts: [] })
      return new Response('', { status: 200 })
    },
  })

  const response = await handler(linkedIntent('SetRemindersIntent'))
  assert.deepEqual(seen, [HOUSEHOLD])
  assert.match(response.response.outputSpeech.text, /服薬リマインダー/)
})

test('linked mode never falls back to the legacy default-user settings path', async () => {
  // Issue #25: in household mode no record or settings access may touch the
  // legacy USER#default-user helpers. The record side is asserted above; this
  // covers SetRemindersIntent's settings read.
  const legacySettingsCalls = []
  const householdSettingsCalls = []
  const handler = createHandler({
    mode: 'household',
    resolveHouseholdFn: async () => HOUSEHOLD,
    getMedicationSettingsFn: async () => {
      legacySettingsCalls.push('legacy')
      return {}
    },
    getMedicationSettingsForHouseholdFn: async (household) => {
      householdSettingsCalls.push(household)
      return { medicationName: 'お薬A', reminderSchedule: [{ timing: '朝', time: '08:15' }] }
    },
    fetchFn: async (url, init = {}) => {
      if (!init.method) return Response.json({ alerts: [] })
      return new Response('', { status: 200 })
    },
  })

  await handler(linkedIntent('SetRemindersIntent'))
  assert.deepEqual(householdSettingsCalls, [HOUSEHOLD]) // read from the resolved household
  assert.deepEqual(legacySettingsCalls, []) // legacy default-user reader never called
})

test('reminder setup fails closed when the household is unresolved', async () => {
  const handler = createHandler({
    mode: 'household',
    resolveHouseholdFn: async () => {
      throw new AlexaHouseholdError('invalid-token')
    },
  })
  const response = await handler(linkedIntent('SetRemindersIntent'))
  assert.match(response.response.outputSpeech.text, /リンクし直/)
})

test('legacy mode (default) still uses the legacy writer and ignores linking', async () => {
  const recorded = []
  const household = []
  const handler = createHandler({
    recordMedicationFn: async (timing) => recorded.push(timing),
    recordMedicationForHouseholdFn: async (...args) => household.push(args),
    resolveHouseholdFn: async () => {
      throw new Error('resolver must not be called in legacy mode')
    },
  })

  const response = await handler(linkedIntent('RecordLunchIntent'))
  assert.deepEqual(recorded, ['昼'])
  assert.deepEqual(household, [])
  assert.equal(response.response.outputSpeech.text, '昼の服薬を記録しました。')
})
