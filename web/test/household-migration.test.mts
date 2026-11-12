import assert from 'node:assert/strict'
import test from 'node:test'
import { PutCommand, QueryCommand, type QueryCommandInput, type QueryCommandOutput } from '@aws-sdk/lib-dynamodb'
import {
  buildMigratedItem,
  parseMigrationOptions,
  runMigration,
} from '../scripts/migrate-default-user-to-household.mjs'

test('migration options default to dry-run with the current legacy source', () => {
  assert.deepEqual(parseMigrationOptions([], {}), {
    write: false,
    tableName: 'DrugAndOathRecords',
    region: 'us-east-1',
    sourcePK: 'USER#default-user',
    targetPK: 'HOUSEHOLD#owner-household',
    targetHouseholdId: 'owner-household',
  })
})

test('migration item rewrites only the partition identity fields', () => {
  const item = {
    PK: 'USER#default-user',
    SK: 'RECORD#2026-07-19T08:00:00#record-1',
    userId: 'default-user',
    timing: '朝',
  }

  const migrated = buildMigratedItem(item, 'HOUSEHOLD#household-a', 'household-a')
  assert.equal(migrated.PK, 'HOUSEHOLD#household-a')
  assert.equal(migrated.SK, item.SK)
  assert.equal(migrated.userId, 'household-a')
  assert.equal(migrated.migratedFromPK, 'USER#default-user')
  assert.equal(typeof migrated.migratedAt, 'string')
})

test('dry-run scans source items without writing target items', async () => {
  const calls: unknown[] = []
  const docClient = {
    async send(command: unknown) {
      calls.push(command)
      return { Items: [{ PK: 'USER#default-user', SK: 'SETTINGS#medication' }] }
    },
  }

  const summary = await runMigration(parseMigrationOptions([], {}), docClient)
  assert.equal(summary.mode, 'dry-run')
  assert.equal(summary.scanned, 1)
  assert.equal(summary.copied, 0)
  assert.equal(calls.length, 1)
})


type QueryPage = Pick<QueryCommandOutput, 'Items' | 'LastEvaluatedKey'>
const syntheticOptions = (write = false) => parseMigrationOptions(write ? ['--write'] : [], {
  SOURCE_USER_ID: 'synthetic-source', TARGET_HOUSEHOLD_ID: 'synthetic-target',
  DYNAMODB_TABLE_NAME: 'SyntheticMigrationTable',
})
const syntheticItem = (n: number) => ({
  PK: 'USER#synthetic-source', SK: `RECORD#2035-01-01T08:0${n}:00#synthetic-${n}`,
  userId: 'synthetic-source', timing: '朝',
})
const syntheticCursor = (n: number) => ({ PK: 'USER#synthetic-source', SK: syntheticItem(n).SK })

function mockMigration(pages: (QueryPage | Error)[]) {
  const queries: QueryCommandInput[] = []
  const writes: Record<string, unknown>[] = []
  const operations: string[] = []
  const docClient = {
    async send(command: unknown) {
      if (command instanceof QueryCommand) {
        operations.push('query')
        queries.push(structuredClone(command.input))
        assert.equal(command.input.TableName, 'SyntheticMigrationTable')
        assert.equal(command.input.KeyConditionExpression, 'PK = :pk')
        assert.deepEqual(command.input.ExpressionAttributeValues, { ':pk': 'USER#synthetic-source' })
        const page = pages[queries.length - 1]
        assert.ok(page, 'unexpected extra migration Query')
        if (page instanceof Error) throw page
        return page
      }
      assert.ok(command instanceof PutCommand)
      operations.push('put')
      assert.equal(queries.length, pages.length, 'all source pages must finish before any Put')
      assert.equal(command.input.TableName, 'SyntheticMigrationTable')
      assert.equal(command.input.ConditionExpression, 'attribute_not_exists(PK) AND attribute_not_exists(SK)')
      assert.ok(command.input.Item)
      writes.push(structuredClone(command.input.Item))
      return {}
    },
  }
  return { docClient, queries, writes, operations }
}

for (const continued of [false, true]) for (const emptyFinal of [false, true]) {
  test(`empty LastEvaluatedKey ends ${continued ? 'continued migration' : 'first page'} with ${emptyFinal ? 'empty' : 'nonempty'} Items`, async () => {
    const finalPage = { Items: emptyFinal ? [] : [syntheticItem(continued ? 2 : 1)], LastEvaluatedKey: {} }
    const pages = continued
      ? [{ Items: [syntheticItem(1)], LastEvaluatedKey: syntheticCursor(1) }, finalPage]
      : [finalPage]
    const { docClient, queries, writes } = mockMigration(pages)
    const summary = await runMigration(syntheticOptions(), docClient)
    assert.equal(summary.scanned, (continued ? 1 : 0) + (emptyFinal ? 0 : 1))
    assert.equal(summary.mode, 'dry-run')
    assert.equal(summary.copied, 0)
    assert.equal(queries.length, continued ? 2 : 1)
    assert.equal(queries[0].ExclusiveStartKey, undefined)
    if (continued) assert.deepEqual(queries[1].ExclusiveStartKey, syntheticCursor(1))
    assert.equal(writes.length, 0)
  })
}

for (const cycle of [false, true]) {
  test(`${cycle ? 'cyclic' : 'repeated reordered'} cursor rejects before any migration write`, async () => {
    const first = syntheticCursor(1)
    const equivalentFirst = { SK: first.SK, PK: first.PK }
    const pages = cycle
      ? [{ Items: [syntheticItem(1)], LastEvaluatedKey: first },
        { Items: [syntheticItem(2)], LastEvaluatedKey: syntheticCursor(2) },
        { Items: [syntheticItem(3)], LastEvaluatedKey: equivalentFirst }]
      : [{ Items: [syntheticItem(1)], LastEvaluatedKey: first },
        { Items: [syntheticItem(2)], LastEvaluatedKey: equivalentFirst }]
    const { docClient, queries, writes } = mockMigration(pages)
    await assert.rejects(runMigration(syntheticOptions(true), docClient), /repeated.*cursor/i)
    assert.equal(queries.length, cycle ? 3 : 2)
    assert.equal(writes.length, 0)
  })
}

for (const write of [false, true]) {
  test(`normal pagination collects all pages in order before ${write ? 'writing' : 'dry-run completion'}`, async () => {
    const pages = [
      { Items: [syntheticItem(1)], LastEvaluatedKey: syntheticCursor(1) },
      { Items: [], LastEvaluatedKey: syntheticCursor(2) },
      { Items: [syntheticItem(3)] },
    ]
    const { docClient, queries, writes, operations } = mockMigration(pages)
    const summary = await runMigration(syntheticOptions(write), docClient)
    assert.equal(summary.scanned, 2)
    assert.equal(summary.copied, write ? 2 : 0)
    assert.equal(summary.existing, 0)
    assert.equal(summary.mode, write ? 'write' : 'dry-run')
    assert.deepEqual(queries.map((query) => query.ExclusiveStartKey), [undefined, syntheticCursor(1), syntheticCursor(2)])
    assert.deepEqual(operations, write ? ['query', 'query', 'query', 'put', 'put'] : ['query', 'query', 'query'])
    assert.deepEqual(writes.map((item) => item.SK), write ? [syntheticItem(1).SK, syntheticItem(3).SK] : [])
    for (const item of writes) {
      assert.equal(item.PK, 'HOUSEHOLD#synthetic-target')
      assert.equal(item.userId, 'synthetic-target')
      assert.equal(item.migratedFromPK, 'USER#synthetic-source')
    }
  })
}

test('a later Query failure rejects migration without partial writes', async () => {
  const { docClient, queries, writes } = mockMigration([
    { Items: [syntheticItem(1)], LastEvaluatedKey: syntheticCursor(1) },
    new Error('SYNTHETIC_QUERY_FAILURE'),
  ])
  await assert.rejects(runMigration(syntheticOptions(true), docClient), /SYNTHETIC_QUERY_FAILURE/)
  assert.equal(queries.length, 2)
  assert.equal(writes.length, 0)
})
