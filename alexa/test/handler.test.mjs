import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler, setAllReminders } from '../index.mjs'

function intentEvent(name) {
  return {
    request: { type: 'IntentRequest', intent: { name } },
    context: {
      System: {
        apiEndpoint: 'https://api.amazonalexa.test',
        apiAccessToken: 'test-token',
      },
    },
  }
}

test('morning intent records the expected timing', async () => {
  const recorded = []
  const handler = createHandler({
    recordMedicationFn: async (timing) => recorded.push(timing),
  })

  const response = await handler(intentEvent('RecordMorningIntent'))
  assert.deepEqual(recorded, ['朝'])
  assert.equal(response.response.outputSpeech.text, '朝の服薬を記録しました。')
})

test('night response is supportive without discouraging care', async () => {
  const handler = createHandler({ recordMedicationFn: async () => {} })
  const response = await handler(intentEvent('RecordNightNineIntent'))
  const speech = response.response.outputSpeech.text

  assert.match(speech, /服薬を記録しました/)
  assert.match(speech, /お疲れさまでした/)
  assert.doesNotMatch(speech, /看護師|呼ばず|問題がなければ/)
})

test('reminder permission denial returns an Alexa permission card', async () => {
  const handler = createHandler({
    getMedicationSettingsFn: async () => ({}),
    fetchFn: async () => new Response('', { status: 403 }),
  })
  const response = await handler(intentEvent('SetRemindersIntent'))

  assert.equal(response.response.card.type, 'AskForPermissionsConsent')
  assert.deepEqual(response.response.card.permissions, ['alexa::alerts:reminders:skill:readwrite'])
})

test('reminders are replaced with generic, configurable messages', async () => {
  const calls = []
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, init })
    if (!init.method) {
      return Response.json({ alerts: [{ alertToken: 'old-reminder' }] })
    }
    return new Response('', { status: 200 })
  }
  const handler = createHandler({
    fetchFn,
    getMedicationSettingsFn: async () => ({}),
    env: {
      REMINDER_SCHEDULE_JSON: JSON.stringify([
        { timing: '朝', hour: 7, min: 30 },
        { timing: '夜9時', hour: 22, min: 0 },
      ]),
    },
  })

  const response = await handler(intentEvent('SetRemindersIntent'))
  const createCalls = calls.filter(({ init }) => init.method === 'POST')
  assert.equal(createCalls.length, 2)
  assert.equal(calls.filter(({ init }) => init.method === 'DELETE').length, 1)
  assert.match(response.response.outputSpeech.text, /2つの服薬リマインダー/)

  for (const { init } of createCalls) {
    const body = JSON.parse(init.body)
    const text = body.alertInfo.spokenInfo.content[0].text
    assert.doesNotMatch(text, /お薬A/)
  }
})

test('reminders use stored settings from DynamoDB when present', async () => {
  const calls = []
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, init })
    if (!init.method) return Response.json({ alerts: [] })
    return new Response('', { status: 200 })
  }
  const handler = createHandler({
    fetchFn,
    getMedicationSettingsFn: async () => ({
      medicationName: 'お薬A',
      reminderSchedule: [
        { timing: '朝', time: '08:15' },
        { timing: '夜9時', time: '22:00' },
      ],
    }),
  })

  const response = await handler(intentEvent('SetRemindersIntent'))
  const createCalls = calls.filter(({ init }) => init.method === 'POST')

  assert.equal(createCalls.length, 2)
  assert.match(response.response.outputSpeech.text, /朝8時15分、夜9時22時/)
  assert.match(JSON.parse(createCalls[0].init.body).alertInfo.spokenInfo.content[0].text, /お薬A/)
})

test('creates all scheduled reminders concurrently after deleting old reminders', async () => {
  let postCount = 0
  let releasePosts
  const postsReleased = new Promise((resolve) => {
    releasePosts = resolve
  })
  const fetchFn = async (url, init = {}) => {
    if (!init.method) return Response.json({ alerts: [] })
    if (init.method === 'POST') {
      postCount += 1
      await postsReleased
    }
    return new Response('', { status: 200 })
  }
  const schedule = [
    { timing: '朝', hour: 8, min: 0 },
    { timing: '昼', hour: 12, min: 0 },
    { timing: '晩', hour: 18, min: 0 },
    { timing: '夜8時', hour: 20, min: 0 },
    { timing: '夜9時', hour: 21, min: 0 },
  ]

  const operation = setAllReminders(
    'https://api.amazonalexa.test',
    'test-token',
    schedule,
    '',
    fetchFn
  )
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(postCount, schedule.length)
  releasePosts()
  await operation
})
