import React from 'react'
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer'
import path from 'path'
import { TIMINGS, type Timing } from '@/lib/constants'
import type { MedicationRecord } from '@/types'

Font.register({
  family: 'NotoSansJP',
  src: path.join(process.cwd(), 'public', 'fonts', 'NotoSansJP-Regular.ttf'),
})

const s = StyleSheet.create({
  page: { fontFamily: 'NotoSansJP', fontSize: 9, padding: 32 },
  title: { fontSize: 14, fontFamily: 'NotoSansJP', marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#555', marginBottom: 16 },
  table: { width: '100%', borderStyle: 'solid', borderWidth: 1, borderColor: '#ccc' },
  row: { flexDirection: 'row' },
  headerRow: { flexDirection: 'row', backgroundColor: '#3730a3' },
  altRow: { flexDirection: 'row', backgroundColor: '#f8f8ff' },
  dateCell: { width: '12%', padding: 5, borderRightWidth: 1, borderRightColor: '#ccc', borderBottomWidth: 1, borderBottomColor: '#ccc' },
  timingCell: { flex: 1, padding: 5, borderRightWidth: 1, borderRightColor: '#ccc', borderBottomWidth: 1, borderBottomColor: '#ccc', alignItems: 'center' },
  notesCell: { width: '22%', padding: 5, borderBottomWidth: 1, borderBottomColor: '#ccc' },
  headerText: { color: 'white', fontFamily: 'NotoSansJP', fontSize: 8 },
  cellText: { fontFamily: 'NotoSansJP', fontSize: 9 },
  checkText: { fontFamily: 'NotoSansJP', fontSize: 10, color: '#16a34a' },
  timeText: { fontFamily: 'NotoSansJP', fontSize: 7, color: '#9ca3af' },
  footer: { marginTop: 16, fontSize: 8, color: '#999' },
})

interface Props {
  records: MedicationRecord[]
  yearMonth: string // 'YYYY-MM'
  daysInMonth: number
}

export default function MedPdfDocument({ records, yearMonth, daysInMonth }: Props) {
  const [year, month] = yearMonth.split('-').map(Number)

  const byDateTiming = records.reduce<Record<string, Record<Timing, MedicationRecord>>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = {} as Record<Timing, MedicationRecord>
    acc[r.date][r.timing] = r
    return acc
  }, {})

  const rows = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`
    return { day, dateStr, data: byDateTiming[dateStr] ?? {} }
  })

  return (
    <Document title={`服薬記録_${yearMonth}`} language="ja">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>服薬記録 — {year}年{month}月</Text>
        <Text style={s.subtitle}>出力日: {new Date().toLocaleDateString('ja-JP')}</Text>

        <View style={s.table}>
          {/* Header */}
          <View style={s.headerRow}>
            <View style={s.dateCell}><Text style={s.headerText}>日付</Text></View>
            {TIMINGS.map(t => (
              <View key={t} style={s.timingCell}><Text style={s.headerText}>{t}</Text></View>
            ))}
            <View style={s.notesCell}><Text style={s.headerText}>メモ</Text></View>
          </View>

          {/* Data rows */}
          {rows.map(({ day, dateStr, data }, i) => (
            <View key={dateStr} style={i % 2 === 1 ? s.altRow : s.row}>
              <View style={s.dateCell}>
                <Text style={s.cellText}>{month}/{day}</Text>
              </View>
              {TIMINGS.map(t => (
                <View key={t} style={s.timingCell}>
                  {data[t] ? (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={s.checkText}>✓</Text>
                      <Text style={s.timeText}>{data[t].time}</Text>
                    </View>
                  ) : (
                    <Text style={s.cellText}> </Text>
                  )}
                </View>
              ))}
              <View style={s.notesCell}>
                <Text style={s.cellText}>
                  {TIMINGS.map(t => data[t]?.notes).filter(Boolean).join(' / ')}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={s.footer}>Drug and Oath — 服薬管理システム</Text>
      </Page>
    </Document>
  )
}
