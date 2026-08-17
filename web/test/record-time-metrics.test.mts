import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  buildRecordTimeMetricItem,
  isMetricsCollectionEnabled,
  METRICS_TTL_SECONDS,
  parseRecordTimeMetric,
  RecordTimeMetricValidationError,
} from '../src/lib/metrics/record-time.ts'

test('measurement collection is disabled unless explicitly enabled', () => {
  const table = 'veai-ben004-metrics-test'
  assert.equal(isMetricsCollectionEnabled({}), false)
  assert.equal(isMetricsCollectionEnabled({ METRICS_COLLECTION_ENABLED: 'false', METRICS_TABLE: table }), false)
  assert.equal(isMetricsCollectionEnabled({ METRICS_COLLECTION_ENABLED: 'true', METRICS_TABLE: table }), true)
})

// F-03: テーブル名が未設定のまま収集が有効になると、本番テーブルへ書きうる。
// フラグとテーブル名の両方が揃ったときだけ有効にする。
test('measurement stays disabled when the table name is missing', () => {
  assert.equal(isMetricsCollectionEnabled({ METRICS_COLLECTION_ENABLED: 'true' }), false)
  assert.equal(isMetricsCollectionEnabled({ METRICS_COLLECTION_ENABLED: 'true', METRICS_TABLE: '' }), false)
})

// 計測テーブル名は stage を必ず含める。無印を production 用にすると
// 条件分岐が要り、stage 未設定時に本番へ倒れる経路が残る。
test('metrics table name is stage-scoped in the IaC, never a bare production name', async () => {
  const config = await readFile(new URL('../sst.config.ts', import.meta.url), 'utf8')

  assert.match(
    config,
    /const metricsTableName = `veai-ben004-metrics-\$\{\$app\.stage\}`/,
    '計測テーブル名が stage スコープになっていない'
  )
  assert.equal(
    /['"`]veai-ben004-metrics['"`]/.test(config),
    false,
    'stage を含まない裸のテーブル名が残っている'
  )
  assert.equal(
    config.includes('METRICS_TABLE: metricsTableName'),
    true,
    'Lambda に渡すテーブル名が stage スコープの値になっていない'
  )
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

// RB-0015 の承認チェック#4 が要求する5項目のうち、値域と TTL。
// API認証は api-boundary-inventory.test.mts が resolveRequestHousehold を要求して担保する。
test('record-time contract rejects out-of-range and non-integer durations', () => {
  const base = { product: 'medpromise' as const, channel: 'web' as const }
  for (const durationMs of [99, 3_600_001, 1200.5, Number.NaN, null, undefined, 'abc', {}]) {
    assert.throws(
      () => parseRecordTimeMetric({ ...base, durationMs }),
      RecordTimeMetricValidationError,
      `durationMs=${String(durationMs)} が拒否されていない`
    )
  }

  for (const durationMs of [100, 3_600_000]) {
    assert.equal(parseRecordTimeMetric({ ...base, durationMs }).durationMs, durationMs)
  }

  // 数値化できる文字列は Number() で受理する（意図された挙動）。
  // ただし保存されるのは必ず数値で、クライアントの型は持ち込まない。
  assert.strictEqual(parseRecordTimeMetric({ ...base, durationMs: '1200' }).durationMs, 1200)
})

test('stored metric expires after 35 days and carries no identifiers', () => {
  assert.equal(METRICS_TTL_SECONDS, 35 * 24 * 60 * 60)

  const observedAt = new Date('2026-08-14T12:00:00.000Z')
  const item = buildRecordTimeMetricItem(
    { product: 'medpromise', channel: 'web', durationMs: 1200 },
    observedAt,
    'fixed-id'
  )
  assert.equal(item.ttl, Math.floor(observedAt.getTime() / 1000) + 35 * 24 * 60 * 60)

  // ブラックリスト: 記録本文やクライアント由来の識別子を持ち込まない
  for (const forbidden of ['recordId', 'sessionId', 'userId', 'householdId', 'memo', 'medication']) {
    assert.equal(forbidden in item, false, `${forbidden} が item に混入している`)
  }
})
