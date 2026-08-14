import { randomUUID } from 'node:crypto'

export interface RecordTimeMetric {
  product: 'medpromise'
  channel: 'web'
  durationMs: number
}

export class RecordTimeMetricValidationError extends Error {}

// ADR-0007 制約3: 保存期間は35日（DynamoDB TTL）。
// route.ts に直書きすると Next.js 抜きでは検証できないため、純粋な lib 側に置く。
export const METRICS_TTL_SECONDS = 35 * 24 * 60 * 60

// 書き込む item の組み立て。AWS を呼ばずに中身を検証できるよう切り出している。
export function buildRecordTimeMetricItem(
  metric: RecordTimeMetric,
  observedAt: Date = new Date(),
  id: string = randomUUID()
) {
  return {
    pk: `medpromise#${id}`,
    sk: observedAt.toISOString(),
    product: 'medpromise' as const,
    channel: 'web' as const,
    eventType: 'record_saved' as const,
    durationMs: metric.durationMs,
    date: observedAt.toISOString().slice(0, 10),
    ttl: Math.floor(observedAt.getTime() / 1000) + METRICS_TTL_SECONDS,
  }
}

const ALLOWED_FIELDS = new Set(['product', 'channel', 'durationMs'])

export function isMetricsCollectionEnabled(env: Record<string, string | undefined> = process.env) {
  return env.METRICS_COLLECTION_ENABLED === 'true'
}

export function parseRecordTimeMetric(value: unknown): RecordTimeMetric {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RecordTimeMetricValidationError('Invalid metric payload')
  }

  const body = value as Record<string, unknown>
  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
    throw new RecordTimeMetricValidationError('Unexpected metric field')
  }

  const durationMs = Number(body.durationMs)
  if (
    body.product !== 'medpromise' ||
    body.channel !== 'web' ||
    !Number.isInteger(durationMs) ||
    durationMs < 100 ||
    durationMs > 3_600_000
  ) {
    throw new RecordTimeMetricValidationError('Invalid metric value')
  }

  return { product: 'medpromise', channel: 'web', durationMs }
}
