import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { TIMINGS } from '../src/lib/constants.ts'
import {
  buildBedrockWeeklyReportPrompt,
  buildWeeklyReportFacts,
  renderGroundedWeeklyReportCandidate,
  renderRuleBasedWeeklyReport,
  validateGroundedWeeklyReportCandidate,
  validateWeeklyReportFacts,
  WeeklyReportValidationError,
  type WeeklyReportFacts,
  type WeeklyReportRecord,
} from '../src/lib/weekly-report.ts'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/weekly-report-records.synthetic.json', import.meta.url), 'utf8')
) as {
  synthetic: boolean
  period: { from: string; to: string }
  records: WeeklyReportRecord[]
}

test('synthetic weekly records produce a fixed seven-day facts contract', () => {
  assert.equal(fixture.synthetic, true)
  const facts = buildWeeklyReportFacts(fixture.records, {
    ...fixture.period,
    expectedTimings: TIMINGS,
  })
  assert.deepEqual(facts, {
    schemaVersion: 1,
    windowDays: 7,
    expectedTimingsPerDay: 5,
    recordedDays: 3,
    missingDays: 4,
    uniqueRecordedSlots: 9,
    expectedSlots: 35,
    recordingCoveragePercent: 26,
    noteCount: 1,
    duplicateRecordCount: 1,
    invalidRecordCount: 1,
  })
})

test('model prompt contains aggregate facts but no dates, timings, or free text', () => {
  const facts = buildWeeklyReportFacts(fixture.records, {
    ...fixture.period,
    expectedTimings: TIMINGS,
  })
  const prompt = buildBedrockWeeklyReportPrompt(facts)
  assert.match(prompt, /"recording_coverage_percent":26/)
  assert.doesNotMatch(prompt, /2035-01/)
  assert.doesNotMatch(prompt, /朝|昼|晩|夜8時|夜9時/)
  assert.doesNotMatch(prompt, /SYNTHETIC_PRIVATE_NOTE/)
})

test('rule-based report describes records without claiming medication adherence', () => {
  const facts = buildWeeklyReportFacts(fixture.records, {
    ...fixture.period,
    expectedTimings: TIMINGS,
  })
  const report = renderRuleBasedWeeklyReport(facts)
  assert.match(report, /7日間のうち3日、9件の記録/)
  assert.match(report, /記録カバー率は26%/)
  assert.match(report, /実際に服薬したかどうかは判断できません/)
  assert.doesNotMatch(report, /完了率|良い調子|飲み忘れ/)
})

test('facts validation rejects internally inconsistent model input', () => {
  const invalidFacts: WeeklyReportFacts = {
    schemaVersion: 1,
    windowDays: 7,
    expectedTimingsPerDay: 5,
    recordedDays: 3,
    missingDays: 4,
    uniqueRecordedSlots: 9,
    expectedSlots: 35,
    recordingCoveragePercent: 99,
    noteCount: 0,
    duplicateRecordCount: 0,
    invalidRecordCount: 0,
  }
  assert.throws(
    () => validateWeeklyReportFacts(invalidFacts),
    WeeklyReportValidationError
  )
})

test('grounded candidate requires fact references and renders validated sentences', () => {
  const facts = buildWeeklyReportFacts(fixture.records, {
    ...fixture.period,
    expectedTimings: TIMINGS,
  })
  const candidate = validateGroundedWeeklyReportCandidate({
    schemaVersion: 1,
    sentences: [
      { text: '7日間のうち3日に記録があります。', factIds: ['window_days', 'recorded_days'] },
      { text: '記録カバー率は26%です。', factIds: ['recording_coverage_percent'] },
    ],
    limitations: ['recording_absence_does_not_prove_medication_absence'],
  }, facts)
  assert.equal(
    renderGroundedWeeklyReportCandidate(candidate),
    '7日間のうち3日に記録があります。 記録カバー率は26%です。 記録の有無だけでは、実際に服薬したかどうかは判断できません。'
  )
})

test('grounding gate rejects fabricated numbers and medication advice', () => {
  const facts = buildWeeklyReportFacts(fixture.records, {
    ...fixture.period,
    expectedTimings: TIMINGS,
  })
  const baseCandidate = {
    schemaVersion: 1,
    limitations: ['recording_absence_does_not_prove_medication_absence'],
  }
  assert.throws(
    () => validateGroundedWeeklyReportCandidate({
      ...baseCandidate,
      sentences: [{ text: '記録カバー率は99%です。', factIds: ['recording_coverage_percent'] }],
    }, facts),
    WeeklyReportValidationError
  )
  assert.throws(
    () => validateGroundedWeeklyReportCandidate({
      ...baseCandidate,
      sentences: [{ text: '薬を中止してください。', factIds: ['recorded_days'] }],
    }, facts),
    WeeklyReportValidationError
  )
})
