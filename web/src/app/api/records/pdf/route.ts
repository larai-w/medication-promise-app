import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { getDaysInMonth } from 'date-fns'
import { docClient, TABLE_NAME, USER_ID, makePK } from '@/lib/dynamodb'
import MedPdfDocument from '@/lib/MedPdfDocument'
import type { DynamoRecord, MedicationRecord } from '@/types'
import { encodeSK } from '@/lib/dynamodb'

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

// GET /api/records/pdf?month=YYYY-MM
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') // e.g. "2026-06"

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: 'month パラメータが必要です (例: 2026-06)' }, { status: 400 })
  }

  const [year, mon] = month.split('-').map(Number)
  const firstDay = new Date(year, mon - 1, 1)
  const days = getDaysInMonth(firstDay)
  const from = `${month}-01`
  const to = `${month}-${String(days).padStart(2, '0')}`

  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :from AND :to',
    ExpressionAttributeValues: {
      ':pk': makePK(USER_ID),
      ':from': `RECORD#${from}`,
      ':to': `RECORD#${to}~`,
    },
    ScanIndexForward: true,
  }))

  const records = (result.Items as DynamoRecord[] ?? []).map(toApiRecord)

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
