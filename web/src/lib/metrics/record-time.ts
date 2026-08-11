export interface RecordTimeMetric {
  product: 'medpromise'
  channel: 'web'
  durationMs: number
}

export class RecordTimeMetricValidationError extends Error {}

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
