import { getDaysInMonth } from 'date-fns'
import {
  resolveRequestHousehold,
  unauthorizedHouseholdResponse,
  type AuthenticatedHousehold,
} from './household.ts'
import {
  createRecordForHousehold,
  deleteRecordForHousehold,
  listRecordsForHousehold,
  updateRecordForHousehold,
} from './household-records.ts'
import { decodeSK } from './dynamodb.ts'
import {
  InputValidationError,
  isValidDate,
  isValidMonth,
  parseCreateRecordInput,
  parseUpdateRecordInput,
  validateRecordSortKey,
} from './record-validation.ts'
import { getMedicationSettings, putMedicationSettings } from './settings-store.ts'
import { parseMedicationSettingsInput, SettingsValidationError } from './settings.ts'
import type { MedicationRecord } from '../types/index.ts'

type HouseholdResolver = (request: Request) => Promise<AuthenticatedHousehold>

async function resolveForApi(request: Request, resolver: HouseholdResolver) {
  try {
    return { household: await resolver(request) }
  } catch (error) {
    const response = unauthorizedHouseholdResponse(error)
    if (response) return { response }
    throw error
  }
}

export function makeRecordsHandlers({
  resolveHousehold = resolveRequestHousehold,
  listRecords = listRecordsForHousehold,
  createRecord = createRecordForHousehold,
}: {
  resolveHousehold?: HouseholdResolver
  listRecords?: typeof listRecordsForHousehold
  createRecord?: typeof createRecordForHousehold
} = {}) {
  return {
    async GET(request: Request) {
      const resolved = await resolveForApi(request, resolveHousehold)
      if (resolved.response) return resolved.response

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

      return Response.json(await listRecords(
        resolved.household,
        { date: date ?? undefined, from: from ?? undefined, to: to ?? undefined }
      ))
    },

    async POST(request: Request) {
      const resolved = await resolveForApi(request, resolveHousehold)
      if (resolved.response) return resolved.response

      let input
      try {
        input = parseCreateRecordInput(await request.json())
      } catch (error) {
        const message = error instanceof InputValidationError
          ? error.message
          : 'JSONの形式が正しくありません'
        return Response.json({ error: message }, { status: 400 })
      }

      const record = await createRecord(resolved.household, input)
      return Response.json(record, { status: 201 })
    },
  }
}

export function makeRecordItemHandlers({
  resolveHousehold = resolveRequestHousehold,
  updateRecord = updateRecordForHousehold,
  deleteRecord = deleteRecordForHousehold,
}: {
  resolveHousehold?: HouseholdResolver
  updateRecord?: typeof updateRecordForHousehold
  deleteRecord?: typeof deleteRecordForHousehold
} = {}) {
  return {
    async PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
      const resolved = await resolveForApi(request, resolveHousehold)
      if (resolved.response) return resolved.response

      const { id } = await params
      let input
      try {
        input = parseUpdateRecordInput(await request.json())
      } catch (error) {
        const message = error instanceof InputValidationError
          ? error.message
          : 'JSONの形式が正しくありません'
        return Response.json({ error: message }, { status: 400 })
      }

      try {
        validateRecordSortKey(decodeSK(id))
      } catch (error) {
        const message = error instanceof InputValidationError
          ? error.message
          : '記録IDが正しくありません'
        return Response.json({ error: message }, { status: 400 })
      }

      try {
        return Response.json(await updateRecord(resolved.household, id, input))
      } catch (error) {
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
          return Response.json({ error: '記録が見つかりません' }, { status: 404 })
        }
        throw error
      }
    },

    async DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
      const resolved = await resolveForApi(request, resolveHousehold)
      if (resolved.response) return resolved.response

      const { id } = await params
      try {
        validateRecordSortKey(id ? decodeSK(id) : '')
      } catch (error) {
        const message = error instanceof InputValidationError
          ? error.message
          : '記録IDが正しくありません'
        return Response.json({ error: message }, { status: 400 })
      }

      try {
        return Response.json(await deleteRecord(resolved.household, id))
      } catch (error) {
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
          return Response.json({ error: '記録が見つかりません' }, { status: 404 })
        }
        throw error
      }
    },
  }
}

export function makePdfHandler({
  resolveHousehold = resolveRequestHousehold,
  listRecords = listRecordsForHousehold,
  renderPdf,
}: {
  resolveHousehold?: HouseholdResolver
  listRecords?: typeof listRecordsForHousehold
  renderPdf: (
    records: MedicationRecord[],
    yearMonth: string,
    daysInMonth: number
  ) => Promise<Uint8Array>
}) {
  return async function GET(request: Request) {
    const resolved = await resolveForApi(request, resolveHousehold)
    if (resolved.response) return resolved.response

    const month = new URL(request.url).searchParams.get('month')
    if (!isValidMonth(month)) {
      return Response.json({ error: 'month パラメータが必要です (例: 2026-06)' }, { status: 400 })
    }

    const [year, mon] = month.split('-').map(Number)
    const days = getDaysInMonth(new Date(year, mon - 1, 1))
    const records = await listRecords(resolved.household, {
      from: `${month}-01`,
      to: `${month}-${String(days).padStart(2, '0')}`,
    })
    const pdf = await renderPdf(records, month, days)
    return new Response(Uint8Array.from(pdf).buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="drug-and-oath-${month}.pdf"`,
      },
    })
  }
}

export function makeSettingsHandlers({
  resolveHousehold = resolveRequestHousehold,
  getSettings = getMedicationSettings,
  putSettings = putMedicationSettings,
}: {
  resolveHousehold?: HouseholdResolver
  getSettings?: typeof getMedicationSettings
  putSettings?: typeof putMedicationSettings
} = {}) {
  return {
    async GET(request: Request) {
      const resolved = await resolveForApi(request, resolveHousehold)
      if (resolved.response) return resolved.response
      return Response.json(await getSettings(resolved.household))
    },

    async PUT(request: Request) {
      const resolved = await resolveForApi(request, resolveHousehold)
      if (resolved.response) return resolved.response

      let input
      try {
        input = parseMedicationSettingsInput(await request.json())
      } catch (error) {
        const message = error instanceof SettingsValidationError
          ? error.message
          : 'JSONの形式が正しくありません'
        return Response.json({ error: message }, { status: 400 })
      }
      return Response.json(await putSettings(input, resolved.household))
    },
  }
}
