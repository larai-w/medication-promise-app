import { QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { docClient, TABLE_NAME, makeSK, encodeSK } from '@/lib/dynamodb'
import type { DynamoRecord, MedicationRecord } from '@/types'
import { resolveRequestHousehold, unauthorizedHouseholdResponse } from '@/lib/household'
import { InputValidationError, isValidDate, parseCreateRecordInput } from '@/lib/record-validation'

function toApiRecord(item: DynamoRecord): MedicationRecord {
  return {
    id: encodeSK(item.SK),
    userId: item.userId,
    date: item.date,
    time: item.time,
    timing: item.timing,
    source: item.source,
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

// GET /api/records?date=YYYY-MM-DD
// GET /api/records?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: Request) {
  let household
  try {
    household = await resolveRequestHousehold(request)
  } catch (error) {
    const unauthorized = unauthorizedHouseholdResponse(error)
    if (unauthorized) return unauthorized
    throw error
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (date && !isValidDate(date)) {
    return Response.json({ error: '日付が正しくありません' }, { status: 400 })
  }
  if ((from && !isValidDate(from)) || (to && !isValidDate(to)) || Boolean(from) !== Boolean(to)) {
    return Response.json({ error: 'from/toには正しい日付を両方指定してください' }, { status: 400 })
  }
  if (from && to && from > to) {
    return Response.json({ error: 'fromはto以前の日付を指定してください' }, { status: 400 })
  }

  let keyCondition: string
  let expressionValues: Record<string, string>

  if (date) {
    keyCondition = 'PK = :pk AND begins_with(SK, :prefix)'
    expressionValues = { ':pk': household.partitionKey, ':prefix': `RECORD#${date}` }
  } else if (from && to) {
    keyCondition = 'PK = :pk AND SK BETWEEN :from AND :to'
    expressionValues = { ':pk': household.partitionKey, ':from': `RECORD#${from}`, ':to': `RECORD#${to}~` }
  } else {
    return Response.json({ error: 'date または from/to が必要です' }, { status: 400 })
  }

  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: expressionValues,
    ScanIndexForward: true,
  }))

  const records = (result.Items as DynamoRecord[] ?? []).map(toApiRecord)
  return Response.json(records)
}

// POST /api/records
export async function POST(request: Request) {
  let household
  try {
    household = await resolveRequestHousehold(request)
  } catch (error) {
    const unauthorized = unauthorizedHouseholdResponse(error)
    if (unauthorized) return unauthorized
    throw error
  }

  let input
  try {
    input = parseCreateRecordInput(await request.json())
  } catch (error) {
    const message = error instanceof InputValidationError ? error.message : 'JSONの形式が正しくありません'
    return Response.json({ error: message }, { status: 400 })
  }
  const { date, time, timing, notes } = input

  const uuid = randomUUID()
  const sk = makeSK(date, time, uuid)
  const now = new Date().toISOString()

  const item: DynamoRecord = {
    PK: household.partitionKey,
    SK: sk,
    userId: household.householdId,
    date,
    time,
    timing,
    source: 'manual',
    notes,
    createdAt: now,
  }

  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }))

  return Response.json(toApiRecord(item), { status: 201 })
}
