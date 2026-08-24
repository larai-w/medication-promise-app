/**
 * Medication Promise — Refresh / History UX logic tests
 *
 * Tests the no-overwrite contract, visibility refresh debounce,
 * and date validation rules defined in REFRESH-HISTORY-DESIGN.md.
 *
 * Run: node --experimental-strip-types --test src/lib/sync/refresh-history.test.mts
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ─── Pure logic under test ───────────────────────────────────────────────────

/** Debounce window in milliseconds */
const REFRESH_DEBOUNCE_MS = 5_000

/** Maximum look-back window in days */
const MAX_LOOKBACK_DAYS = 30

/**
 * Determines whether a visibility-based refresh should fire.
 */
export function shouldRefreshOnVisibility(params: {
  visibilityState: 'visible' | 'hidden'
  lastFetchAt: number | null
  now: number
  modalOpen: boolean
  savingInProgress: boolean
}): { shouldRefresh: boolean; reason: string } {
  const { visibilityState, lastFetchAt, now, modalOpen, savingInProgress } = params

  if (visibilityState !== 'visible') {
    return { shouldRefresh: false, reason: 'tab-not-visible' }
  }
  if (modalOpen) {
    return { shouldRefresh: false, reason: 'modal-open' }
  }
  if (savingInProgress) {
    return { shouldRefresh: false, reason: 'save-in-progress' }
  }
  if (lastFetchAt !== null && now - lastFetchAt < REFRESH_DEBOUNCE_MS) {
    return { shouldRefresh: false, reason: 'debounce' }
  }
  return { shouldRefresh: true, reason: 'ok' }
}

/**
 * Validates a date string for history recording.
 * Returns null if valid, or an error message.
 */
export function validateHistoryDate(params: {
  dateStr: string
  todayStr: string
}): string | null {
  const { dateStr, todayStr } = params

  // Format check
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return 'invalid-format'
  }

  const date = new Date(`${dateStr}T00:00:00`)
  const today = new Date(`${todayStr}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return 'invalid-date'
  }

  // Future date check
  if (date > today) {
    return 'future-date-not-allowed'
  }

  // Look-back window check
  const minDate = new Date(today)
  minDate.setDate(minDate.getDate() - MAX_LOOKBACK_DAYS)
  if (date < minDate) {
    return 'exceeds-lookback-window'
  }

  return null
}

/**
 * Simulates the no-overwrite condition save logic.
 * Returns the HTTP status code and result.
 */
export function saveCondition(params: {
  existingCondition: { score: number; version: number } | null
  newScore: number
  overwrite: boolean
  expectedVersion?: number
}): { status: number; body: Record<string, unknown> } {
  const { existingCondition, newScore, overwrite, expectedVersion } = params

  // No existing condition → create
  if (!existingCondition) {
    return {
      status: 201,
      body: { score: newScore, version: 1, created: true },
    }
  }

  // Existing condition without overwrite flag → conflict
  if (!overwrite) {
    return {
      status: 409,
      body: {
        error: 'condition-exists',
        existing: existingCondition,
      },
    }
  }

  // Overwrite with version check
  if (expectedVersion !== undefined && expectedVersion !== existingCondition.version) {
    return {
      status: 409,
      body: {
        error: 'version-mismatch',
        currentVersion: existingCondition.version,
        expectedVersion,
      },
    }
  }

  // Successful overwrite
  return {
    status: 200,
    body: {
      score: newScore,
      version: existingCondition.version + 1,
      previousScore: existingCondition.score,
      overwritten: true,
    },
  }
}

/**
 * Simulates the medication record edit with optimistic concurrency.
 */
export function editMedicationRecord(params: {
  record: { id: string; version: number; medicationName: string; timing: string }
  expectedVersion: number
  updates: Partial<{ medicationName: string; timing: string }>
}): { status: number; body: Record<string, unknown> } {
  const { record, expectedVersion, updates } = params

  if (expectedVersion !== record.version) {
    return {
      status: 409,
      body: {
        error: 'version-mismatch',
        currentRecord: record,
      },
    }
  }

  return {
    status: 200,
    body: {
      ...record,
      ...updates,
      version: record.version + 1,
    },
  }
}

/**
 * Checks whether a medication record is within the immutability window.
 */
export function isRecordImmutable(params: {
  recordedAt: Date
  now: Date
  immutabilityWindowHours?: number
}): boolean {
  const { recordedAt, now, immutabilityWindowHours = 48 } = params
  const diffMs = now.getTime() - recordedAt.getTime()
  const diffHours = diffMs / (1_000 * 60 * 60)
  return diffHours > immutabilityWindowHours
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('shouldRefreshOnVisibility', () => {
  const baseNow = Date.now()

  it('T10: refreshes when visible, no modal, debounce elapsed', () => {
    const result = shouldRefreshOnVisibility({
      visibilityState: 'visible',
      lastFetchAt: baseNow - 10_000,
      now: baseNow,
      modalOpen: false,
      savingInProgress: false,
    })
    assert.equal(result.shouldRefresh, true)
    assert.equal(result.reason, 'ok')
  })

  it('T8: skips refresh while modal is open', () => {
    const result = shouldRefreshOnVisibility({
      visibilityState: 'visible',
      lastFetchAt: baseNow - 10_000,
      now: baseNow,
      modalOpen: true,
      savingInProgress: false,
    })
    assert.equal(result.shouldRefresh, false)
    assert.equal(result.reason, 'modal-open')
  })

  it('T9: skips refresh within debounce window', () => {
    const result = shouldRefreshOnVisibility({
      visibilityState: 'visible',
      lastFetchAt: baseNow - 3_000,
      now: baseNow,
      modalOpen: false,
      savingInProgress: false,
    })
    assert.equal(result.shouldRefresh, false)
    assert.equal(result.reason, 'debounce')
  })

  it('skips refresh when tab is hidden', () => {
    const result = shouldRefreshOnVisibility({
      visibilityState: 'hidden',
      lastFetchAt: null,
      now: baseNow,
      modalOpen: false,
      savingInProgress: false,
    })
    assert.equal(result.shouldRefresh, false)
    assert.equal(result.reason, 'tab-not-visible')
  })

  it('skips refresh while save is in progress', () => {
    const result = shouldRefreshOnVisibility({
      visibilityState: 'visible',
      lastFetchAt: baseNow - 10_000,
      now: baseNow,
      modalOpen: false,
      savingInProgress: true,
    })
    assert.equal(result.shouldRefresh, false)
    assert.equal(result.reason, 'save-in-progress')
  })

  it('allows refresh when lastFetchAt is null (first load)', () => {
    const result = shouldRefreshOnVisibility({
      visibilityState: 'visible',
      lastFetchAt: null,
      now: baseNow,
      modalOpen: false,
      savingInProgress: false,
    })
    assert.equal(result.shouldRefresh, true)
  })

  it('allows refresh at exactly debounce boundary', () => {
    const result = shouldRefreshOnVisibility({
      visibilityState: 'visible',
      lastFetchAt: baseNow - REFRESH_DEBOUNCE_MS,
      now: baseNow,
      modalOpen: false,
      savingInProgress: false,
    })
    assert.equal(result.shouldRefresh, true)
  })
})

describe('validateHistoryDate', () => {
  const today = '2026-08-22'

  it('T6: rejects future dates', () => {
    const error = validateHistoryDate({ dateStr: '2026-08-23', todayStr: today })
    assert.equal(error, 'future-date-not-allowed')
  })

  it('accepts today', () => {
    const error = validateHistoryDate({ dateStr: today, todayStr: today })
    assert.equal(error, null)
  })

  it('accepts yesterday', () => {
    const error = validateHistoryDate({ dateStr: '2026-08-21', todayStr: today })
    assert.equal(error, null)
  })

  it('T7: rejects dates beyond 30-day lookback', () => {
    // 2026-07-22 is 31 days before 2026-08-22
    const error = validateHistoryDate({ dateStr: '2026-07-22', todayStr: today })
    assert.equal(error, 'exceeds-lookback-window')
  })

  it('accepts date at exactly 30 days back', () => {
    // 2026-07-23 is 30 days before 2026-08-22
    const error = validateHistoryDate({ dateStr: '2026-07-23', todayStr: today })
    assert.equal(error, null)
  })

  it('rejects invalid format', () => {
    const error = validateHistoryDate({ dateStr: '2026/08/22', todayStr: today })
    assert.equal(error, 'invalid-format')
  })

  it('rejects invalid date values', () => {
    const error = validateHistoryDate({ dateStr: '2026-13-01', todayStr: today })
    assert.equal(error, 'invalid-date')
  })
})

describe('saveCondition (no-overwrite contract)', () => {
  it('T1: creates condition when none exists', () => {
    const result = saveCondition({
      existingCondition: null,
      newScore: 4,
      overwrite: false,
    })
    assert.equal(result.status, 201)
    assert.equal(result.body.score, 4)
    assert.equal(result.body.version, 1)
  })

  it('T2: returns 409 when condition exists and no overwrite flag', () => {
    const result = saveCondition({
      existingCondition: { score: 3, version: 1 },
      newScore: 5,
      overwrite: false,
    })
    assert.equal(result.status, 409)
    assert.equal(result.body.error, 'condition-exists')
    assert.equal((result.body.existing as Record<string, unknown>).score, 3)
  })

  it('T3: overwrites successfully with correct version', () => {
    const result = saveCondition({
      existingCondition: { score: 3, version: 2 },
      newScore: 5,
      overwrite: true,
      expectedVersion: 2,
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.score, 5)
    assert.equal(result.body.version, 3)
    assert.equal(result.body.previousScore, 3)
  })

  it('T5 variant: rejects overwrite with stale version', () => {
    const result = saveCondition({
      existingCondition: { score: 3, version: 3 },
      newScore: 5,
      overwrite: true,
      expectedVersion: 2,
    })
    assert.equal(result.status, 409)
    assert.equal(result.body.error, 'version-mismatch')
  })

  it('allows overwrite without expectedVersion (explicit overwrite=true)', () => {
    const result = saveCondition({
      existingCondition: { score: 2, version: 1 },
      newScore: 4,
      overwrite: true,
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.version, 2)
  })
})

describe('editMedicationRecord (optimistic concurrency)', () => {
  const record = {
    id: 'rec-001',
    version: 3,
    medicationName: 'レボドパ',
    timing: 'morning' as const,
  }

  it('T4: edits successfully with correct expectedVersion', () => {
    const result = editMedicationRecord({
      record,
      expectedVersion: 3,
      updates: { timing: 'noon' },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.timing, 'noon')
    assert.equal(result.body.version, 4)
    assert.equal(result.body.medicationName, 'レボドパ')
  })

  it('T5: returns 409 with stale expectedVersion, original unchanged', () => {
    const result = editMedicationRecord({
      record,
      expectedVersion: 2,
      updates: { timing: 'evening' },
    })
    assert.equal(result.status, 409)
    assert.equal(result.body.error, 'version-mismatch')
    assert.equal((result.body.currentRecord as typeof record).timing, 'morning')
  })
})

describe('isRecordImmutable (48h window)', () => {
  const now = new Date('2026-08-22T12:00:00')

  it('record from 1 hour ago is editable', () => {
    const recordedAt = new Date('2026-08-22T11:00:00')
    assert.equal(isRecordImmutable({ recordedAt, now }), false)
  })

  it('record from 47 hours ago is editable', () => {
    const recordedAt = new Date('2026-08-20T13:00:00')
    assert.equal(isRecordImmutable({ recordedAt, now }), false)
  })

  it('record from 49 hours ago is immutable', () => {
    const recordedAt = new Date('2026-08-20T11:00:00')
    assert.equal(isRecordImmutable({ recordedAt, now }), true)
  })

  it('record from 3 days ago is immutable', () => {
    const recordedAt = new Date('2026-08-19T12:00:00')
    assert.equal(isRecordImmutable({ recordedAt, now }), true)
  })

  it('respects custom immutability window', () => {
    const recordedAt = new Date('2026-08-22T00:00:00')
    // 12 hours ago, with 6-hour window → immutable
    assert.equal(isRecordImmutable({ recordedAt, now, immutabilityWindowHours: 6 }), true)
    // 12 hours ago, with 24-hour window → editable
    assert.equal(isRecordImmutable({ recordedAt, now, immutabilityWindowHours: 24 }), false)
  })
})