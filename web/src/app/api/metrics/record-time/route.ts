import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../../../../lib/dynamodb.ts'
import { resolveRequestHousehold, unauthorizedHouseholdResponse } from '../../../../lib/household.ts'
import {
  buildRecordTimeMetricItem,
  isMetricsCollectionEnabled,
  parseRecordTimeMetric,
  RecordTimeMetricValidationError,
} from '../../../../lib/metrics/record-time.ts'

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

    await docClient.send(new PutCommand({
      TableName: process.env.METRICS_TABLE,
      Item: buildRecordTimeMetricItem(metric),
    }))

    return Response.json({ success: true })
  } catch (error) {
    if (error instanceof RecordTimeMetricValidationError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
