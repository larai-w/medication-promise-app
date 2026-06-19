import { GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME, USER_ID, makePK, decodeSK, encodeSK } from '@/lib/dynamodb'
import type { DynamoRecord, MedicationRecord, UpdateRecordInput } from '@/types'

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

// PUT /api/records/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body: UpdateRecordInput = await request.json()
  const { time, timing, notes } = body

  const pk = makePK(USER_ID)
  const sk = decodeSK(id)
  const now = new Date().toISOString()

  const updateParts: string[] = ['updatedAt = :updatedAt']
  const values: Record<string, string> = { ':updatedAt': now }

  if (time !== undefined) { updateParts.push('#t = :time'); values[':time'] = time }
  if (timing !== undefined) { updateParts.push('timing = :timing'); values[':timing'] = timing }
  if (notes !== undefined) { updateParts.push('notes = :notes'); values[':notes'] = notes }

  const result = await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk, SK: sk },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeValues: values,
    // #t は DynamoDB の予約語 "time" を回避するためのエイリアス
    ...(time !== undefined && { ExpressionAttributeNames: { '#t': 'time' } }),
    ReturnValues: 'ALL_NEW',
  }))

  return Response.json(toApiRecord(result.Attributes as DynamoRecord))
}

// DELETE /api/records/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const pk = makePK(USER_ID)
  const sk = decodeSK(id)

  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk, SK: sk },
  }))

  return Response.json({ success: true })
}
