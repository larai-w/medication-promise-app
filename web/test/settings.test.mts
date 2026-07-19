import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_MEDICATION_SETTINGS,
  parseMedicationSettingsInput,
  settingsToTimingDefaults,
} from '../src/lib/settings.ts'

test('default settings keep the five current timings', () => {
  assert.deepEqual(settingsToTimingDefaults(DEFAULT_MEDICATION_SETTINGS), {
    '朝': '08:00',
    '昼': '12:00',
    '晩': '18:00',
    '夜8時': '20:00',
    '夜9時': '21:00',
  })
})

test('settings input trims medication name and sorts timings', () => {
  const settings = parseMedicationSettingsInput({
    medicationName: ' お薬A ',
    reminderSchedule: [
      { timing: '夜9時', time: '22:00' },
      { timing: '朝', time: '08:15' },
      { timing: '昼', time: '12:00' },
      { timing: '晩', time: '18:00' },
      { timing: '夜8時', time: '20:00' },
    ],
  })

  assert.equal(settings.medicationName, 'お薬A')
  assert.deepEqual(settings.reminderSchedule.map((item) => item.timing), ['朝', '昼', '晩', '夜8時', '夜9時'])
})

test('settings input rejects invalid time and duplicate timing', () => {
  assert.throws(
    () => parseMedicationSettingsInput({
      medicationName: '',
      reminderSchedule: [
        { timing: '朝', time: '25:00' },
        { timing: '昼', time: '12:00' },
        { timing: '晩', time: '18:00' },
        { timing: '夜8時', time: '20:00' },
        { timing: '夜9時', time: '21:00' },
      ],
    }),
    /時刻はHH:MM形式/
  )

  assert.throws(
    () => parseMedicationSettingsInput({
      medicationName: '',
      reminderSchedule: [
        { timing: '朝', time: '08:00' },
        { timing: '朝', time: '09:00' },
        { timing: '晩', time: '18:00' },
        { timing: '夜8時', time: '20:00' },
        { timing: '夜9時', time: '21:00' },
      ],
    }),
    /重複/
  )
})
