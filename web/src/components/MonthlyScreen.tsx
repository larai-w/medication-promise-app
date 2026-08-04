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
  const [downloading, setDownloading] = useState<'pdf' | 'json' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const yearMonth = format(currentDate, 'yyyy-MM')
  const monthLabel = format(currentDate, 'yyyy年M月', { locale: ja })
  const daysInMonth = getDaysInMonth(currentDate)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    const days = getDaysInMonth(currentDate)
    const from = `${yearMonth}-01`
    const to = `${yearMonth}-${String(days).padStart(2, '0')}`
    try {
      const res = await fetch(`/api/records?from=${from}&to=${to}`)
      if (res.status === 401) {
        window.location.assign('/login')
        return
      }
      if (!res.ok) throw new Error('月間記録を読み込めませんでした')
      const body: unknown = await res.json()
      if (!Array.isArray(body)) throw new Error('月間記録の形式が正しくありません')
      setRecords(body as MedicationRecord[])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '月間記録を読み込めませんでした')
    } finally {
      setLoading(false)
    }
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
    setDownloading('pdf')
    setError(null)
    try {
      const res = await fetch(`/api/records/pdf?month=${yearMonth}`)
      if (res.status === 401) {
        window.location.assign('/login')
        return
      }
      if (!res.ok) throw new Error('PDF生成に失敗しました')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `drug-and-oath-${yearMonth}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PDF生成に失敗しました')
    } finally {
      setDownloading(null)
    }
  }

  const handleDownloadJson = async () => {
    setDownloading('json')
    setError(null)
    const from = `${yearMonth}-01`
    const to = `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`
    try {
      const res = await fetch(`/api/records/export?from=${from}&to=${to}`)
      if (res.status === 401) {
        window.location.assign('/login')
        return
      }
      if (!res.ok) throw new Error('データの書き出しに失敗しました')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `medication-promise-${from}-${to}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'データの書き出しに失敗しました')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50 dark:bg-slate-900 transition-colors">
      <header className="bg-indigo-700 dark:bg-indigo-900 text-white px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-md">
        <h1 className="min-w-0 truncate text-xl font-bold tracking-wide">おくすりの約束</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/" className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors" aria-label="メイン画面">
            メイン画面
          </Link>
          <Link href="/settings" className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors" aria-label="設定">
            設定
          </Link>
          <form action="/api/access/logout" method="post">
            <button type="submit" className="text-xs text-white/80 hover:text-white px-2 py-1.5" aria-label="ログアウト">終了</button>
          </form>
        </div>
      </header>

      <main className="w-full max-w-2xl mx-auto px-4 py-6">
        {error && (
          <div role="alert" className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setCurrentDate(d => subMonths(d, 1))}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium transition-colors"
            aria-label="前月"
          >
            ← 前月
          </button>
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">{monthLabel}</h2>
          <button
            onClick={() => setCurrentDate(d => addMonths(d, 1))}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium transition-colors"
            aria-label="次月"
          >
            次月 →
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={handleDownloadJson}
            disabled={downloading !== null || loading}
            className="w-full min-w-0 px-3 py-2.5 border border-indigo-600 text-indigo-700 dark:text-indigo-300 dark:border-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {downloading === 'json' ? '書き出し中...' : 'データ(JSON)'}
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading !== null || loading}
            className="w-full min-w-0 px-3 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {downloading === 'pdf' ? '生成中...' : 'PDFダウンロード'}
          </button>
        </div>

        {/* Monthly table */}
        {loading ? (
          <div className="flex items-center justify-center py-8" role="status">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" aria-label="読み込み中" />
            <span className="ml-3 text-gray-400 dark:text-gray-500 text-sm">読み込み中...</span>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-indigo-700 dark:bg-indigo-900 text-white">
                    <th className="px-3 py-3 text-left font-medium w-20">日付</th>
                    {TIMINGS.map(t => (
                      <th key={t} className="px-2 py-3 text-center font-medium">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {days.map(({ day, dateStr, weekday }, i) => {
                    const dayData = grid[dateStr] ?? {}
                    const isSunday = weekday === '日'
                    const isSaturday = weekday === '土'
                    return (
                      <tr
                        key={dateStr}
                        className={
                          i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/60'
                        }
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={
                            isSunday ? 'text-red-500 dark:text-red-400 font-medium' :
                            isSaturday ? 'text-blue-500 dark:text-blue-400 font-medium' :
                            'text-gray-700 dark:text-gray-300'
                          }>
                            {day}日 ({weekday})
                          </span>
                        </td>
                        {TIMINGS.map(t => (
                          <td key={t} className="px-2 py-2.5 text-center">
                            {dayData[t] ? (
                              <span className="inline-flex flex-col items-center leading-tight">
                                <span className="text-green-600 dark:text-green-400 font-bold text-base">✓</span>
                                <span className="text-gray-400 dark:text-gray-500 text-xs">{dayData[t].time}</span>
                              </span>
                            ) : (
                              <span className="text-gray-200 dark:text-gray-600">—</span>
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
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span>
              服薬回数: <strong className="text-gray-800 dark:text-gray-200">{records.length}回</strong>
            </span>
            <span>
              服薬日数: <strong className="text-gray-800 dark:text-gray-200">
                {new Set(records.map(r => r.date)).size}日
              </strong>
            </span>
            <span>
              完了率: <strong className={
                records.length / (daysInMonth * 5) >= 0.8
                  ? 'text-green-600 dark:text-green-400'
                  : records.length / (daysInMonth * 5) >= 0.5
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-red-500 dark:text-red-400'
              }>
                {Math.round(records.length / (daysInMonth * 5) * 100)}%
              </strong>
            </span>
          </div>
        )}
      </main>
    </div>
  )
}
