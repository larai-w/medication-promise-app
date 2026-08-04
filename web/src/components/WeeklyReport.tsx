'use client'

import { useState, useEffect } from 'react'

interface WeeklyReportData {
  report: string
  source?: 'ai' | 'rule_based'
  generatedAt: string
  period: { from: string; to: string }
}

export default function WeeklyReport() {
  const [data, setData] = useState<WeeklyReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/insights/weekly')
        if (res.status === 401) {
          window.location.assign('/login')
          return
        }
        if (!res.ok) throw new Error('レポートを読み込めませんでした')
        setData(await res.json() as WeeklyReportData)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'レポートを読み込めませんでした')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading) return null
  if (error) return null
  if (!data) return null

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl p-4" role="status" aria-label="週間レポート">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg" aria-hidden="true">📊</span>
        <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">今週のレポート</span>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        {data.report}
      </p>
      {data.source === 'ai' && (
        <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
          このレポートはAIが記録データから自動生成したものです。内容に誤りがある場合があります。体調や服薬について気になることがあれば、医師・薬剤師にご相談ください。
        </p>
      )}
    </div>
  )
}
