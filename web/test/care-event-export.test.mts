import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  buildMedicationPromiseExport,
  CareEventExportError,
  toMedicationCareEvent,
} from '../src/lib/care-event-export.ts'
import { makeCareEventExportHandler } from '../src/lib/api-handlers.ts'
import { HouseholdAuthError, makeAuthenticatedHousehold } from '../src/lib/household.ts'
import type { MedicationRecord } from '../src/types/index.ts'
import type { DailyCondition } from '../src/types/index.ts'

const fixtureUrl = new URL('./fixtures/care-event-export-records.synthetic.json', import.meta.url)
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8')) as MedicationRecord[]
const schemaUrl = new URL('../../docs/schemas/medication-promise-export-v1.schema.json', import.meta.url)
const schema = JSON.parse(await readFile(schemaUrl, 'utf8'))

const householdA = makeAuthenticatedHousehold({
  HOUSEHOLD_ID: 'household-a',
  HOUSEHOLD_PARTITION_MODE: 'household',
})

test('builds a deterministic personal-review care-event export from synthetic records', () => {
  const exported = buildMedicationPromiseExport(fixture, new Date('2035-01-16T00:00:00.000Z'))

  assert.equal(exported.schemaVersion, 'medication-promise-export/v1')
  assert.equal(exported.recordCount, 2)
  assert.equal(exported.timezone, 'Asia/Tokyo')
  assert.equal(exported.purpose, 'personal_review')
  assert.deepEqual(exported.records.map((event) => event.missingness), ['observed', 'observed'])
  assert.deepEqual(exported.records.map((event) => event.correction.status), ['original', 'corrected'])
  assert.equal(exported.records[0].occurredAt, '2035-01-15T08:12:00+09:00')
  assert.equal(exported.records[0].payload.scheduledTime, '08:00')
  assert.equal(exported.records[0].payload.notes, '合成データのメモ')
  assert.equal('actorRole' in exported.records[0], false)
  assert.match(exported.records[0].eventId, /^mp-[a-f0-9]{32}$/)
  assert.equal(exported.records[0].eventId, exported.records[0].provenance.sourceRecordId)
})

test('generated export validates against the published Draft 2020-12 schema', () => {
  const ajv = new Ajv2020({ allErrors: true })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  const exported = buildMedicationPromiseExport(fixture, new Date('2035-01-16T00:00:00.000Z'))

  assert.equal(validate(exported), true, JSON.stringify(validate.errors))
  assert.equal(exported.recordCount, exported.records.length)
  assert.deepEqual(exported.dailyConditions, [])
})

test('export includes daily condition scores without household identifiers', () => {
  const condition: DailyCondition = {
    date: '2035-01-15', score: 4, observedAt: '2035-01-15T13:00:00.000Z', recordedAt: '2035-01-15T13:01:00.000Z', note: '合成メモ',
  }
  const exported = buildMedicationPromiseExport(fixture, [condition], new Date('2035-01-16T00:00:00.000Z'))
  assert.deepEqual(exported.dailyConditions, [condition])
  assert.equal(JSON.stringify(exported).includes('HOUSEHOLD#'), false)
})

test('does not export household identifiers, user IDs, credentials, or presentation state', () => {
  const serialized = JSON.stringify(
    buildMedicationPromiseExport(fixture, new Date('2035-01-16T00:00:00.000Z'))
  )

  for (const forbidden of [
    'synthetic-household-a',
    'HOUSEHOLD#',
    'password',
    'token',
    'medicationName',
    'theme',
    'badge',
    'streak',
    'GO!GO!',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `export contained ${forbidden}`)
  }
})

test('does not synthesize missed medication events from absent slots', () => {
  const exported = buildMedicationPromiseExport(fixture.slice(0, 1), new Date('2035-01-16T00:00:00.000Z'))
  assert.equal(exported.recordCount, 1)
  assert.deepEqual(exported.records.map((event) => event.eventType), ['medication_taken'])
})

test('rejects records with invalid provenance timestamps', () => {
  assert.throws(
    () => toMedicationCareEvent({ ...fixture[0], createdAt: 'invalid' }, '2035-01-16T00:00:00.000Z'),
    CareEventExportError
  )
})

test('rejects invalid record dates, timings, sources, and correction timestamps', () => {
  const exportedAt = '2035-01-16T00:00:00.000Z'
  assert.throws(
    () => toMedicationCareEvent({ ...fixture[0], date: '2035-02-30' }, exportedAt),
    CareEventExportError
  )
  assert.throws(
    () => toMedicationCareEvent({ ...fixture[0], timing: '不明' as MedicationRecord['timing'] }, exportedAt),
    CareEventExportError
  )
  assert.throws(
    () => toMedicationCareEvent({ ...fixture[0], source: 'unknown' as MedicationRecord['source'] }, exportedAt),
    CareEventExportError
  )
  assert.throws(
    () => toMedicationCareEvent({ ...fixture[0], updatedAt: 'invalid' }, exportedAt),
    CareEventExportError
  )
})

test('export handler derives scope only from the authenticated household', async () => {
  const seen: string[] = []
  const handler = makeCareEventExportHandler({
    resolveHousehold: async () => householdA,
    listRecords: async (household, query) => {
      seen.push(`${household.partitionKey}:${query.from}:${query.to}`)
      return fixture
    },
    listConditions: async () => [],
    buildExport: (records) => buildMedicationPromiseExport(
      records,
      new Date('2035-01-16T00:00:00.000Z')
    ),
  })

  const response = await handler(new Request(
    'https://example.test/api/records/export?from=2035-01-01&to=2035-01-31&householdId=household-b'
  ))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.match(response.headers.get('content-disposition') ?? '', /medication-promise-2035-01-01-2035-01-31\.json/)
  assert.deepEqual(seen, ['HOUSEHOLD#household-a:2035-01-01:2035-01-31'])
  assert.equal(JSON.stringify(body).includes('household-b'), false)
})

test('export handler fails before data access when authentication fails', async () => {
  let dataAccessed = false
  const handler = makeCareEventExportHandler({
    resolveHousehold: async () => { throw new HouseholdAuthError() },
    listRecords: async () => {
      dataAccessed = true
      return []
    },
  })

  const response = await handler(new Request(
    'https://example.test/api/records/export?from=2035-01-01&to=2035-01-31'
  ))
  assert.equal(response.status, 401)
  assert.equal(dataAccessed, false)
})

test('export handler validates and bounds the requested date range', async () => {
  const handler = makeCareEventExportHandler({ resolveHousehold: async () => householdA })

  assert.equal((await handler(new Request(
    'https://example.test/api/records/export?from=2035-02-01&to=2035-01-01'
  ))).status, 400)
  assert.equal((await handler(new Request(
    'https://example.test/api/records/export?from=2035-01-01&to=2036-01-02'
  ))).status, 400)
})
