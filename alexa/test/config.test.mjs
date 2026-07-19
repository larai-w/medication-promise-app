import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildReminderText,
  DEFAULT_REMINDER_SCHEDULE,
  formatReminderSummary,
  getMedicationName,
  getReminderSchedule,
} from '../config.mjs'

test('default schedule contains the five MVP timings', () => {
  assert.deepEqual(getReminderSchedule({}), DEFAULT_REMINDER_SCHEDULE)
})

test('custom reminder schedule is parsed and validated', () => {
  const schedule = getReminderSchedule({
    REMINDER_SCHEDULE_JSON: JSON.stringify([
      { timing: '朝', hour: 7, min: 30 },
      { timing: '夜9時', hour: 22, min: 0 },
    ]),
  })
  assert.deepEqual(schedule, [
    { timing: '朝', hour: 7, min: 30 },
    { timing: '夜9時', hour: 22, min: 0 },
  ])
  assert.equal(formatReminderSummary(schedule), '朝7時30分、夜9時22時')
})

test('stored reminder schedule supports HH:MM values from web settings', () => {
  const schedule = getReminderSchedule({}, [
    { timing: '朝', time: '08:15' },
    { timing: '昼', time: '12:30' },
  ])
  assert.deepEqual(schedule, [
    { timing: '朝', hour: 8, min: 15 },
    { timing: '昼', hour: 12, min: 30 },
  ])
})

test('invalid and duplicate reminder timings are rejected', () => {
  assert.throws(
    () => getReminderSchedule({ REMINDER_SCHEDULE_JSON: '[{"timing":"朝","hour":25,"min":0}]' }),
    /Invalid reminder hour/
  )
  assert.throws(
    () => getReminderSchedule({
      REMINDER_SCHEDULE_JSON: '[{"timing":"朝","hour":8,"min":0},{"timing":"朝","hour":9,"min":0}]',
    }),
    /Duplicate reminder timing/
  )
})

test('generic reminder contains no hard-coded medication and keeps a gentle closing', () => {
  const generic = buildReminderText('朝')
  assert.match(generic, /服薬の予定を確認/)
  assert.doesNotMatch(generic, /お薬A/)

  const night = buildReminderText('夜9時', '処方された薬')
  assert.match(night, /処方された薬/)
  assert.match(night, /今日も一日お疲れさまでした/)
})

test('stored medication name takes precedence over env fallback', () => {
  assert.equal(getMedicationName({ MEDICATION_NAME: '環境変数の薬' }, { medicationName: 'お薬A' }), 'お薬A')
  assert.equal(getMedicationName({ MEDICATION_NAME: '環境変数の薬' }, {}), '環境変数の薬')
})
