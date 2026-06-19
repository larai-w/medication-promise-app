import { QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { docClient, TABLE_NAME, USER_ID, makePK, makeSK, encodeSK } from '@/lib/dynamodb'
import type { DynamoRecord, MedicationRecord, CreateRecordInput } from '@/types'

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
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const pk = makePK(USER_ID)
  let keyCondition: string
  let expressionValues: Record<string, string>

  if (date) {
    keyCondition = 'PK = :pk AND begins_with(SK, :prefix)'
    expressionValues = { ':pk': pk, ':prefix': `RECORD#${date}` }
  } else if (from && to) {
    keyCondition = 'PK = :pk AND SK BETWEEN :from AND :to'
    expressionValues = { ':pk': pk, ':from': `RECORD#${from}`, ':to': `RECORD#${to}~` }
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
  const body: CreateRecordInput = await request.json()
  const { date, time, timing, source = 'manual', notes } = body

  if (!date || !time || !timing) {
    return Response.json({ error: 'date, time, timing は必須です' }, { status: 400 })
  }

  const uuid = randomUUID()
  const pk = makePK(USER_ID)
  const sk = makeSK(date, time, uuid)
  const now = new Date().toISOString()

  const item: DynamoRecord = {
    PK: pk,
    SK: sk,
    userId: USER_ID,
    date,
    time,
    timing,
    source,
    notes,
    createdAt: now,
  }

  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }))

  return Response.json(toApiRecord(item), { status: 201 })
}
