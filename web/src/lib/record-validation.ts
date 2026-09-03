import type { DailyCondition } from '../types/index.ts'

const VALID_TIMINGS = new Set(['朝', '昼', '晩', '夜8時', '夜9時'])
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InputValidationError'
  }
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = DATE_PATTERN.exec(value)
  if (!match) return false
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function isValidMonth(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = MONTH_PATTERN.exec(value)
  if (!match) return false
  const month = Number(match[2])
  return month >= 1 && month <= 12
}

function parseConditionScore(value: unknown): DailyCondition['score'] {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new InputValidationError('体調は1〜5で入力してください')
  }
  return value as DailyCondition['score']
}

function parseConditionNote(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new InputValidationError('体調メモは文字列で入力してください')
  const note = value.trim()
  if (note.length > 200) throw new InputValidationError('体調メモは200文字以内で入力してください')
  return note || undefined
}

export function parseDailyConditionInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InputValidationError('入力内容が正しくありません')
  }
  const body = value as Record<string, unknown>
  if (!isValidDate(body.date)) throw new InputValidationError('日付が正しくありません')
  return { date: body.date, score: parseConditionScore(body.score), note: parseConditionNote(body.note) }
}

function parseNotes(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new InputValidationError('メモは文字列で入力してください')
  const notes = value.trim()
  if (notes.length > 200) throw new InputValidationError('メモは200文字以内で入力してください')
  return notes || undefined
}

function parseMedicationRef(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !/^med-[A-Za-z0-9_-]{1,80}$/.test(value)) {
    throw new InputValidationError('薬剤参照はmed-で始まる英数字の識別子にしてください')
  }
  return value
}

function parseTime(value: unknown) {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
    throw new InputValidationError('時刻はHH:MM形式で入力してください')
  }
  return value
}

function parseTiming(value: unknown) {
  if (typeof value !== 'string' || !VALID_TIMINGS.has(value)) {
    throw new InputValidationError('服薬区分が正しくありません')
  }
  return value as '朝' | '昼' | '晩' | '夜8時' | '夜9時'
}

function parseReviewStatus(value: unknown) {
  if (value !== 'reviewed') throw new InputValidationError('確認状態が正しくありません')
  return value as 'reviewed'
}

export function parseCreateRecordInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InputValidationError('入力内容が正しくありません')
  }
  const body = value as Record<string, unknown>
  if (!isValidDate(body.date)) throw new InputValidationError('日付が正しくありません')
  return {
    date: body.date,
    time: parseTime(body.time),
    timing: parseTiming(body.timing),
    ...(parseMedicationRef(body.medicationRef) ? { medicationRef: parseMedicationRef(body.medicationRef) } : {}),
    notes: parseNotes(body.notes),
  }
}

export function parseUpdateRecordInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InputValidationError('入力内容が正しくありません')
  }
  const body = value as Record<string, unknown>
  const result: {
    time?: string
    timing?: '朝' | '昼' | '晩' | '夜8時' | '夜9時'
    medicationRef?: string
    notes?: string
    reviewStatus?: 'reviewed'
  } = {}

  if (body.time !== undefined) result.time = parseTime(body.time)
  if (body.timing !== undefined) result.timing = parseTiming(body.timing)
  if (body.medicationRef !== undefined) result.medicationRef = parseMedicationRef(body.medicationRef)
  if (body.notes !== undefined) result.notes = parseNotes(body.notes) ?? ''
  if (body.reviewStatus !== undefined) result.reviewStatus = parseReviewStatus(body.reviewStatus)
  if (Object.keys(result).length === 0) throw new InputValidationError('更新内容がありません')
  return result
}

export function validateRecordSortKey(value: string) {
  if (!/^RECORD#\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00#[0-9a-f-]{36}$/i.test(value)) {
    throw new InputValidationError('記録IDが正しくありません')
  }
  return value
}
