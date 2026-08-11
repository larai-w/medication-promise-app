import { randomUUID } from 'node:crypto'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../../../../lib/dynamodb.ts'
import { resolveRequestHousehold, unauthorizedHouseholdResponse } from '../../../../lib/household.ts'
import {
  isMetricsCollectionEnabled,
  parseRecordTimeMetric,
  RecordTimeMetricValidationError,
} from '../../../../lib/metrics/record-time.ts'

const TTL_SECONDS = 35 * 24 * 60 * 60

export async function POST(request: Request) {
  if (!isMetricsCollectionEnabled()) {
    return Response.json({ error: 'Metrics collection disabled' }, { status: 503 })
  }

  try {
    await resolveRequestHousehold(request)
  } catch (error) {
    const response = unauthorizedHouseholdResponse(error)
    if (response) return response
    throw error
  }

  try {
    const metric = parseRecordTimeMetric(await request.json())

    const observedAt = new Date()
    await docClient.send(new PutCommand({
      TableName: process.env.METRICS_TABLE,
      Item: {
        pk: `medpromise#${randomUUID()}`,
        sk: observedAt.toISOString(),
        product: 'medpromise',
        channel: 'web',
        eventType: 'record_saved',
        durationMs: metric.durationMs,
        date: observedAt.toISOString().slice(0, 10),
        ttl: Math.floor(observedAt.getTime() / 1000) + TTL_SECONDS,
      },
    }))

    return Response.json({ success: true })
  } catch (error) {
    if (error instanceof RecordTimeMetricValidationError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
