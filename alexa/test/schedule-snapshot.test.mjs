import test from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { captureScheduleSnapshot, recordMedication, recordMedicationForHousehold } from '../dynamodb.mjs'
const settings = () => ({ updatedAt: '2026-01-01T00:00:00.000Z', reminderSchedule: ['朝', '昼', '晩', '夜8時', '夜9時'].map((timing, i) => ({ timing, time: ['08:15', '12:00', '18:00', '20:00', '21:00'][i] })) })
const household = { householdId: 'synthetic-a', partitionKey: 'HOUSEHOLD#synthetic-a', providerSubject: 'synthetic-provider' }

test('Alexa snapshot validates schedule and chronology conservatively', () => {
  const snapshot = captureScheduleSnapshot(settings(), '2026-01-02', '08:30', '朝', '2026-01-02T00:00:00.000Z')
  assert.equal(snapshot.time, '08:15')
  for (const source of [undefined, {}, { ...settings(), updatedAt: undefined }, { ...settings(), updatedAt: 'bad-date' }, { ...settings(), reminderSchedule: [] }, { ...settings(), reminderSchedule: Array(5).fill({ timing: '朝', time: '08:15' }) }]) {
    assert.equal(captureScheduleSnapshot(source, '2026-01-02', '08:30', '朝', '2026-01-02T00:00:00.000Z'), undefined)
  }
  assert.equal(captureScheduleSnapshot(settings(), '2025-12-31', '08:30', '朝', '2026-01-02T00:00:00.000Z'), undefined)
  assert.equal(captureScheduleSnapshot(settings(), '2026-01-03', '08:30', '朝', '2026-01-02T00:00:00.000Z'), undefined)
})

test('active and legacy writers read their own partition and capture valid snapshots', async () => {
  for (const legacy of [false, true]) {
    const calls = []
    const source = settings()
    const client = { async send(command) { calls.push(command.input); return command.input.Key ? { Item: source } : {} } }
    if (legacy) await recordMedication('朝', { client })
    else await recordMedicationForHousehold(household, '朝', { client })
    const item = legacy ? calls[1].Item : calls[1].TransactItems[1].Put.Item
    assert.deepEqual(calls[0].Key, { PK: item.PK, SK: 'SETTINGS#medication' })
    assert.equal(calls[0].ConsistentRead, true)
    assert.equal(item.scheduleSnapshot.time, '08:15')
    assert.equal(item.scheduleSnapshot.settingsUpdatedAt, source.updatedAt)
    source.reminderSchedule[0].time = '09:00'
    assert.equal(item.scheduleSnapshot.time, '08:15')
    if (!legacy) assert.equal(calls[1].TransactItems[0].ConditionCheck.Key.PK, 'USER#synthetic-provider')
  }
})

test('Alexa writers preserve unknown settings but never suppress read failures', async () => {
  for (const legacy of [false, true]) {
    let saved
    const client = { async send(command) { if (command.input.Key) return {}; saved = legacy ? command.input.Item : command.input.TransactItems[1].Put.Item; return {} } }
    const write = options => legacy ? recordMedication('朝', options) : recordMedicationForHousehold(household, '朝', options)
    await write({ client })
    assert.equal(saved.scheduleSnapshot, undefined)
    let calls = 0
    await assert.rejects(write({ client: { async send() { calls++; throw new Error('synthetic failure') } } }), /synthetic failure/)
    assert.equal(calls, 1)
  }
})

test('Alexa follows the shared Web/Alexa synthetic snapshot cases', () => {
  const cases = JSON.parse(readFileSync(new URL('../../web/test/fixtures/schedule-snapshot.synthetic.json', import.meta.url), 'utf8'))
  for (const vector of cases) {
    assert.deepEqual(captureScheduleSnapshot(vector.settings, vector.date, vector.time, vector.timing, vector.capturedAt) ?? null, vector.expected, vector.name)
  }
})
