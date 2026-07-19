import assert from 'node:assert/strict'
import test from 'node:test'
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
