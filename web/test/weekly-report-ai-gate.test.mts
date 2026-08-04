import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getBedrockWeeklyReportModelId,
  isBedrockWeeklyReportEnabled,
  WEEKLY_REPORT_SYSTEM_PROMPT,
} from '../src/lib/weekly-report.ts'

test('Bedrock weekly report is disabled unless explicitly enabled', () => {
  assert.equal(isBedrockWeeklyReportEnabled({}), false)
  assert.equal(isBedrockWeeklyReportEnabled({ BEDROCK_WEEKLY_REPORT_ENABLED: 'false' }), false)
  assert.equal(isBedrockWeeklyReportEnabled({ BEDROCK_WEEKLY_REPORT_ENABLED: 'TRUE' }), false)
  assert.equal(isBedrockWeeklyReportEnabled({ BEDROCK_WEEKLY_REPORT_ENABLED: 'true' }), true)
})

test('Bedrock model selection requires an explicit non-empty model ID', () => {
  assert.equal(getBedrockWeeklyReportModelId({}), null)
  assert.equal(getBedrockWeeklyReportModelId({ BEDROCK_WEEKLY_REPORT_MODEL_ID: '  ' }), null)
  assert.equal(
    getBedrockWeeklyReportModelId({ BEDROCK_WEEKLY_REPORT_MODEL_ID: 'provider.supported-model-v1' }),
    'provider.supported-model-v1'
  )
})

test('system prompt forbids medical advice and fabrication', () => {
  assert.ok(WEEKLY_REPORT_SYSTEM_PROMPT.includes('医療アドバイス'), 'mentions medical advice boundary')
  assert.ok(WEEKLY_REPORT_SYSTEM_PROMPT.includes('作り出さない'), 'forbids fabricating data')
  assert.ok(WEEKLY_REPORT_SYSTEM_PROMPT.includes('受診判断を行わない'), 'forbids care-seeking decisions')
})
