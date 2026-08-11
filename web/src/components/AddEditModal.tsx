'use client'

import { useState } from 'react'
import { TIMINGS, TIMING_DEFAULTS, type Timing } from '@/lib/constants'
import type { MedicationRecord } from '@/types'

interface SaveData {
  date: string
  time: string
  timing: Timing
  notes?: string
}

interface Props {
  mode: 'add' | 'edit'
  record?: MedicationRecord
  defaultTiming?: Timing
  today: string
  onSave: (data: SaveData, editId?: string) => void
  onClose: () => void
}

export default function AddEditModal({ mode, record, defaultTiming, today, onSave, onClose }: Props) {
  const initialTiming = record?.timing ?? defaultTiming ?? '朝'
  const [date, setDate] = useState(record?.date ?? today)
  const [timing, setTiming] = useState<Timing>(initialTiming)
  const [time, setTime] = useState(record?.time ?? TIMING_DEFAULTS[initialTiming])
  const [notes, setNotes] = useState(record?.notes ?? '')

  const handleTimingChange = (nextTiming: Timing) => {
    setTiming(nextTiming)
    if (mode === 'add') {
      setTime(TIMING_DEFAULTS[nextTiming])
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={mode === 'add' ? '服薬記録を追加' : '服薬記録を編集'}>
      <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-6 space-y-5 shadow-xl">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
          {mode === 'add' ? '服薬記録を追加' : '服薬記録を編集'}
        </h2>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">日付</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="min-h-11 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">服薬区分</label>
          <div className="grid grid-cols-3 gap-2">
            {TIMINGS.map(t => (
              <button
                key={t}
                onClick={() => handleTimingChange(t)}
                className={`min-h-11 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                  timing === t
                    ? 'border-indigo-500 bg-indigo-500 text-white'
                    : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-indigo-300 dark:hover:border-indigo-500'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">時刻</label>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="min-h-11 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">区分を選ぶと自動でセットされます</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">メモ（任意）</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="気になることがあれば..."
            rows={2}
            maxLength={200}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">{notes.length}/200</p>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={() => onSave({ date, time, timing, notes: notes || undefined }, record?.id)}
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
