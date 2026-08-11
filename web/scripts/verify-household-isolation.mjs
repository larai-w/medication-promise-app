import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const baseUrl = process.env.MP_BASE_URL?.replace(/\/$/, '')
const cookieA = process.env.MP_COOKIE_A
const cookieB = process.env.MP_COOKIE_B
const allowSettingsMutation = process.env.MP_ALLOW_SETTINGS_MUTATION === 'true'

if (!baseUrl || !cookieA || !cookieB) {
  throw new Error('MP_BASE_URL, MP_COOKIE_A, and MP_COOKIE_B are required')
}
if (!baseUrl.startsWith('https://') && !baseUrl.startsWith('http://localhost:')) {
  throw new Error('MP_BASE_URL must use HTTPS (localhost is allowed for local verification)')
}
if (!allowSettingsMutation) {
  throw new Error('Use two dedicated synthetic households and set MP_ALLOW_SETTINGS_MUTATION=true')
}

const runId = randomUUID()
const date = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())
const markerA = `SYNTHETIC-A-${runId}`
const markerB = `SYNTHETIC-B-${runId}`

async function api(path, cookie, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Cookie: cookie,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    redirect: 'manual',
  })
  return response
}

async function json(path, cookie, init = {}, expectedStatus = 200) {
  const response = await api(path, cookie, init)
  assert.equal(response.status, expectedStatus, `${init.method ?? 'GET'} ${path}`)
  return response.json()
}

async function createRecord(cookie, marker, time) {
  return json('/api/records', cookie, {
    method: 'POST',
    body: JSON.stringify({ date, time, timing: '朝', notes: marker }),
  }, 201)
}

async function deleteRecord(cookie, id, expectedStatus = 200) {
  return api(`/api/records/${encodeURIComponent(id)}`, cookie, { method: 'DELETE' })
    .then((response) => {
      assert.equal(response.status, expectedStatus, `DELETE record expected ${expectedStatus}`)
      return response
    })
}

function syntheticSettings(marker) {
  return {
    medicationName: marker,
    reminderSchedule: [
      { timing: '朝', time: '08:00' },
      { timing: '昼', time: '12:00' },
      { timing: '晩', time: '18:00' },
      { timing: '夜8時', time: '20:00' },
      { timing: '夜9時', time: '21:00' },
    ],
  }
}

let recordA
let recordB
let originalSettingsA
let originalSettingsB

try {
  originalSettingsA = await json('/api/settings', cookieA)
  originalSettingsB = await json('/api/settings', cookieB)

  recordA = await createRecord(cookieA, markerA, '08:01')
  recordB = await createRecord(cookieB, markerB, '08:02')

  const recordsA = await json(`/api/records?date=${date}&householdId=household-b`, cookieA)
  const recordsB = await json(`/api/records?date=${date}&householdId=household-a`, cookieB)
  assert(recordsA.some((record) => record.notes === markerA), 'household A cannot read its record')
  assert(!recordsA.some((record) => record.notes === markerB), 'household A read household B data')
  assert(recordsB.some((record) => record.notes === markerB), 'household B cannot read its record')
  assert(!recordsB.some((record) => record.notes === markerA), 'household B read household A data')

  await json(`/api/records/${encodeURIComponent(recordB.id)}`, cookieA, {
    method: 'PUT',
    body: JSON.stringify({ notes: `${markerB}-CROSS-WRITE` }),
  }, 404)
  await deleteRecord(cookieA, recordB.id, 404)

  const exportA = await json(`/api/records/export?from=${date}&to=${date}`, cookieA)
  const exportB = await json(`/api/records/export?from=${date}&to=${date}`, cookieB)
  const serializedA = JSON.stringify(exportA)
  const serializedB = JSON.stringify(exportB)
  assert(serializedA.includes(markerA), 'household A export omitted its synthetic record')
  assert(!serializedA.includes(markerB), 'household A export contained household B data')
  assert(serializedB.includes(markerB), 'household B export omitted its synthetic record')
  assert(!serializedB.includes(markerA), 'household B export contained household A data')

  await json('/api/settings', cookieA, {
    method: 'PUT',
    body: JSON.stringify(syntheticSettings(markerA)),
  })
  await json('/api/settings', cookieB, {
    method: 'PUT',
    body: JSON.stringify(syntheticSettings(markerB)),
  })
  const settingsA = await json('/api/settings?householdId=household-b', cookieA)
  const settingsB = await json('/api/settings?householdId=household-a', cookieB)
  assert.equal(settingsA.medicationName, markerA)
  assert.equal(settingsB.medicationName, markerB)

  console.log('Household isolation verification passed for records, mutations, export, and settings.')
} finally {
  const cleanup = []
  if (recordA?.id) cleanup.push(deleteRecord(cookieA, recordA.id))
  if (recordB?.id) cleanup.push(deleteRecord(cookieB, recordB.id))
  if (originalSettingsA) {
    cleanup.push(json('/api/settings', cookieA, {
      method: 'PUT',
      body: JSON.stringify(originalSettingsA),
    }))
  }
  if (originalSettingsB) {
    cleanup.push(json('/api/settings', cookieB, {
      method: 'PUT',
      body: JSON.stringify(originalSettingsB),
    }))
  }
  await Promise.allSettled(cleanup)
}
