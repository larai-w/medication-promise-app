import assert from 'node:assert/strict'
import test from 'node:test'
import { isBedrockWeeklyReportEnabled } from '../src/lib/weekly-report.ts'

test('Bedrock weekly report is disabled unless explicitly enabled', () => {
  assert.equal(isBedrockWeeklyReportEnabled({}), false)
  assert.equal(isBedrockWeeklyReportEnabled({ BEDROCK_WEEKLY_REPORT_ENABLED: 'false' }), false)
  assert.equal(isBedrockWeeklyReportEnabled({ BEDROCK_WEEKLY_REPORT_ENABLED: 'TRUE' }), false)
  assert.equal(isBedrockWeeklyReportEnabled({ BEDROCK_WEEKLY_REPORT_ENABLED: 'true' }), true)
})
