import { resolveRequestHousehold, unauthorizedHouseholdResponse } from '@/lib/household'
import { createRecordForHousehold, listRecordsForHousehold } from '@/lib/household-records.ts'
import { InputValidationError, isValidDate, parseCreateRecordInput } from '@/lib/record-validation'

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

  const records = await listRecordsForHousehold(household, { date: date ?? undefined, from: from ?? undefined, to: to ?? undefined })
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

  const record = await createRecordForHousehold(household, { date, time, timing, notes })
  return Response.json(record, { status: 201 })
}
