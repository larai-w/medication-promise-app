import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { getDaysInMonth } from 'date-fns'
import MedPdfDocument from '@/lib/MedPdfDocument'
import { resolveRequestHousehold, unauthorizedHouseholdResponse } from '@/lib/household'
import { listRecordsForHousehold } from '@/lib/household-records.ts'
import { isValidMonth } from '@/lib/record-validation'

// GET /api/records/pdf?month=YYYY-MM
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
  const month = searchParams.get('month') // e.g. "2026-06"

  if (!isValidMonth(month)) {
    return Response.json({ error: 'month パラメータが必要です (例: 2026-06)' }, { status: 400 })
  }

  const [year, mon] = month.split('-').map(Number)
  const firstDay = new Date(year, mon - 1, 1)
  const days = getDaysInMonth(firstDay)
  const from = `${month}-01`
  const to = `${month}-${String(days).padStart(2, '0')}`

  const records = await listRecordsForHousehold(household, { from, to })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(MedPdfDocument, { records, yearMonth: month, daysInMonth: days }) as any
  const buffer = await renderToBuffer(element)

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="drug-and-oath-${month}.pdf"`,
    },
  })
}
