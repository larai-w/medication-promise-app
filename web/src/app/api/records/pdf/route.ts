import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import MedPdfDocument from '@/lib/MedPdfDocument'
import { makePdfHandler } from '@/lib/api-handlers'

export const GET = makePdfHandler({
  async renderPdf(records, yearMonth, daysInMonth, conditions) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(MedPdfDocument, { records, yearMonth, daysInMonth, conditions }) as any
    return new Uint8Array(await renderToBuffer(element))
  },
})
