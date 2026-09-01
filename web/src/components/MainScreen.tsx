'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { format, parseISO, subDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { TIMINGS, type Timing } from '@/lib/constants'
import {
  DEFAULT_MEDICATION_SETTINGS,
  settingsToTimingDefaults,
  type MedicationSettings,
} from '@/lib/settings'
import type { DailyCondition, MedicationRecord } from '@/types'
import MedicationButton from './MedicationButton'
import AddEditModal from './AddEditModal'
import RecentList from './RecentList'
import WeeklyReport from './WeeklyReport'
import type { Badge } from '@/lib/badges'
import { medpromiseTracker } from '@/lib/metrics/record-time-tracker'

interface ModalState {
  mode: 'add' | 'edit'
  record?: MedicationRecord
  defaultTiming?: Timing
}

interface SaveData {
  date: string
  time: string
  timing: Timing
  notes?: string
}

interface InsightsMessage {
  emoji: string
  text: string
  type: 'celebrate' | 'encourage' | 'warning' | 'nudge'
}

interface InsightsData {
  streak: number
  todayCompleted: number
  totalTimings: number
  timingStats: { timing: Timing; total: number; completed: number; rate: number }[]
  monthlyRate: { completed: number; total: number; rate: number }
  message: InsightsMessage
  threat: string | null
  badges?: Badge[]
}

export default function MainScreen() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [selectedDate, setSelectedDate] = useState(today)
  const selectedDateLabel = format(parseISO(selectedDate), 'yyyy年M月d日 (eee)', { locale: ja })
  const viewingToday = selectedDate === today

  const [todayRecords, setTodayRecords] = useState<MedicationRecord[]>([])
  const [recentRecords, setRecentRecords] = useState<MedicationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [modalState, setModalState] = useState<ModalState | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<MedicationSettings>(DEFAULT_MEDICATION_SETTINGS)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    if (typeof window === 'undefined') return 'system'
    return (localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null) ?? 'system'
  })
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [condition, setCondition] = useState<DailyCondition | null>(null)
  const [conditionSaving, setConditionSaving] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(next)
    localStorage.setItem('theme', next)
    const root = document.documentElement
    if (next === 'dark') {
      root.classList.add('dark')
      root.classList.remove('light')
    } else if (next === 'light') {
      root.classList.remove('dark')
      root.classList.add('light')
    } else {
      root.classList.remove('light')
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
  }

  const readRecords = useCallback(async (response: Response) => {
    if (response.status === 401) {
      window.location.assign('/login')
      throw new Error('ログインの有効期限が切れました')
    }
    if (!response.ok) throw new Error('記録を読み込めませんでした')
    const body: unknown = await response.json()
    if (!Array.isArray(body)) throw new Error('記録の形式が正しくありません')
    return body as MedicationRecord[]
  }, [])

  const fetchToday = useCallback(async () => {
    const res = await fetch(`/api/records?date=${selectedDate}`)
    setTodayRecords(await readRecords(res))
  }, [readRecords, selectedDate])

  const fetchRecent = useCallback(async () => {
    const from = format(subDays(new Date(), 6), 'yyyy-MM-dd')
    const to = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    const res = await fetch(`/api/records?from=${from}&to=${to}`)
    setRecentRecords(await readRecords(res))
  }, [readRecords])

  const fetchInsights = useCallback(async () => {
    const res = await fetch('/api/insights')
    if (res.status === 401) {
      window.location.assign('/login')
      throw new Error('ログインの有効期限が切れました')
    }
    if (!res.ok) throw new Error('インサイトを読み込めませんでした')
    setInsights(await res.json() as InsightsData)
  }, [])

  const fetchSettings = useCallback(async () => {
    const res = await fetch('/api/settings')
    if (res.status === 401) {
      window.location.assign('/login')
      throw new Error('ログインの有効期限が切れました')
    }
    if (!res.ok) throw new Error('設定を読み込めませんでした')
    setSettings(await res.json() as MedicationSettings)
  }, [])

  const fetchCondition = useCallback(async () => {
    const res = await fetch(`/api/condition?date=${selectedDate}`)
    if (res.status === 401) { window.location.assign('/login'); throw new Error('ログインの有効期限が切れました') }
    if (!res.ok) throw new Error('今日の体調を読み込めませんでした')
    const loaded = await res.json() as DailyCondition | null
    setCondition(loaded)
    setNoteDraft(loaded?.note ?? '')
  }, [selectedDate])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([fetchToday(), fetchRecent(), fetchInsights(), fetchSettings(), fetchCondition()])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '記録を読み込めませんでした')
    } finally {
      setLoading(false)
    }
  }, [fetchToday, fetchRecent, fetchInsights, fetchSettings, fetchCondition])

  useEffect(() => {
    void Promise.resolve().then(fetchAll)
  }, [fetchAll])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void fetchAll()
    }
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [fetchAll])

  const recordsByTiming = TIMINGS.reduce<Record<Timing, MedicationRecord | undefined>>(
    (acc, t) => { acc[t] = todayRecords.find(r => r.timing === t); return acc },
    {} as Record<Timing, MedicationRecord | undefined>
  )
  const timingDefaults = settingsToTimingDefaults(settings)

  const completedCount = todayRecords.length
  const totalCount = TIMINGS.length
  const progressPercent = Math.round((completedCount / totalCount) * 100)
  const streak = insights?.streak ?? 0

  // メッセージの色を type に応じて変える
  const messageBg = (type: InsightsMessage['type']) => {
    switch (type) {
      case 'celebrate': return 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300'
      case 'warning': return 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-600 dark:text-red-300'
      case 'nudge': return 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-300'
      default: return 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300'
    }
  }

  const handleQuickRecord = async (timing: Timing) => {
    medpromiseTracker.start()
    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, time: timingDefaults[timing], timing, source: 'manual' }),
      })
      if (res.status === 401) window.location.assign('/login')
      if (!res.ok) throw new Error()
      void medpromiseTracker.stop()
      await Promise.all([fetchToday(), fetchInsights()])
    } catch {
      medpromiseTracker.cancel()
      setError('記録の保存に失敗しました。もう一度お試しください。')
    }
  }

  const saveCondition = async (score: DailyCondition['score']) => {
    setConditionSaving(true)
    try {
      // ⚠️ PUT は item ごと置き換える。note を送らないと**既存のメモが消える**。
      const res = await fetch('/api/condition', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: selectedDate, score, note: condition?.note }) })
      if (res.status === 401) window.location.assign('/login')
      if (!res.ok) throw new Error()
      const saved = await res.json() as DailyCondition
      setCondition(saved)
      setNoteDraft(saved.note ?? '')
    } catch { setError('体調の保存に失敗しました。もう一度お試しください。') }
    finally { setConditionSaving(false) }
  }

  // その日のメモ。服薬の記録とは別に、一日について残しておける場所。
  // score は API 側で必須なので、体調が未記録のときは保存させない
  // （勝手に 3 を入れたりしない。記録していない体調を作らない）。
  const saveConditionNote = async () => {
    if (!condition) return
    setNoteSaving(true)
    try {
      const res = await fetch('/api/condition', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: selectedDate, score: condition.score, note: noteDraft.trim() || undefined }) })
      if (res.status === 401) window.location.assign('/login')
      if (!res.ok) throw new Error()
      const saved = await res.json() as DailyCondition
      setCondition(saved)
      setNoteDraft(saved.note ?? '')
    } catch { setError('メモの保存に失敗しました。もう一度お試しください。') }
    finally { setNoteSaving(false) }
  }

  const handleDelete = (id: string) => {
    setDeleteTargetId(id)
  }

  const confirmDelete = async () => {
    if (!deleteTargetId) return
    setDeleteTargetId(null)
    try {
      const res = await fetch(`/api/records/${deleteTargetId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await Promise.all([fetchToday(), fetchInsights()])
    } catch {
      setError('削除に失敗しました。もう一度お試しください。')
    }
  }

  const handleSave = async (data: SaveData, editId?: string) => {
    medpromiseTracker.start()
    try {
      let res: Response
      if (editId) {
        res = await fetch(`/api/records/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ time: data.time, timing: data.timing, notes: data.notes }),
        })
      } else {
        res = await fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, source: 'manual' }),
        })
      }
      if (!res.ok) throw new Error()
      void medpromiseTracker.stop()
      setModalState(null)
      await fetchAll()
    } catch {
      medpromiseTracker.cancel()
      setError('保存に失敗しました。もう一度お試しください。')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors">
      <header className="bg-indigo-700 dark:bg-indigo-900 text-white px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-md">
        <h1 className="text-xl font-bold tracking-wide">おくすりの約束</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors"
            aria-label={`テーマ切替 (現在: ${theme === 'light' ? 'ライト' : theme === 'dark' ? 'ダーク' : 'システム'})`}
          >
            {theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🌓'}
          </button>
          <Link href="/monthly" className="inline-flex min-h-11 items-center rounded-full bg-white/20 px-3 text-sm transition-colors hover:bg-white/30" aria-label="月間表示">
            月間表示
          </Link>
          <Link href="/settings" className="inline-flex min-h-11 items-center rounded-full bg-white/20 px-3 text-sm transition-colors hover:bg-white/30" aria-label="設定">
            設定
          </Link>
          <button
            type="button"
            onClick={() => void fetchAll()}
            disabled={loading}
            className="inline-flex min-h-11 items-center rounded-full bg-white/20 px-3 text-sm transition-colors hover:bg-white/30 disabled:opacity-60"
            aria-label="記録を更新"
          >
            {loading ? '読込中' : '更新'}
          </button>
          <form action="/api/access/logout" method="post">
            <button type="submit" className="min-h-11 px-3 text-xs text-white/80 hover:text-white" aria-label="ログアウト">終了</button>
          </form>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6 pb-16">
        <section className="flex items-center justify-between rounded-2xl bg-white dark:bg-gray-800 px-3 py-2 shadow-sm" aria-label="記録日を移動">
          <button
            type="button"
            onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))}
            className="min-h-11 rounded-xl px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950"
            aria-label="前日を表示"
          >
            ← 前日
          </button>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{selectedDateLabel}</span>
          <button
            type="button"
            onClick={() => setSelectedDate(today)}
            disabled={viewingToday}
            className="min-h-11 rounded-xl px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-default disabled:text-gray-300 dark:text-indigo-300 dark:hover:bg-indigo-950 dark:disabled:text-gray-600"
            aria-label="今日を表示"
          >
            今日
          </button>
        </section>

        <section className="rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm" aria-labelledby="condition-heading">
          <div className="flex items-center justify-between mb-2">
            <div><h2 id="condition-heading" className="font-semibold text-gray-800 dark:text-gray-100">{viewingToday ? '今日' : selectedDateLabel}の体調</h2><p className="text-xs text-gray-500 dark:text-gray-400">夜に一度、1〜5で振り返ります</p></div>
            {condition && <span className="text-sm text-gray-500 dark:text-gray-400">記録済み: {condition.score}</span>}
          </div>
          <div className="grid grid-cols-5 gap-2" role="group" aria-label="今日の体調を1から5で選択">
            {([1, 2, 3, 4, 5] as const).map(score => {
              const selected = condition?.score === score
              return <button key={score} type="button" disabled={conditionSaving} onClick={() => void saveCondition(score)} aria-pressed={selected} aria-label={`体調 ${score}: ${['とてもつらい', 'つらい', 'ふつう', '良い', 'とても良い'][score - 1]}`} className={`min-h-11 rounded-xl border-2 text-lg font-semibold transition-colors ${selected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-indigo-300'}`}>{score}</button>
            })}
          </div>
          <div className="flex justify-between text-[11px] text-gray-600 dark:text-gray-500 mt-1"><span>つらい</span><span>良い</span></div>

          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <label htmlFor="condition-note" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">その日のメモ（任意）</label>
            <textarea
              id="condition-note"
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              placeholder="服薬のこと以外でも、気になったことを"
              rows={2}
              maxLength={200}
              disabled={!condition || noteSaving}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-gray-600 dark:text-gray-500">
                {condition ? `${noteDraft.length}/200` : '先に上の1〜5を選ぶと書けます'}
              </p>
              {condition && noteDraft.trim() !== (condition.note ?? '') && (
                <button
                  type="button"
                  onClick={() => void saveConditionNote()}
                  disabled={noteSaving}
                  className="min-h-11 px-4 rounded-xl bg-indigo-500 text-white text-sm font-medium disabled:opacity-60"
                >
                  {noteSaving ? '保存しています...' : 'メモを保存'}
                </button>
              )}
            </div>
          </div>
        </section>
        {/* 記録を支えるメッセージ */}
        {insights?.message && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${messageBg(insights.message.type)}`} role="status">
            <span className="text-2xl" aria-hidden="true">{insights.message.emoji}</span>
            <p className="text-sm font-medium">{insights.message.text}</p>
          </div>
        )}

        {/* 記録がない日に表示する穏やかな案内 */}
        {insights?.threat && completedCount === 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300 animate-fade-slide-up" role="alert">
            <p className="text-sm font-medium">{insights.threat}</p>
          </div>
        )}

        {/* Streak + Progress section */}
        <section className="flex items-center gap-4">
          {streak > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-2.5" role="status" aria-label={`${streak}日連続服薬中`}>
              <span className="text-xl" aria-hidden="true">🔥</span>
              <div>
                <span className="font-bold text-amber-700 dark:text-amber-400 text-lg">{streak}</span>
                <span className="text-amber-600 dark:text-amber-500 text-xs ml-1">日連続</span>
              </div>
            </div>
          )}
          <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">今日の進捗</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{completedCount}/{totalCount}</span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden" role="progressbar" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={totalCount} aria-label="今日の服薬進捗">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  progressPercent === 100 ? 'bg-green-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </section>

        {/* 週間レポート */}
        {!loading && <WeeklyReport />}

        {/* 月間の記録状況 */}
        {insights && !loading && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
            <span className="text-sm text-gray-500 dark:text-gray-400">今月</span>
            <div className="flex-1">
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden" role="progressbar" aria-valuenow={insights.monthlyRate.rate} aria-valuemin={0} aria-valuemax={100} aria-label="今月の記録状況">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    insights.monthlyRate.rate >= 80 ? 'bg-green-500' : insights.monthlyRate.rate >= 50 ? 'bg-yellow-500' : 'bg-red-400'
                  }`}
                  style={{ width: `${insights.monthlyRate.rate}%` }}
                />
              </div>
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-14 text-right">{insights.monthlyRate.rate}%</span>
          </div>
        )}

        {/* バッジ一覧 */}
        {insights?.badges && insights.badges.some(b => b.earned) && (
          <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">バッジ</h3>
            <div className="flex flex-wrap gap-2">
              {insights.badges.filter(b => b.earned).map(badge => (
                <div
                  key={badge.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-full"
                  title={badge.description}
                  aria-label={`${badge.label}: ${badge.description}`}
                >
                  <span aria-hidden="true">{badge.emoji}</span>
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{badge.label}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-4">{selectedDateLabel}</p>
          <div className="space-y-3">
            {TIMINGS.map(timing => (
              <MedicationButton
                key={timing}
                timing={timing}
                record={recordsByTiming[timing]}
                onQuickRecord={() => handleQuickRecord(timing)}
                onEdit={record => setModalState({ mode: 'edit', record })}
                onDelete={handleDelete}
              />
            ))}
          </div>
          <button
            onClick={() => setModalState({ mode: 'add' })}
            className="mt-4 w-full py-3.5 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-600 dark:text-gray-500 hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors text-sm font-medium"
            aria-label="手動で記録を追加"
          >
            + 手動で記録を追加
          </button>
        </section>

        <section>
          <h2 className="text-gray-700 dark:text-gray-300 font-semibold mb-3">過去の記録</h2>
          {loading ? (
            <div className="flex items-center justify-center py-8" role="status">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" aria-label="読み込み中" />
              <span className="ml-3 text-gray-600 dark:text-gray-500 text-sm">読み込み中...</span>
            </div>
          ) : (
            <RecentList records={recentRecords} />
          )}
        </section>
        <footer className="pt-4 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
          <Link href="/privacy" className="underline hover:text-gray-700 dark:hover:text-gray-300">プライバシー</Link>
          <Link href="/terms" className="underline hover:text-gray-700 dark:hover:text-gray-300">利用条件</Link>
        </footer>
      </main>

      {modalState && (
        <AddEditModal
          mode={modalState.mode}
          record={modalState.record}
          defaultTiming={modalState.defaultTiming}
          today={selectedDate}
          onSave={handleSave}
          onClose={() => setModalState(null)}
        />
      )}

      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="削除確認">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <p className="text-gray-800 dark:text-gray-200 font-medium mb-1">記録を削除しますか？</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">この操作は取り消せません。</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg flex items-center justify-between z-50" role="alert">
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-3 text-white/70 hover:text-white text-xl leading-none" aria-label="閉じる">×</button>
        </div>
      )}
    </div>
  )
}
