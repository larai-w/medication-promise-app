import assert from 'node:assert/strict'
import test from 'node:test'
import {
  makePdfHandler,
  makeRecordItemHandlers,
  makeRecordsHandlers,
  makeSettingsHandlers,
} from '../src/lib/api-handlers.ts'
import { encodeSK } from '../src/lib/dynamodb.ts'
import { HouseholdAuthError, makeAuthenticatedHousehold } from '../src/lib/household.ts'

const householdA = makeAuthenticatedHousehold({
  HOUSEHOLD_ID: 'household-a',
  HOUSEHOLD_PARTITION_MODE: 'household',
})

const record = {
  id: 'synthetic-id',
  userId: 'household-a',
  date: '2035-01-15',
  time: '08:00',
  timing: '朝' as const,
  source: 'manual' as const,
  createdAt: '2035-01-15T00:00:00.000Z',
}

const settings = {
  medicationName: 'テスト用のお薬',
  reminderSchedule: [
    { timing: '朝' as const, time: '08:00' },
    { timing: '昼' as const, time: '12:00' },
    { timing: '晩' as const, time: '18:00' },
    { timing: '夜8時' as const, time: '20:00' },
    { timing: '夜9時' as const, time: '21:00' },
  ],
}

test('record list and create handlers ignore client household parameters', async () => {
  const seen: string[] = []
  const handlers = makeRecordsHandlers({
    resolveHousehold: async () => householdA,
    listRecords: async (household) => {
      seen.push(`list:${household.partitionKey}`)
      return [record]
    },
    createRecord: async (household) => {
      seen.push(`create:${household.partitionKey}`)
      return record
    },
  })

  await handlers.GET(new Request(
    'https://example.test/api/records?date=2035-01-15&householdId=household-b'
  ))
  await handlers.POST(new Request('https://example.test/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2035-01-15', time: '08:00', timing: '朝' }),
  }))

  assert.deepEqual(seen, [
    'list:HOUSEHOLD#household-a',
    'create:HOUSEHOLD#household-a',
  ])
})

test('record update and delete handlers use only the resolved household partition', async () => {
  const seen: string[] = []
  const handlers = makeRecordItemHandlers({
    resolveHousehold: async () => householdA,
    updateRecord: async (household) => {
      seen.push(`update:${household.partitionKey}`)
      return record
    },
    deleteRecord: async (household) => {
      seen.push(`delete:${household.partitionKey}`)
      return { success: true }
    },
  })
  const id = encodeSK('RECORD#2035-01-15T08:00:00#123e4567-e89b-12d3-a456-426614174000')
  const params = { params: Promise.resolve({ id }) }

  await handlers.PUT(new Request('https://example.test/api/records/id', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'SYNTHETIC_NOTE' }),
  }), params)
  await handlers.DELETE(new Request('https://example.test/api/records/id', {
    method: 'DELETE',
  }), params)

  assert.deepEqual(seen, [
    'update:HOUSEHOLD#household-a',
    'delete:HOUSEHOLD#household-a',
  ])
})

test('PDF and settings handlers receive only the resolved household', async () => {
  const seen: string[] = []
  const pdfHandler = makePdfHandler({
    resolveHousehold: async () => householdA,
    listRecords: async (household) => {
      seen.push(`pdf:${household.partitionKey}`)
      return [record]
    },
    renderPdf: async () => new TextEncoder().encode('synthetic-pdf'),
  })
  const settingsHandlers = makeSettingsHandlers({
    resolveHousehold: async () => householdA,
    getSettings: async (household) => {
      seen.push(`settings-get:${household.partitionKey}`)
      return settings
    },
    putSettings: async (_input, household) => {
      seen.push(`settings-put:${household.partitionKey}`)
      return settings
    },
  })

  await pdfHandler(new Request('https://example.test/api/records/pdf?month=2035-01'))
  await settingsHandlers.GET(new Request('https://example.test/api/settings'))
  await settingsHandlers.PUT(new Request('https://example.test/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }))

  assert.deepEqual(seen, [
    'pdf:HOUSEHOLD#household-a',
    'settings-get:HOUSEHOLD#household-a',
    'settings-put:HOUSEHOLD#household-a',
  ])
})

test('API handlers fail before data access when household authentication fails', async () => {
  let dataAccessed = false
  const handlers = makeRecordsHandlers({
    resolveHousehold: async () => { throw new HouseholdAuthError() },
    listRecords: async () => {
      dataAccessed = true
      return []
    },
  })

  const response = await handlers.GET(
    new Request('https://example.test/api/records?date=2035-01-15')
  )
  assert.equal(response.status, 401)
  assert.equal(dataAccessed, false)
})

test('a deletion lock makes every household mutation fail closed', async () => {
  const transactionCanceled = () => {
    const error = new Error('synthetic transaction cancellation')
    error.name = 'TransactionCanceledException'
    throw error
  }
  const records = makeRecordsHandlers({
    resolveHousehold: async () => householdA,
    createRecord: async () => transactionCanceled(),
  })
  const recordItem = makeRecordItemHandlers({
    resolveHousehold: async () => householdA,
    updateRecord: async () => transactionCanceled(),
    deleteRecord: async () => transactionCanceled(),
  })
  const settingsHandlers = makeSettingsHandlers({
    resolveHousehold: async () => householdA,
    putSettings: async () => transactionCanceled(),
  })
  const id = encodeSK('RECORD#2035-01-15T08:00:00#123e4567-e89b-12d3-a456-426614174000')
  const params = { params: Promise.resolve({ id }) }

  const responses = await Promise.all([
    records.POST(new Request('https://example.test/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2035-01-15', time: '08:00', timing: '朝' }),
    })),
    recordItem.PUT(new Request('https://example.test/api/records/id', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'SYNTHETIC_NOTE' }),
    }), params),
    recordItem.DELETE(new Request('https://example.test/api/records/id', {
      method: 'DELETE',
    }), params),
    settingsHandlers.PUT(new Request('https://example.test/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })),
  ])

  for (const response of responses) {
    assert.equal(response.status, 409)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.match((await response.json()).error, /現在この世帯のデータを変更できません/)
  }
})
