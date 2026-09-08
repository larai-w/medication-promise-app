import { createHash } from 'node:crypto'
import { TIMINGS, type Timing } from './constants.ts'
import { isValidDate } from './record-validation.ts'
import type { DailyCondition, MedicationRecord } from '../types/index.ts'

export const CARE_EVENT_SCHEMA_VERSION = 'care-event/v1' as const
export const MEDICATION_PROMISE_EXPORT_VERSION = 'medication-promise-export/v2' as const
export const MEDICATION_PROMISE_EXPORT_TIMEZONE = 'Asia/Tokyo' as const

export interface MedicationCareEvent {
  schemaVersion: typeof CARE_EVENT_SCHEMA_VERSION
  eventId: string
  eventType: 'medication_taken'
  source: 'medication-promise'
  patientId: 'self'
  careTeamId: 'household'
  occurredAt: string
  recordedAt: string
  localDate: string
  payload: {
    timing: Timing
    scheduledTime: string | null
    scheduledTimeStatus: 'recorded_snapshot' | 'unknown'
    scheduledTimeProvenance?: { settingsUpdatedAt: string; capturedAt: string }
    actualTime: string
    inputSource: MedicationRecord['source']
    medicationRef?: string
    notes?: string
  }
  missingness: 'observed'
  provenance: {
    source: 'medication-promise'
    sourceRecordId: string
    recordedAt: string
    exportedAt: string
    transformVersion: typeof MEDICATION_PROMISE_EXPORT_VERSION
  }
  consentScope: 'personal_review'
  exportVersion: typeof MEDICATION_PROMISE_EXPORT_VERSION
  correction: {
    status: 'original' | 'corrected'
  }
}

export interface MedicationPromiseExport {
  schemaVersion: typeof MEDICATION_PROMISE_EXPORT_VERSION
  exportedAt: string
  timezone: typeof MEDICATION_PROMISE_EXPORT_TIMEZONE
  purpose: 'personal_review'
  recordCount: number
  records: MedicationCareEvent[]
  dailyConditions: DailyCondition[]
  limitations: string[]
}

export class CareEventExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CareEventExportError'
  }
}

function normalizedIsoDateTime(value: string, fieldName: string) {
  const parsed = new Date(value)
  if (!value || Number.isNaN(parsed.getTime())) {
    throw new CareEventExportError(`${fieldName} is not a valid date-time`)
  }
  return parsed.toISOString()
}

function stableRecordId(recordId: string) {
  if (!recordId) throw new CareEventExportError('record id is required')
  return `mp-${createHash('sha256').update(recordId).digest('hex').slice(0, 32)}`
}

function toOccurredAt(record: MedicationRecord) {
  if (!isValidDate(record.date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(record.time)) {
    throw new CareEventExportError('record date or time is invalid')
  }
  const occurredAt = `${record.date}T${record.time}:00+09:00`
  return occurredAt
}

function exportedSchedule(record: MedicationRecord): Pick<MedicationCareEvent['payload'],
  'scheduledTime' | 'scheduledTimeStatus' | 'scheduledTimeProvenance'> {
  const snapshot = record.scheduleSnapshot
  if (snapshot === undefined) return { scheduledTime: null, scheduledTimeStatus: 'unknown' }
  if (!snapshot || snapshot.timing !== record.timing ||
      typeof snapshot.time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(snapshot.time)) {
    throw new CareEventExportError('record schedule snapshot is invalid')
  }
  const settingsUpdatedAt = normalizedIsoDateTime(snapshot.settingsUpdatedAt, 'schedule settingsUpdatedAt')
  const capturedAt = normalizedIsoDateTime(snapshot.capturedAt, 'schedule capturedAt')
  const occurred = Date.parse(toOccurredAt(record))
  if (Date.parse(settingsUpdatedAt) > occurred || occurred > Date.parse(capturedAt)) {
    throw new CareEventExportError('record schedule snapshot chronology is invalid')
  }
  return {
    scheduledTime: snapshot.time,
    scheduledTimeStatus: 'recorded_snapshot',
    scheduledTimeProvenance: { settingsUpdatedAt, capturedAt },
  }
}

export function toMedicationCareEvent(
  record: MedicationRecord,
  exportedAt: string
): MedicationCareEvent {
  const sourceRecordId = stableRecordId(record.id)
  const recordedAt = normalizedIsoDateTime(record.createdAt, 'createdAt')
  if (record.updatedAt) normalizedIsoDateTime(record.updatedAt, 'updatedAt')
  if (!TIMINGS.includes(record.timing)) throw new CareEventExportError('record timing is invalid')
  const schedule = exportedSchedule(record)
  if (record.source !== 'manual' && record.source !== 'alexa') {
    throw new CareEventExportError('record source is invalid')
  }
  if (record.notes && record.notes.length > 200) {
    throw new CareEventExportError('record notes exceed the supported length')
  }

  return {
    schemaVersion: CARE_EVENT_SCHEMA_VERSION,
    eventId: sourceRecordId,
    eventType: 'medication_taken',
    source: 'medication-promise',
    patientId: 'self',
    careTeamId: 'household',
    occurredAt: toOccurredAt(record),
    recordedAt,
    localDate: record.date,
    payload: {
      timing: record.timing,
      ...schedule,
      actualTime: record.time,
      inputSource: record.source,
      ...(record.medicationRef ? { medicationRef: record.medicationRef } : {}),
      ...(record.notes ? { notes: record.notes } : {}),
    },
    missingness: 'observed',
    provenance: {
      source: 'medication-promise',
      sourceRecordId,
      recordedAt,
      exportedAt,
      transformVersion: MEDICATION_PROMISE_EXPORT_VERSION,
    },
    consentScope: 'personal_review',
    exportVersion: MEDICATION_PROMISE_EXPORT_VERSION,
    correction: {
      status: record.updatedAt ? 'corrected' : 'original',
    },
  }
}

export function buildMedicationPromiseExport(
  records: MedicationRecord[],
  dailyConditionsOrNow: DailyCondition[] | Date = [],
  now = new Date()
): MedicationPromiseExport {
  const dailyConditions = dailyConditionsOrNow instanceof Date ? [] : dailyConditionsOrNow
  if (dailyConditionsOrNow instanceof Date) now = dailyConditionsOrNow
  const exportedAt = normalizedIsoDateTime(now.toISOString(), 'exportedAt')
  const events = records.map((record) => toMedicationCareEvent(record, exportedAt))

  return {
    schemaVersion: MEDICATION_PROMISE_EXPORT_VERSION,
    exportedAt,
    timezone: MEDICATION_PROMISE_EXPORT_TIMEZONE,
    purpose: 'personal_review',
    recordCount: events.length,
    records: events,
    dailyConditions,
    limitations: [
      '記録は実際の服薬を医学的に証明するものではありません。',
      '記録がない時間帯を未服薬として補完していません。',
      '予定時刻は保存された設定の写しがある場合だけ出力します。不明な予定を既定値や現在の設定で補完していません。',
      '保存された予定は通知の配信や処方内容を証明せず、予定の全変更履歴でもありません。',
    ],
  }
}
