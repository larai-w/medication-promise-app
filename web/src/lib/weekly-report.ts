import type { MedicationRecord } from '@/types'

type WeeklyReportEnvironment = {
  [key: string]: string | undefined
  BEDROCK_WEEKLY_REPORT_ENABLED?: string
  BEDROCK_WEEKLY_REPORT_MODEL_ID?: string
}

export const WEEKLY_REPORT_SCHEMA_VERSION = 1 as const
export const WEEKLY_REPORT_WINDOW_DAYS = 7

export type WeeklyReportRecord = Pick<MedicationRecord, 'date' | 'timing' | 'notes'>

export interface WeeklyReportFacts {
  schemaVersion: typeof WEEKLY_REPORT_SCHEMA_VERSION
  windowDays: number
  expectedTimingsPerDay: number
  recordedDays: number
  missingDays: number
  uniqueRecordedSlots: number
  expectedSlots: number
  recordingCoveragePercent: number
  noteCount: number
  duplicateRecordCount: number
  invalidRecordCount: number
}

export const WEEKLY_REPORT_FACT_IDS = [
  'window_days',
  'recorded_days',
  'missing_days',
  'unique_recorded_slots',
  'expected_slots',
  'recording_coverage_percent',
  'note_count',
  'duplicate_record_count',
  'invalid_record_count',
] as const

export type WeeklyReportFactId = (typeof WEEKLY_REPORT_FACT_IDS)[number]

export interface GroundedWeeklyReportCandidate {
  schemaVersion: typeof WEEKLY_REPORT_SCHEMA_VERSION
  sentences: Array<{
    text: string
    factIds: WeeklyReportFactId[]
  }>
  limitations: ['recording_absence_does_not_prove_medication_absence']
}

interface BuildWeeklyReportFactsOptions {
  from: string
  to: string
  expectedTimings: readonly string[]
}

export class WeeklyReportValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WeeklyReportValidationError'
  }
}

const UNSAFE_REPORT_PATTERNS = [
  /医療アドバイス/,
  /診断/,
  /治療/,
  /受診(?:して|すべき|を)/,
  /医師|薬剤師/,
  /薬(?:を|は).*(?:開始|中止|変更|増や|減ら)/,
  /(?:服用|飲んで|飲まないで)/,
]

export function isBedrockWeeklyReportEnabled(
  env: WeeklyReportEnvironment = process.env
): boolean {
  return env.BEDROCK_WEEKLY_REPORT_ENABLED === 'true'
}

export function getBedrockWeeklyReportModelId(
  env: WeeklyReportEnvironment = process.env
): string | null {
  const modelId = env.BEDROCK_WEEKLY_REPORT_MODEL_ID?.trim()
  return modelId || null
}

function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null
  return date
}

function enumerateCalendarDates(from: string, to: string): string[] {
  const start = parseCalendarDate(from)
  const end = parseCalendarDate(to)
  if (!start || !end || start > end) {
    throw new WeeklyReportValidationError('Weekly report period is invalid')
  }

  const dates: string[] = []
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86_400_000)) {
    dates.push(cursor.toISOString().slice(0, 10))
    if (dates.length > 31) {
      throw new WeeklyReportValidationError('Weekly report period exceeds 31 days')
    }
  }
  return dates
}

export function validateWeeklyReportFacts(facts: WeeklyReportFacts): WeeklyReportFacts {
  const integerFields: Array<keyof WeeklyReportFacts> = [
    'schemaVersion',
    'windowDays',
    'expectedTimingsPerDay',
    'recordedDays',
    'missingDays',
    'uniqueRecordedSlots',
    'expectedSlots',
    'recordingCoveragePercent',
    'noteCount',
    'duplicateRecordCount',
    'invalidRecordCount',
  ]
  for (const field of integerFields) {
    if (!Number.isInteger(facts[field]) || facts[field] < 0) {
      throw new WeeklyReportValidationError(`${field} must be a non-negative integer`)
    }
  }
  if (facts.schemaVersion !== WEEKLY_REPORT_SCHEMA_VERSION) {
    throw new WeeklyReportValidationError('Unsupported weekly report schema version')
  }
  if (facts.windowDays === 0 || facts.expectedTimingsPerDay === 0) {
    throw new WeeklyReportValidationError('Weekly report window and timing count must be positive')
  }
  if (facts.expectedSlots !== facts.windowDays * facts.expectedTimingsPerDay) {
    throw new WeeklyReportValidationError('Expected slot count is inconsistent')
  }
  if (facts.recordedDays + facts.missingDays !== facts.windowDays) {
    throw new WeeklyReportValidationError('Recorded and missing day counts are inconsistent')
  }
  if (facts.uniqueRecordedSlots > facts.expectedSlots) {
    throw new WeeklyReportValidationError('Recorded slot count exceeds the report window')
  }
  const expectedCoverage = Math.round((facts.uniqueRecordedSlots / facts.expectedSlots) * 100)
  if (facts.recordingCoveragePercent !== expectedCoverage) {
    throw new WeeklyReportValidationError('Recording coverage is inconsistent')
  }
  return facts
}

export function buildWeeklyReportFacts(
  records: readonly WeeklyReportRecord[],
  options: BuildWeeklyReportFactsOptions
): WeeklyReportFacts {
  const periodDates = enumerateCalendarDates(options.from, options.to)
  const allowedDates = new Set(periodDates)
  const allowedTimings = new Set(options.expectedTimings)
  if (allowedTimings.size === 0 || allowedTimings.size !== options.expectedTimings.length) {
    throw new WeeklyReportValidationError('Expected timings must be non-empty and unique')
  }

  const recordedDates = new Set<string>()
  const recordedSlots = new Set<string>()
  let noteCount = 0
  let duplicateRecordCount = 0
  let invalidRecordCount = 0

  for (const record of records) {
    if (!allowedDates.has(record.date) || !allowedTimings.has(record.timing)) {
      invalidRecordCount += 1
      continue
    }
    recordedDates.add(record.date)
    const slot = `${record.date}|${record.timing}`
    if (recordedSlots.has(slot)) duplicateRecordCount += 1
    else recordedSlots.add(slot)
    if (typeof record.notes === 'string' && record.notes.trim()) noteCount += 1
  }

  const expectedSlots = periodDates.length * allowedTimings.size
  const facts: WeeklyReportFacts = {
    schemaVersion: WEEKLY_REPORT_SCHEMA_VERSION,
    windowDays: periodDates.length,
    expectedTimingsPerDay: allowedTimings.size,
    recordedDays: recordedDates.size,
    missingDays: periodDates.length - recordedDates.size,
    uniqueRecordedSlots: recordedSlots.size,
    expectedSlots,
    recordingCoveragePercent: Math.round((recordedSlots.size / expectedSlots) * 100),
    noteCount,
    duplicateRecordCount,
    invalidRecordCount,
  }
  return validateWeeklyReportFacts(facts)
}

export function renderRuleBasedWeeklyReport(facts: WeeklyReportFacts): string {
  validateWeeklyReportFacts(facts)
  let report = `今週は${facts.windowDays}日間のうち${facts.recordedDays}日、${facts.uniqueRecordedSlots}件の記録があります。記録カバー率は${facts.recordingCoveragePercent}%です。`
  if (facts.noteCount > 0) report += ` メモは${facts.noteCount}件あります。`
  report += ' 記録の有無だけでは、実際に服薬したかどうかは判断できません。'
  return report
}

export function buildBedrockWeeklyReportPrompt(facts: WeeklyReportFacts): string {
  validateWeeklyReportFacts(facts)
  return JSON.stringify({
    schemaVersion: facts.schemaVersion,
    purpose: 'descriptive_weekly_recording_summary',
    facts: {
      window_days: facts.windowDays,
      recorded_days: facts.recordedDays,
      missing_days: facts.missingDays,
      unique_recorded_slots: facts.uniqueRecordedSlots,
      expected_slots: facts.expectedSlots,
      recording_coverage_percent: facts.recordingCoveragePercent,
      note_count: facts.noteCount,
      duplicate_record_count: facts.duplicateRecordCount,
      invalid_record_count: facts.invalidRecordCount,
    },
    constraints: [
      'Use only the supplied facts.',
      'Do not infer medication adherence, diagnosis, cause, trend, or treatment advice.',
      'Do not recommend starting, stopping, or changing medication.',
      'Return the factual summary in sentences and the required limitation as metadata.',
    ],
    outputSchema: {
      schemaVersion: 1,
      sentences: [
        {
          text: 'Japanese sentence grounded only in referenced facts',
          factIds: ['recorded_days'],
        },
      ],
      limitations: ['recording_absence_does_not_prove_medication_absence'],
    },
  })
}

function weeklyReportFactValues(facts: WeeklyReportFacts): Record<WeeklyReportFactId, number> {
  return {
    window_days: facts.windowDays,
    recorded_days: facts.recordedDays,
    missing_days: facts.missingDays,
    unique_recorded_slots: facts.uniqueRecordedSlots,
    expected_slots: facts.expectedSlots,
    recording_coverage_percent: facts.recordingCoveragePercent,
    note_count: facts.noteCount,
    duplicate_record_count: facts.duplicateRecordCount,
    invalid_record_count: facts.invalidRecordCount,
  }
}

export function validateGroundedWeeklyReportCandidate(
  value: unknown,
  facts: WeeklyReportFacts
): GroundedWeeklyReportCandidate {
  validateWeeklyReportFacts(facts)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WeeklyReportValidationError('Weekly report candidate must be an object')
  }
  const candidate = value as Record<string, unknown>
  if (candidate.schemaVersion !== WEEKLY_REPORT_SCHEMA_VERSION) {
    throw new WeeklyReportValidationError('Weekly report candidate schema is unsupported')
  }
  if (!Array.isArray(candidate.sentences) || candidate.sentences.length < 1 || candidate.sentences.length > 3) {
    throw new WeeklyReportValidationError('Weekly report candidate must contain one to three sentences')
  }

  const factValues = weeklyReportFactValues(facts)
  const validFactIds = new Set<string>(WEEKLY_REPORT_FACT_IDS)
  const sentences = candidate.sentences.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new WeeklyReportValidationError('Weekly report sentence must be an object')
    }
    const sentence = entry as Record<string, unknown>
    if (typeof sentence.text !== 'string' || !sentence.text.trim() || sentence.text.length > 180) {
      throw new WeeklyReportValidationError('Weekly report sentence text is invalid')
    }
    if (UNSAFE_REPORT_PATTERNS.some(pattern => pattern.test(sentence.text as string))) {
      throw new WeeklyReportValidationError('Weekly report sentence crosses the safety boundary')
    }
    if (!Array.isArray(sentence.factIds) || sentence.factIds.length === 0) {
      throw new WeeklyReportValidationError('Weekly report sentence requires fact references')
    }
    const factIds = sentence.factIds.map((factId) => {
      if (typeof factId !== 'string' || !validFactIds.has(factId)) {
        throw new WeeklyReportValidationError('Weekly report sentence references an unknown fact')
      }
      return factId as WeeklyReportFactId
    })
    const allowedNumbers = new Set(factIds.map(factId => String(factValues[factId])))
    const numbers = sentence.text.match(/\d+(?:\.\d+)?/g) ?? []
    if (numbers.some(number => !allowedNumbers.has(number))) {
      throw new WeeklyReportValidationError('Weekly report sentence contains an ungrounded number')
    }
    return { text: sentence.text.trim(), factIds }
  })

  if (
    !Array.isArray(candidate.limitations)
    || candidate.limitations.length !== 1
    || candidate.limitations[0] !== 'recording_absence_does_not_prove_medication_absence'
  ) {
    throw new WeeklyReportValidationError('Weekly report candidate is missing the required limitation')
  }

  return {
    schemaVersion: WEEKLY_REPORT_SCHEMA_VERSION,
    sentences,
    limitations: ['recording_absence_does_not_prove_medication_absence'],
  }
}

export function renderGroundedWeeklyReportCandidate(
  candidate: GroundedWeeklyReportCandidate
): string {
  const summary = candidate.sentences.map(sentence => sentence.text).join(' ')
  return `${summary} 記録の有無だけでは、実際に服薬したかどうかは判断できません。`
}

export const WEEKLY_REPORT_SYSTEM_PROMPT = `あなたは服薬管理アプリ「おくすりの約束」の記録サマリ作成アシスタントです。以下のルールを厳守してください。
- 入力JSONの集計事実だけを使い、中立的な日本語で2〜3文の週間サマリを作成する。
- 入力にない数値、日付、出来事、服薬状況を作り出さない。
- 医療アドバイス、診断、原因、傾向、薬の開始・中止・変更、受診判断を行わない。
- 記録がないことは服薬していないことを意味しないという制限をlimitationsへ含める。`
