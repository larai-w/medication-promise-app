import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeRecordIntegrity } from '../src/lib/record-integrity.ts'
import type { MedicationRecord } from '../src/types/index.ts'

const record = (overrides: Partial<MedicationRecord> = {}): MedicationRecord => ({
  id: overrides.id ?? 'record-1',
  userId: 'household-1',
  date: overrides.date ?? '2035-01-15',
  time: overrides.time ?? '08:00',
  timing: overrides.timing ?? '朝',
  source: overrides.source ?? 'manual',
  createdAt: '2035-01-15T00:00:00.000Z',
  ...overrides,
})

test('detects duplicate timing records with date and evidence', () => {
  const result = analyzeRecordIntegrity([
    record(),
    record({ id: 'record-2', time: '08:05' }),
  ], '2035-01-15')

  assert.equal(result.duplicateCount, 1)
  assert.match(result.issues[0].reason, /2035-01-15.*朝.*2件/)
})

test('detects a response containing a record for the wrong selected date', () => {
  const result = analyzeRecordIntegrity([record({ date: '2035-01-14' })], '2035-01-15')

  assert.equal(result.dateMismatchCount, 1)
  assert.match(result.issues[0].reason, /2035-01-15.*2035-01-14/)
})

test('marks Alexa-originated records as needing review without asserting medication status', () => {
  const result = analyzeRecordIntegrity([record({ source: 'alexa' })], '2035-01-15')

  assert.equal(result.unconfirmedCount, 1)
  assert.match(result.issues[0].reason, /音声入力由来/)
  assert.doesNotMatch(result.issues[0].reason, /服薬済み|飲んだ/)
})

test('returns no issue for one manual record per timing on the selected date', () => {
  const result = analyzeRecordIntegrity([record()], '2035-01-15')

  assert.deepEqual(result, {
    issues: [],
    hasIssues: false,
    duplicateCount: 0,
    dateMismatchCount: 0,
    unconfirmedCount: 0,
  })
})

test('does not keep a reviewed Alexa record in the confirmation-needed list', () => {
  const result = analyzeRecordIntegrity([record({ source: 'alexa', reviewStatus: 'reviewed' })], '2035-01-15')

  assert.equal(result.hasIssues, false)
})
