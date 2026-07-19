import { UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME, decodeSK, encodeSK } from '@/lib/dynamodb'
import type { DynamoRecord, MedicationRecord } from '@/types'
import { resolveRequestHousehold, unauthorizedHouseholdResponse } from '@/lib/household'
import { InputValidationError, parseUpdateRecordInput, validateRecordSortKey } from '@/lib/record-validation'

function isNotFoundError(error: unknown) {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException'
}

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
  let household
  try {
    household = await resolveRequestHousehold(request)
  } catch (error) {
    const unauthorized = unauthorizedHouseholdResponse(error)
    if (unauthorized) return unauthorized
    throw error
  }

  const { id } = await params
  let input
  try {
    input = parseUpdateRecordInput(await request.json())
  } catch (error) {
    const message = error instanceof InputValidationError ? error.message : 'JSONの形式が正しくありません'
    return Response.json({ error: message }, { status: 400 })
  }
  const { time, timing, notes } = input

  let sk
  try {
    sk = validateRecordSortKey(decodeSK(id))
  } catch (error) {
    const message = error instanceof InputValidationError ? error.message : '記録IDが正しくありません'
    return Response.json({ error: message }, { status: 400 })
  }
  const now = new Date().toISOString()

  const updateParts: string[] = ['updatedAt = :updatedAt']
  const values: Record<string, string> = { ':updatedAt': now }

  if (time !== undefined) { updateParts.push('#t = :time'); values[':time'] = time }
  if (timing !== undefined) { updateParts.push('timing = :timing'); values[':timing'] = timing }
  if (notes !== undefined) { updateParts.push('notes = :notes'); values[':notes'] = notes }

  let result
  try {
    result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: household.partitionKey, SK: sk },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
      // #t は DynamoDB の予約語 "time" を回避するためのエイリアス
      ...(time !== undefined && { ExpressionAttributeNames: { '#t': 'time' } }),
      ReturnValues: 'ALL_NEW',
    }))
  } catch (error) {
    if (isNotFoundError(error)) return Response.json({ error: '記録が見つかりません' }, { status: 404 })
    throw error
  }

  return Response.json(toApiRecord(result.Attributes as DynamoRecord))
}

// DELETE /api/records/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let household
  try {
    household = await resolveRequestHousehold(request)
  } catch (error) {
    const unauthorized = unauthorizedHouseholdResponse(error)
    if (unauthorized) return unauthorized
    throw error
  }

  const { id } = await params
  let sk
  try {
    sk = validateRecordSortKey(decodeSK(id))
  } catch (error) {
    const message = error instanceof InputValidationError ? error.message : '記録IDが正しくありません'
    return Response.json({ error: message }, { status: 400 })
  }

  try {
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: household.partitionKey, SK: sk },
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
    }))
  } catch (error) {
    if (isNotFoundError(error)) return Response.json({ error: '記録が見つかりません' }, { status: 404 })
    throw error
  }

  return Response.json({ success: true })
}
