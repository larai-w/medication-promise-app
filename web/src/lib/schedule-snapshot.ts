import type { Timing } from './constants.ts'
import type { ScheduleSnapshot } from '../types/index.ts'

const SNAPSHOT_TIMINGS = ['朝', '昼', '晩', '夜8時', '夜9時']
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/

// Use only a version actually observed in storage, never normalized defaults.
export function captureScheduleSnapshot(settings: unknown, date: string, time: string, timing: Timing, capturedAt: string): ScheduleSnapshot | undefined {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return undefined
  const body = settings as Record<string, unknown>
  const version = body.updatedAt
  if (typeof version !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(version)) return undefined
  const versionMs = Date.parse(version)
  if (!Number.isFinite(versionMs) || new Date(versionMs).toISOString() !== version) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !CLOCK.test(time)) return undefined
  const occurredMs = Date.parse(`${date}T${time}:00+09:00`)
  if (!Number.isFinite(occurredMs) || new Date(occurredMs + 9 * 3600000).toISOString().slice(0, 10) !== date) return undefined
  const capturedMs = Date.parse(capturedAt)
  if (!Number.isFinite(capturedMs) || versionMs > occurredMs || occurredMs > capturedMs) return undefined
  const schedule = body.reminderSchedule
  if (!Array.isArray(schedule) || schedule.length !== SNAPSHOT_TIMINGS.length) return undefined
  const seen = new Set<string>()
  for (const slot of schedule) {
    if (!slot || typeof slot !== 'object' || !SNAPSHOT_TIMINGS.includes(slot.timing)
      || seen.has(slot.timing) || typeof slot.time !== 'string' || !CLOCK.test(slot.time)) return undefined
    seen.add(slot.timing)
  }
  const slot = schedule.find((entry) => entry.timing === timing)
  return slot ? { timing, time: slot.time, settingsUpdatedAt: version, capturedAt } : undefined
}
