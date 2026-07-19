import { rejectUnauthorizedMvpRequest } from '@/lib/mvp-access'
import { getMedicationSettings, putMedicationSettings } from '@/lib/settings-store'
import { parseMedicationSettingsInput, SettingsValidationError } from '@/lib/settings'

export async function GET(request: Request) {
  const unauthorized = await rejectUnauthorizedMvpRequest(request)
  if (unauthorized) return unauthorized

  return Response.json(await getMedicationSettings())
}

export async function PUT(request: Request) {
  const unauthorized = await rejectUnauthorizedMvpRequest(request)
  if (unauthorized) return unauthorized

  let input
  try {
    input = parseMedicationSettingsInput(await request.json())
  } catch (error) {
    const message = error instanceof SettingsValidationError ? error.message : 'JSONの形式が正しくありません'
    return Response.json({ error: message }, { status: 400 })
  }

  return Response.json(await putMedicationSettings(input))
}
