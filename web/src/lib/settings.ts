import { DEFAULT_REMINDER_SCHEDULE, TIMINGS, type Timing } from './constants.ts'

export interface ReminderSetting {
  timing: Timing
  time: string
}

export interface MedicationSettings {
  medicationName: string
  reminderSchedule: ReminderSetting[]
  updatedAt?: string
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const VALID_TIMINGS = new Set<Timing>(TIMINGS)

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SettingsValidationError'
  }
}

export const DEFAULT_MEDICATION_SETTINGS: MedicationSettings = {
  medicationName: '',
  reminderSchedule: DEFAULT_REMINDER_SCHEDULE.map(({ timing, time }) => ({ timing, time })),
}

function parseMedicationName(value: unknown) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new SettingsValidationError('薬名は文字列で入力してください')
  const medicationName = value.trim()
  if (medicationName.length > 80) throw new SettingsValidationError('薬名は80文字以内で入力してください')
  return medicationName
}

function parseReminderSchedule(value: unknown): ReminderSetting[] {
  if (!Array.isArray(value)) throw new SettingsValidationError('リマインダー時刻が正しくありません')
  if (value.length !== TIMINGS.length) {
    throw new SettingsValidationError('リマインダー時刻は5件すべて指定してください')
  }

  const seen = new Set<Timing>()
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new SettingsValidationError('リマインダー時刻が正しくありません')
    }
    const body = item as Record<string, unknown>
    const timing = body.timing
    const time = body.time

    if (typeof timing !== 'string' || !VALID_TIMINGS.has(timing as Timing)) {
      throw new SettingsValidationError('服薬区分が正しくありません')
    }
    if (seen.has(timing as Timing)) {
      throw new SettingsValidationError('同じ服薬区分が重複しています')
    }
    if (typeof time !== 'string' || !TIME_PATTERN.test(time)) {
      throw new SettingsValidationError('時刻はHH:MM形式で入力してください')
    }
    seen.add(timing as Timing)
    return { timing: timing as Timing, time }
  }).sort((a, b) => TIMINGS.indexOf(a.timing) - TIMINGS.indexOf(b.timing))
}

export function parseMedicationSettingsInput(value: unknown): MedicationSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SettingsValidationError('入力内容が正しくありません')
  }
  const body = value as Record<string, unknown>
  return {
    medicationName: parseMedicationName(body.medicationName),
    reminderSchedule: parseReminderSchedule(body.reminderSchedule),
  }
}

export function settingsToTimingDefaults(settings: MedicationSettings) {
  return Object.fromEntries(
    settings.reminderSchedule.map(({ timing, time }) => [timing, time])
  ) as Record<Timing, string>
}

export function toHourMinute(time: string) {
  const [hour, min] = time.split(':').map(Number)
  return { hour, min }
}
