// Robustness of the reminder-schedule read path (see
// docs/REMINDER_SCHEDULE_CONTRACT.md): missing, partial, and corrupt schedule
// data must either fall back to the documented default or fail loudly with a
// controlled error — never serve a partial or wrong-time reminder.
import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_REMINDER_SCHEDULE, getReminderSchedule } from '../config.mjs'

// --- missing schedule -------------------------------------------------------

test('missing stored schedule and env falls back to the documented default', () => {
  assert.deepEqual(getReminderSchedule({}), DEFAULT_REMINDER_SCHEDULE)
  // The default is copied, not shared: callers may not mutate the module state.
  const copy = getReminderSchedule({})
  copy[0].hour = 3
  assert.equal(DEFAULT_REMINDER_SCHEDULE[0].hour, 8)
})

test('null stored schedule (absent DynamoDB field) falls back to env then default', () => {
  assert.deepEqual(getReminderSchedule({}, null), DEFAULT_REMINDER_SCHEDULE)
  assert.deepEqual(
    getReminderSchedule({ REMINDER_SCHEDULE_JSON: '[{"timing":"朝","time":"07:30"}]' }, null),
    [{ timing: '朝', hour: 7, min: 30 }],
  )
})

test('stored schedule takes precedence over REMINDER_SCHEDULE_JSON', () => {
  const schedule = getReminderSchedule(
    { REMINDER_SCHEDULE_JSON: '[{"timing":"朝","time":"06:00"}]' },
    [{ timing: '夜9時', time: '21:30' }],
  )
  assert.deepEqual(schedule, [{ timing: '夜9時', hour: 21, min: 30 }])
})

// --- corrupt shapes ---------------------------------------------------------

test('non-array stored schedules are rejected loudly', () => {
  for (const bad of [{}, '朝', 8, true, [{ timing: '朝', time: '08:00' }, 'junk']]) {
    assert.throws(() => getReminderSchedule({}, bad), /1 to 10|Unsupported/)
  }
})

test('null or non-object entries are rejected loudly', () => {
  for (const bad of [[null], [undefined], ['朝'], [8]]) {
    assert.throws(() => getReminderSchedule({}, bad), /Unsupported reminder timing/)
  }
})

test('entries without a supported timing are rejected loudly', () => {
  for (const bad of [
    [{ time: '08:00' }],              // timing missing
    [{ timing: '', time: '08:00' }],   // timing empty
    [{ timing: '夕方', time: '08:00' }], // timing outside the supported set
  ]) {
    assert.throws(() => getReminderSchedule({}, bad), /Unsupported reminder timing/)
  }
})

test('malformed or missing times are rejected loudly', () => {
  for (const bad of [
    [{ timing: '朝' }],                 // neither time nor hour/min
    [{ timing: '朝', time: '8:00' }],   // hour not zero-padded
    [{ timing: '朝', time: '25:00' }],  // hour out of range
    [{ timing: '朝', time: '12:60' }],  // minute out of range
    [{ timing: '朝', time: '12:0x' }],  // non-numeric minute
    [{ timing: '朝', hour: 8.5, min: 0 }], // fractional hour
    [{ timing: '朝', hour: -1, min: 0 }],
    [{ timing: '朝', hour: 24, min: 0 }],
    [{ timing: '朝', hour: 8, min: -1 }],
    [{ timing: '朝', hour: 8, min: 60 }],
    [{ timing: '朝', hour: NaN, min: 0 }],
  ]) {
    assert.throws(() => getReminderSchedule({}, bad), /hour|minute/)
  }
})

test('duplicate timings are rejected loudly', () => {
  assert.throws(
    () => getReminderSchedule({}, [
      { timing: '朝', time: '08:00' },
      { timing: '朝', time: '09:00' },
    ]),
    /Duplicate reminder timing/,
  )
})

// --- boundary counts --------------------------------------------------------

test('empty stored schedule is rejected (no silent zero-reminder state)', () => {
  // An empty array is truthy, so it is validated — not mistaken for "missing".
  assert.throws(() => getReminderSchedule({}, []), /1 to 10/)
})

test('reminder count is bounded by the supported timing set', () => {
  const timings = DEFAULT_REMINDER_SCHEDULE.map(({ timing }) => timing)
  // All five supported timings pass...
  assert.equal(
    getReminderSchedule({}, timings.map((timing, i) => ({ timing, time: `${String(i).padStart(2, '0')}:00` }))).length,
    5,
  )
  // ...and any repeat is rejected, so a stored schedule can never exceed the cap.
  assert.throws(
    () => getReminderSchedule({}, Array.from({ length: 6 }, () => ({ timing: '朝', time: '08:00' }))),
    /Duplicate reminder timing/,
  )
})

// --- env path ---------------------------------------------------------------

test('invalid REMINDER_SCHEDULE_JSON is rejected loudly', () => {
  assert.throws(
    () => getReminderSchedule({ REMINDER_SCHEDULE_JSON: '{not json' }),
    /must be valid JSON/,
  )
})

test('valid JSON with a wrong shape is rejected loudly', () => {
  for (const raw of ['{}', '"朝"', '8', '[]']) {
    assert.throws(() => getReminderSchedule({ REMINDER_SCHEDULE_JSON: raw }), /1 to 10/)
  }
})

test('HH:MM stored entries and legacy hour/min entries both normalise', () => {
  assert.deepEqual(
    getReminderSchedule({}, [
      { timing: '朝', time: '07:05' },
      { timing: '昼', hour: 12, min: 30 },
      { timing: '晩', hour: '18', min: '0' }, // numeric strings via Number()
    ]),
    [
      { timing: '朝', hour: 7, min: 5 },
      { timing: '昼', hour: 12, min: 30 },
      { timing: '晩', hour: 18, min: 0 },
    ],
  )
})