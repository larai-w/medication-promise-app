import assert from 'node:assert/strict'
import test from 'node:test'
import { QueryCommand, type QueryCommandInput, type QueryCommandOutput } from '@aws-sdk/lib-dynamodb'
import type { MedicationPromiseExport } from '../src/lib/care-event-export.ts'
import { makeCareEventExportHandler } from '../src/lib/api-handlers.ts'
import { listRecordsForHousehold, listDailyConditionsForHousehold } from '../src/lib/household-records.ts'
import { makeAuthenticatedHousehold } from '../src/lib/household.ts'

const household = makeAuthenticatedHousehold({ HOUSEHOLD_ID: 'synthetic-h1', HOUSEHOLD_PARTITION_MODE: 'household' })
const request = () => new Request('https://synthetic.invalid/api/records/export?from=2035-01-01&to=2035-01-31')
const record = (n: number) => ({ PK: household.partitionKey, SK: `RECORD#2035-01-15T08:0${n}:00#synthetic-${n}`,
  userId: 'synthetic-h1', date: '2035-01-15', time: `08:0${n}`, timing: '朝', source: 'manual', createdAt: '2035-01-15T00:00:00Z' })
const wellness = (n: number) => ({ PK: household.partitionKey, SK: `WELLNESS#2035-01-1${n}`,
  date: `2035-01-1${n}`, score: 4, observedAt: '2035-01-15T00:00:00Z' })

for (const kind of ['records','wellness']) {
  const makeRow = kind === 'records' ? record : wellness
  function makeHandler(pages: (Pick<QueryCommandOutput, 'Items' | 'LastEvaluatedKey'> | Error)[]) {
    const calls: QueryCommandInput[] = []
    const client = { async send(command: unknown) {
      assert.ok(command instanceof QueryCommand)
      assert.equal(command.constructor.name, 'QueryCommand')
      const values = command.input.ExpressionAttributeValues
      assert.ok(values)
      assert.ok(typeof values[':from'] === 'string')
      assert.equal(values[':pk'], household.partitionKey)
      const relevant = values[':from'].startsWith(kind === 'records' ? 'RECORD#' : 'WELLNESS#')
      if (!relevant) return { Items: [] }
      calls.push(structuredClone(command.input))
      const page = pages[calls.length-1]
      assert.ok(page, 'unexpected query past supplied pages')
      if (page instanceof Error) throw page
      return page
    } }
    const handler = makeCareEventExportHandler({ resolveHousehold: async () => household,
      listRecords: (h,q) => listRecordsForHousehold(h,q,client),
      listConditions: (h,q) => listDailyConditionsForHousehold(h,q,client),
    })
    return { calls, handler }
  }
  for (const emptyFirst of [false,true]) {
    test(`${kind}: export follows continuation ${emptyFirst ? 'after an empty page' : 'without truncation'} and preserves query/order`, async () => {
      const cursor = { PK: household.partitionKey, SK: makeRow(1).SK }
      const { calls,handler } = makeHandler([
        { Items: emptyFirst ? [] : [makeRow(1)], LastEvaluatedKey: cursor },
        { Items: [makeRow(2)] },
      ])
      const response = await handler(request())
      assert.equal(response.status,200)
      const body: MedicationPromiseExport = await response.json()
      const result = kind === 'records' ? body.records : body.dailyConditions
      assert.equal(result.length,emptyFirst ? 1 : 2)
      const exportedValues = kind === 'records'
        ? body.records.map((item) => item.payload.actualTime)
        : body.dailyConditions.map((item) => item.date)
      assert.deepEqual(exportedValues,
        emptyFirst ? [kind === 'records' ? '08:02' : '2035-01-12'] :
        kind === 'records' ? ['08:01','08:02'] : ['2035-01-11','2035-01-12'])
      assert.equal(calls.length,2)
      assert.equal(calls[0].ExclusiveStartKey,undefined)
      assert.deepEqual(calls[1].ExclusiveStartKey,cursor)
      const firstQuery = structuredClone(calls[0])
      const secondQuery = structuredClone(calls[1])
      delete firstQuery.ExclusiveStartKey
      delete secondQuery.ExclusiveStartKey
      assert.deepEqual(firstQuery,secondQuery)
      assert.equal(firstQuery.ScanIndexForward,true)
    })
  }
  test(`${kind}: a later-page failure aborts export instead of returning partial data`, async () => {
    const { handler } = makeHandler([
      { Items: [makeRow(1)], LastEvaluatedKey: { PK: household.partitionKey, SK: makeRow(1).SK } },
      new Error('SYNTHETIC_LATER_PAGE_FAILURE'),
    ])
    await assert.rejects(handler(request()),/SYNTHETIC_LATER_PAGE_FAILURE/)
  })
  test(`${kind}: repeated continuation aborts instead of looping or returning duplicates`, async () => {
    const cursor = { PK: household.partitionKey, SK: makeRow(1).SK }
    const { calls,handler } = makeHandler([
      { Items: [makeRow(1)], LastEvaluatedKey: cursor },
      { Items: [makeRow(2)], LastEvaluatedKey: { SK: cursor.SK, PK: cursor.PK } },
    ])
    await assert.rejects(handler(request()),/repeated.*cursor/i)
    assert.equal(calls.length,2)
  })
}
