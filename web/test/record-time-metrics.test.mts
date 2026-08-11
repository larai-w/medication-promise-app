import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isMetricsCollectionEnabled,
  parseRecordTimeMetric,
  RecordTimeMetricValidationError,
} from '../src/lib/metrics/record-time.ts'

test('measurement collection is disabled unless explicitly enabled', () => {
  assert.equal(isMetricsCollectionEnabled({}), false)
  assert.equal(isMetricsCollectionEnabled({ METRICS_COLLECTION_ENABLED: 'false' }), false)
  assert.equal(isMetricsCollectionEnabled({ METRICS_COLLECTION_ENABLED: 'true' }), true)
})

test('record-time contract accepts only identifier-free values', () => {
  assert.deepEqual(
    parseRecordTimeMetric({ product: 'medpromise', channel: 'web', durationMs: 1200 }),
    { product: 'medpromise', channel: 'web', durationMs: 1200 }
  )

  assert.throws(
    () => parseRecordTimeMetric({ product: 'medpromise', channel: 'web', durationMs: 1200, recordId: 'x' }),
    RecordTimeMetricValidationError
  )
  assert.throws(
    () => parseRecordTimeMetric({ product: 'medpromise', channel: 'web', durationMs: 99 }),
    RecordTimeMetricValidationError
  )
})
