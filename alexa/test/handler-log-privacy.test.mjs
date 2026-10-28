import assert from 'node:assert/strict'
import test from 'node:test'
import { format } from 'node:util'
import { createHandler } from '../index.mjs'
import { AlexaHouseholdError, HOUSEHOLD_FAILURE } from '../household.mjs'

// Deliberately synthetic values: verify messages, stacks, causes, and SDK fields.
const markers = ['SYNTHETIC_TOKEN_PRIVATE', 'SYNTHETIC_AUTHORIZATION_PRIVATE',
  'SYNTHETIC_HOUSEHOLD_PRIVATE', 'SYNTHETIC_MEDICATION_PRIVATE']
function sensitiveError() {
  const error = new Error(markers.join(' '), { cause: new Error(markers[0]) })
  error.name = markers[1]
  error.stack = markers.join(' ')
  error.request = { authorization: markers[1], householdId: markers[2], medicationName: markers[3] }
  return error
}
function event(name) {
  return {
    request: { type: 'IntentRequest', intent: { name } },
    context: { System: {
      apiEndpoint: 'https://api.amazonalexa.test', apiAccessToken: markers[0],
      user: { accessToken: markers[1] },
    } },
  }
}

for (const mode of ['legacy', 'household']) {
  test(`${mode} recording errors retain the response without logging private error data`, async (t) => {
    const errors = []
    const logs = []
    t.mock.method(console, 'error', (...args) => errors.push(args))
    t.mock.method(console, 'log', (...args) => logs.push(args))
    let writes = 0
    const write = async () => { writes++; throw sensitiveError() }
    const handler = createHandler({ mode,
      resolveHouseholdFn: async () => ({ householdId: markers[2] }),
      recordMedicationFn: write, recordMedicationForHouseholdFn: write,
    })
    const response = await handler(event('RecordMorningIntent'))
    assert.equal(writes, 1)
    assert.equal(response.response.outputSpeech.text,
      '申し訳ありません、記録中にエラーが発生しました。もう一度お試しください。')
    assert.equal(response.response.shouldEndSession, true)
    for (const marker of markers) assert.ok(!format(...errors.flat(), ...logs.flat()).includes(marker))
    assert.deepEqual(errors, [['[MED RECORD FAILED]']])
  })
}

for (const mode of ['legacy', 'household']) for (const failure of ['settings', 'transport', 'response-body']) {
  test(`${mode} reminder ${failure} errors retain the response without logging private error data`, async (t) => {
    const errors = []
    const logs = []
    t.mock.method(console, 'error', (...args) => errors.push(args))
    t.mock.method(console, 'log', (...args) => logs.push(args))
    const calls = []
    const getSettings = async () => {
      if (failure === 'settings') throw sensitiveError()
      return { medicationName: markers[3], reminderSchedule: [{ timing: '朝', time: '08:00' }] }
    }
    const handler = createHandler({ mode, env: {},
      resolveHouseholdFn: async () => ({ householdId: markers[2] }),
      getMedicationSettingsFn: getSettings, getMedicationSettingsForHouseholdFn: getSettings,
      fetchFn: async (_url, init = {}) => {
        calls.push(init.method ?? 'GET')
        if (failure === 'transport') throw sensitiveError()
        if (!init.method) return Response.json({ alerts: [] })
        return new Response(markers.join(' '), { status: 500 })
      },
    })
    const response = await handler(event('SetRemindersIntent'))
    assert.equal(response.response.outputSpeech.text,
      '申し訳ありません、リマインダーの設定中にエラーが発生しました。もう一度お試しください。')
    assert.equal(response.response.shouldEndSession, true)
    assert.deepEqual(calls, failure === 'settings' ? [] : failure === 'transport' ? ['GET'] : ['GET', 'POST'])
    for (const marker of markers) assert.ok(!format(...errors.flat(), ...logs.flat()).includes(marker))
    assert.deepEqual(errors, [['[MED REMINDER SETUP FAILED]']])
  })
}

// This marker includes expected authentication denials, not only operational failures.
for (const reason of [HOUSEHOLD_FAILURE.INVALID_TOKEN, HOUSEHOLD_FAILURE.NO_TOKEN])
for (const intent of ['RecordMorningIntent', 'SetRemindersIntent']) {
  test(`${intent} ${reason} household rejection retains speech, blocks access, and emits only a static marker`, async (t) => {
    const errors = []
    const logs = []
    t.mock.method(console, 'error', (...args) => errors.push(args))
    t.mock.method(console, 'log', (...args) => logs.push(args))
    const error = new AlexaHouseholdError(reason)
    error.message = markers.join(' ')
    error.stack = markers.join(' ')
    error.cause = sensitiveError()
    error.request = { authorization: markers[1], householdId: markers[2] }
    let accesses = 0
    let requests = 0
    const forbiddenAccess = async () => { accesses++; throw new Error('Unexpected data access') }
    const handler = createHandler({ mode: 'household', env: {},
      resolveHouseholdFn: async () => { throw error },
      recordMedicationFn: forbiddenAccess, recordMedicationForHouseholdFn: forbiddenAccess,
      getMedicationSettingsFn: forbiddenAccess, getMedicationSettingsForHouseholdFn: forbiddenAccess,
      fetchFn: async () => { requests++; throw new Error('Unexpected reminder request') },
    })
    const response = await handler(event(intent))
    assert.equal(response.response.outputSpeech.text, error.speech)
    assert.equal(response.response.shouldEndSession, true)
    assert.equal(accesses, 0)
    assert.equal(requests, 0)
    for (const marker of markers) assert.ok(!format(...errors.flat(), ...logs.flat()).includes(marker))
    assert.deepEqual(errors, [['[ALEXA HOUSEHOLD FAILED]']])
  })
}
