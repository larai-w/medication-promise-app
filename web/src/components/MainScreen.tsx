'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { format, subDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { TIMINGS, TIMING_DEFAULTS, type Timing } from '@/lib/constants'
import type { MedicationRecord } from '@/types'
import MedicationButton from './MedicationButton'
import AddEditModal from './AddEditModal'
import RecentList from './RecentList'

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

export default function MainScreen() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const todayLabel = format(new Date(), 'yyyy年M月d日 (eee)', { locale: ja })

  const [todayRecords, setTodayRecords] = useState<MedicationRecord[]>([])
  const [recentRecords, setRecentRecords] = useState<MedicationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [modalState, setModalState] = useState<ModalState | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchToday = useCallback(async () => {
    const res = await fetch(`/api/records?date=${today}`)
    setTodayRecords(await res.json())
  }, [today])

  const fetchRecent = useCallback(async () => {
    const from = format(subDays(new Date(), 6), 'yyyy-MM-dd')
    const to = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    const res = await fetch(`/api/records?from=${from}&to=${to}`)
    setRecentRecords(await res.json())
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchToday(), fetchRecent()])
    setLoading(false)
  }, [fetchToday, fetchRecent])

  useEffect(() => {
    void Promise.resolve().then(fetchAll)
  }, [fetchAll])

  const recordsByTiming = TIMINGS.reduce<Record<Timing, MedicationRecord | undefined>>(
    (acc, t) => { acc[t] = todayRecords.find(r => r.timing === t); return acc },
    {} as Record<Timing, MedicationRecord | undefined>
  )

  const handleQuickRecord = async (timing: Timing) => {
    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, time: TIMING_DEFAULTS[timing], timing, source: 'manual' }),
      })
      if (!res.ok) throw new Error()
      void fetchToday()
    } catch {
      setError('記録の保存に失敗しました。もう一度お試しください。')
    }
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
      void fetchToday()
    } catch {
      setError('削除に失敗しました。もう一度お試しください。')
    }
  }

  const handleSave = async (data: SaveData, editId?: string) => {
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
      setModalState(null)
      void fetchAll()
    } catch {
      setError('保存に失敗しました。もう一度お試しください。')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-700 text-white px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-md">
        <h1 className="text-xl font-bold tracking-wide">Drug and Oath</h1>
        <Link href="/monthly" className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors">
          月間表示
        </Link>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-8 pb-16">
        <section>
          <p className="text-gray-500 text-sm font-medium mb-4">{todayLabel}</p>
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
            className="mt-4 w-full py-3.5 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors text-sm font-medium"
          >
            + 手動で記録を追加
          </button>
        </section>

        <section>
          <h2 className="text-gray-700 font-semibold mb-3">過去の記録</h2>
          {loading ? (
            <p className="text-gray-400 text-sm">読み込み中...</p>
          ) : (
            <RecentList records={recentRecords} />
          )}
        </section>
      </main>

      {modalState && (
        <AddEditModal
          mode={modalState.mode}
          record={modalState.record}
          defaultTiming={modalState.defaultTiming}
          today={today}
          onSave={handleSave}
          onClose={() => setModalState(null)}
        />
      )}

      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <p className="text-gray-800 font-medium mb-1">記録を削除しますか？</p>
            <p className="text-gray-500 text-sm mb-5">この操作は取り消せません。</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
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
        <div className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg flex items-center justify-between z-50">
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-3 text-white/70 hover:text-white text-xl leading-none">×</button>
        </div>
      )}
    </div>
  )
}
