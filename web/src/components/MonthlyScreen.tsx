'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { format, addMonths, subMonths, getDaysInMonth, startOfMonth } from 'date-fns'
import { ja } from 'date-fns/locale'
import { TIMINGS, type Timing } from '@/lib/constants'
import type { MedicationRecord } from '@/types'

export default function MonthlyScreen() {
  const [currentDate, setCurrentDate] = useState(() => startOfMonth(new Date()))
  const [records, setRecords] = useState<MedicationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  const yearMonth = format(currentDate, 'yyyy-MM')
  const monthLabel = format(currentDate, 'yyyy年M月', { locale: ja })
  const daysInMonth = getDaysInMonth(currentDate)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const days = getDaysInMonth(currentDate)
    const from = `${yearMonth}-01`
    const to = `${yearMonth}-${String(days).padStart(2, '0')}`
    const res = await fetch(`/api/records?from=${from}&to=${to}`)
    setRecords(await res.json())
    setLoading(false)
  }, [currentDate, yearMonth])

  useEffect(() => {
    void Promise.resolve().then(fetchRecords)
  }, [fetchRecords])

  // Build lookup: date → timing → record
  const grid = records.reduce<Record<string, Record<Timing, MedicationRecord>>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = {} as Record<Timing, MedicationRecord>
    acc[r.date][r.timing] = r
    return acc
  }, {})

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
    return { day, dateStr, weekday: format(date, 'eee', { locale: ja }) }
  })

  const handleDownloadPdf = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/records/pdf?month=${yearMonth}`)
      if (!res.ok) throw new Error('PDF生成に失敗しました')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `drug-and-oath-${yearMonth}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-700 text-white px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-md">
        <h1 className="text-xl font-bold tracking-wide">Drug and Oath</h1>
        <Link href="/" className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors">
          メイン画面
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setCurrentDate(d => subMonths(d, 1))}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium transition-colors"
          >
            ← 前月
          </button>
          <h2 className="text-lg font-bold text-gray-800">{monthLabel}</h2>
          <button
            onClick={() => setCurrentDate(d => addMonths(d, 1))}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium transition-colors"
          >
            次月 →
          </button>
        </div>

        {/* PDF download button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={handleDownloadPdf}
            disabled={downloading || loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {downloading ? '生成中...' : 'PDFダウンロード'}
          </button>
        </div>

        {/* Monthly table */}
        {loading ? (
          <p className="text-gray-400 text-sm py-8 text-center">読み込み中...</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-indigo-700 text-white">
                    <th className="px-3 py-3 text-left font-medium w-20">日付</th>
                    {TIMINGS.map(t => (
                      <th key={t} className="px-2 py-3 text-center font-medium">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {days.map(({ day, dateStr, weekday }, i) => {
                    const dayData = grid[dateStr] ?? {}
                    const isSunday = weekday === '日'
                    const isSaturday = weekday === '土'
                    return (
                      <tr
                        key={dateStr}
                        className={
                          i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={
                            isSunday ? 'text-red-500 font-medium' :
                            isSaturday ? 'text-blue-500 font-medium' :
                            'text-gray-700'
                          }>
                            {day}日 ({weekday})
                          </span>
                        </td>
                        {TIMINGS.map(t => (
                          <td key={t} className="px-2 py-2.5 text-center">
                            {dayData[t] ? (
                              <span className="inline-flex flex-col items-center leading-tight">
                                <span className="text-green-600 font-bold text-base">✓</span>
                                <span className="text-gray-400 text-xs">{dayData[t].time}</span>
                              </span>
                            ) : (
                              <span className="text-gray-200">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Summary */}
        {!loading && (
          <div className="mt-4 flex gap-4 text-sm text-gray-500">
            <span>
              服薬回数: <strong className="text-gray-800">{records.length}回</strong>
            </span>
            <span>
              服薬日数: <strong className="text-gray-800">
                {new Set(records.map(r => r.date)).size}日
              </strong>
            </span>
          </div>
        )}
      </main>
    </div>
  )
}
