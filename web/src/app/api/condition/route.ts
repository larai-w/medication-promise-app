import { resolveRequestHousehold, unauthorizedHouseholdResponse } from '@/lib/household'
import { getDailyConditionForHousehold, putDailyConditionForHousehold } from '@/lib/household-records'
import { InputValidationError, isValidDate, parseDailyConditionInput } from '@/lib/record-validation'

async function resolve(request: Request) {
  try { return { household: await resolveRequestHousehold(request) } } catch (error) {
    const response = unauthorizedHouseholdResponse(error)
    if (response) return { response }
    throw error
  }
}

export async function GET(request: Request) {
  const resolved = await resolve(request)
  if (resolved.response) return resolved.response
  const date = new URL(request.url).searchParams.get('date')
  if (!isValidDate(date)) return Response.json({ error: '日付が正しくありません' }, { status: 400 })
  return Response.json(await getDailyConditionForHousehold(resolved.household, date), { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: Request) {
  const resolved = await resolve(request)
  if (resolved.response) return resolved.response
  try {
    const input = parseDailyConditionInput(await request.json())
    return Response.json(await putDailyConditionForHousehold(resolved.household, input), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof InputValidationError) return Response.json({ error: error.message }, { status: 400 })
    throw error
  }
}
