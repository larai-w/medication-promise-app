import { resolveRequestHousehold, unauthorizedHouseholdResponse } from '@/lib/household'
import { getMedicationSettings, putMedicationSettings } from '@/lib/settings-store'
import { parseMedicationSettingsInput, SettingsValidationError } from '@/lib/settings'

export async function GET(request: Request) {
  let household
  try {
    household = await resolveRequestHousehold(request)
  } catch (error) {
    const unauthorized = unauthorizedHouseholdResponse(error)
    if (unauthorized) return unauthorized
    throw error
  }

  return Response.json(await getMedicationSettings(household))
}

export async function PUT(request: Request) {
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
    input = parseMedicationSettingsInput(await request.json())
  } catch (error) {
    const message = error instanceof SettingsValidationError ? error.message : 'JSONの形式が正しくありません'
    return Response.json({ error: message }, { status: 400 })
  }

  return Response.json(await putMedicationSettings(input, household))
}
