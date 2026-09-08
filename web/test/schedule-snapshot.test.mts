import test from 'node:test'
import type { DynamoRecord } from '../src/types/index.ts'
import { readFileSync } from 'node:fs'
import type { Timing } from '../src/lib/constants.ts'

type Mutation = { UpdateExpression: string; ConditionExpression: string }
type CapturedInput = Mutation & {
  Key: { PK: string; SK: string }; ConsistentRead: boolean;
  ExpressionAttributeValues: Record<string, string>;
  TransactItems: [{ ConditionCheck: { Key: { PK: string } } }, { Put: { Item: DynamoRecord }; Update: Mutation }];
}

import assert from 'node:assert/strict'
import { captureScheduleSnapshot } from '../src/lib/schedule-snapshot.ts'
import { DEFAULT_REMINDER_SCHEDULE } from '../src/lib/constants.ts'
import { createRecordForHousehold, listRecordsForHousehold, updateRecordForHousehold } from '../src/lib/household-records.ts'
import { encodeSK } from '../src/lib/dynamodb.ts'
import { makeAuthenticatedHousehold } from '../src/lib/household.ts'

const settings = () => ({ updatedAt: '2026-01-01T00:00:00.000Z', reminderSchedule: DEFAULT_REMINDER_SCHEDULE.map(slot => ({ ...slot, time: slot.timing === '朝' ? '08:15' : slot.time })) })
const captured = '2026-01-02T00:00:00.000Z'
const household = { ...makeAuthenticatedHousehold({ HOUSEHOLD_ID: 'synthetic-a', HOUSEHOLD_PARTITION_MODE: 'household' }), providerSubject: 'synthetic-provider' }

test('snapshot preserves changed scheduled time and version independently of later settings', () => {
  const original = settings()
  const snapshot = captureScheduleSnapshot(original, '2026-01-02', '08:30', '朝', captured)
  assert.deepEqual(snapshot, { timing: '朝', time: '08:15', settingsUpdatedAt: original.updatedAt, capturedAt: captured })
  original.reminderSchedule[0].time = '09:00'
  assert.equal(snapshot?.time, '08:15')
})

test('missing, unversioned, malformed and ambiguous schedules do not fabricate a snapshot', () => {
  for (const value of [undefined, {}, { ...settings(), updatedAt: undefined }, { ...settings(), updatedAt: 'not-a-date' }, { ...settings(), updatedAt: '2026-02-30T00:00:00.000Z' }, { ...settings(), reminderSchedule: [] }, { ...settings(), reminderSchedule: Array(5).fill({ timing: '朝', time: '08:15' }) }, { ...settings(), reminderSchedule: settings().reminderSchedule.map(slot => ({ ...slot, time: '99:99' })) }]) {
    assert.equal(captureScheduleSnapshot(value, '2026-01-02', '08:30', '朝', captured), undefined)
  }
})

test('historical before version, future occurrence and invalid date remain unknown', () => {
  assert.equal(captureScheduleSnapshot(settings(), '2025-12-31', '08:30', '朝', captured), undefined)
  assert.equal(captureScheduleSnapshot(settings(), '2026-01-03', '08:30', '朝', captured), undefined)
  assert.equal(captureScheduleSnapshot(settings(), '2026-02-30', '08:30', '朝', '2026-03-01T00:00:00.000Z'), undefined)
})

test('create reads authenticated settings consistently and returns stored snapshot; list never re-resolves settings', async () => {
  const calls: CapturedInput[] = []
  let stored: DynamoRecord | undefined
  const client = { async send(rawCommand: unknown) {
    const command = rawCommand as { input: CapturedInput }
    calls.push(command.input)
    if (command.input.Key) return { Item: settings() }
    stored = command.input.TransactItems[1].Put.Item
    return {}
  } }
  const created = await createRecordForHousehold(household, { date: '2026-01-02', time: '08:30', timing: '朝' }, client)
  assert.deepEqual(calls[0].Key, { PK: household.partitionKey, SK: 'SETTINGS#medication' })
  assert.equal(calls[0].ConsistentRead, true)
  assert.equal(calls[1].TransactItems[0].ConditionCheck.Key.PK, 'USER#synthetic-provider')
  assert.equal(created.scheduleSnapshot?.time, '08:15')
  const read = await listRecordsForHousehold(household, { date: created.date }, { async send(rawCommand: unknown) {
    const command = rawCommand as { input: CapturedInput }
    assert.equal(command.input.ExpressionAttributeValues[':pk'], household.partitionKey)
    assert.ok(stored)
    return { Items: [stored] }
  } })
  assert.deepEqual(read[0].scheduleSnapshot, created.scheduleSnapshot)
})

test('settings read failures abort writes and are not downgraded to unknown', async () => {
  let calls = 0
  await assert.rejects(createRecordForHousehold(household, { date: '2026-01-02', time: '08:30', timing: '朝' }, { async send() { calls++; throw new Error('synthetic read failed') } }), /synthetic read failed/)
  assert.equal(calls, 1)
})

test('time or timing edits atomically remove prior snapshot; notes and review edits retain it', async () => {
  for (const partitionMode of ['household', 'legacy-user'] as const) {
    for (const update of [{ time: '08:30' }, { timing: '朝' as const }, { notes: 'synthetic note' }, { reviewStatus: 'reviewed' as const }]) {
      const calls: CapturedInput[] = []
      const item = { SK: 'RECORD#2026-01-02T08:30:00#synthetic', scheduleSnapshot: captureScheduleSnapshot(settings(), '2026-01-02', '08:30', '朝', captured) }
      await updateRecordForHousehold({ ...household, partitionMode }, encodeSK(item.SK), update, { async send(rawCommand: unknown) {
        const command = rawCommand as { input: CapturedInput }
        calls.push(command.input)
        return { Item: item, Attributes: item }
      } })
      const mutation = partitionMode === 'household' ? calls[0].TransactItems[1].Update : calls[0]
      assert.equal(mutation.UpdateExpression.includes(' REMOVE scheduleSnapshot'), 'time' in update || 'timing' in update)
      assert.match(mutation.ConditionExpression, /attribute_exists/)
    }
  }
})


test('web follows the shared Web/Alexa synthetic snapshot cases', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/schedule-snapshot.synthetic.json', import.meta.url), 'utf8'))
  for (const vector of cases) {
    assert.deepEqual(captureScheduleSnapshot(vector.settings, vector.date, vector.time, vector.timing as Timing, vector.capturedAt) ?? null, vector.expected, vector.name)
  }
})
