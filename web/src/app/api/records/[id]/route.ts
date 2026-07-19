import { resolveRequestHousehold, unauthorizedHouseholdResponse } from '@/lib/household'
import { deleteRecordForHousehold, updateRecordForHousehold } from '@/lib/household-records.ts'
import { decodeSK } from '@/lib/dynamodb.ts'
import { InputValidationError, parseUpdateRecordInput, validateRecordSortKey } from '@/lib/record-validation'

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

  try {
    validateRecordSortKey(decodeSK(id))
  } catch (error) {
    const message = error instanceof InputValidationError ? error.message : '記録IDが正しくありません'
    return Response.json({ error: message }, { status: 400 })
  }
  try {
    return Response.json(await updateRecordForHousehold(household, id, { time, timing, notes }))
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return Response.json({ error: '記録が見つかりません' }, { status: 404 })
    }
    throw error
  }
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
  try {
    validateRecordSortKey(id ? Buffer.from(id, 'base64url').toString('utf-8') : '')
  } catch (error) {
    const message = error instanceof InputValidationError ? error.message : '記録IDが正しくありません'
    return Response.json({ error: message }, { status: 400 })
  }

  try {
    return Response.json(await deleteRecordForHousehold(household, id))
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return Response.json({ error: '記録が見つかりません' }, { status: 404 })
    }
    throw error
  }
}
