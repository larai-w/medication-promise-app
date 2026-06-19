'use client'

import { useState, useEffect, useCallback } from 'react'
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

  useEffect(() => { fetchAll() }, [fetchAll])

  const recordsByTiming = TIMINGS.reduce<Record<Timing, MedicationRecord | undefined>>(
    (acc, t) => { acc[t] = todayRecords.find(r => r.timing === t); return acc },
    {} as Record<Timing, MedicationRecord | undefined>
  )

  const handleQuickRecord = async (timing: Timing) => {
    await fetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, time: TIMING_DEFAULTS[timing], timing, source: 'manual' }),
    })
    fetchToday()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この記録を削除しますか？')) return
    await fetch(`/api/records/${id}`, { method: 'DELETE' })
    fetchToday()
  }

  const handleSave = async (data: SaveData, editId?: string) => {
    if (editId) {
      await fetch(`/api/records/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time: data.time, timing: data.timing, notes: data.notes }),
      })
    } else {
      await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, source: 'manual' }),
      })
    }
    setModalState(null)
    fetchAll()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-700 text-white px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-md">
        <h1 className="text-xl font-bold tracking-wide">Drug and Oath</h1>
        <a
          href="/monthly"
          className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors"
        >
          月間表示
        </a>
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
    </div>
  )
}
