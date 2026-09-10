'use client'

import { useRef, useState } from 'react'
import { TIMINGS, type Timing } from '@/lib/constants'
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
  timingDefaults: Record<Timing, string> | null
  today: string
  onSave: (data: SaveData, editId?: string) => Promise<void>
  onClose: () => void
}

export default function AddEditModal({ mode, record, defaultTiming, timingDefaults, today, onSave, onClose }: Props) {
  // Keep the opening schedule stable while a refresh arrives or the user types.
  const [openingSchedule] = useState(timingDefaults)
  const initialTiming = record?.timing ?? defaultTiming ?? '朝'
  const [date, setDate] = useState(record?.date ?? today)
  const [timing, setTiming] = useState<Timing>(initialTiming)
  const [time, setTime] = useState(record?.time ?? openingSchedule?.[initialTiming] ?? '')
  const [notes, setNotes] = useState(record?.notes ?? '')
  const savingRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSave = async () => {
    if (savingRef.current) return
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setSaveError('記録する時刻をHH:MM形式で入力してください。')
      return
    }
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      await onSave({ date, time, timing, notes: notes || undefined }, record?.id)
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : '保存に失敗しました。入力を残しています。もう一度お試しください。')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const handleTimingChange = (nextTiming: Timing) => {
    setTiming(nextTiming)
    if (mode === 'add') {
      setTime(openingSchedule?.[nextTiming] ?? '')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-busy={saving} aria-label={mode === 'add' ? '服薬記録を追加' : '服薬記録を編集'}>
      <div className="bg-white dark:bg-gray-800 w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-6 space-y-5 shadow-xl">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
          {mode === 'add' ? '服薬記録を追加' : '服薬記録を編集'}
        </h2>

        <div>
          <label htmlFor="record-date" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">日付</label>
          <input
            id="record-date"
            type="date"
            disabled={saving || mode === 'edit'}
            aria-describedby={mode === 'edit' ? 'record-date-help' : undefined}
            value={date}
            onChange={e => setDate(e.target.value)}
            className="min-h-11 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {mode === 'edit' && <p id="record-date-help" className="text-xs text-gray-600 dark:text-gray-400">日付は変更できません。別の日の記録は「手動で記録を追加」から追加できます。</p>}

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">服薬区分</label>
          <div className="grid grid-cols-3 gap-2">
            {TIMINGS.map(t => (
              <button
                key={t}
                disabled={saving}
                onClick={() => handleTimingChange(t)}
                aria-pressed={timing === t}
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
          <label htmlFor="record-time" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">時刻</label>
          <input
            id="record-time"
            disabled={saving}
            type="time"
            required
            aria-describedby="record-time-help"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="min-h-11 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p id="record-time-help" className="text-xs text-gray-600 dark:text-gray-500 mt-1">{mode === 'add'
            ? openingSchedule
              ? '区分を選ぶと、画面を開いたときの現在の設定時刻が入ります。過去の予定ではありません。実際の時刻を確認して保存してください。'
              : '予定を確認できません。記録する時刻を入力してください。'
            : '区分を変えても時刻は変わりません。必要に応じて変更してください'}</p>
        </div>

        <div>
          <label htmlFor="record-note" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">この服薬記録のメモ（任意）</label>
          <textarea
            id="record-note"
            disabled={saving}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="気になることがあれば..."
            rows={2}
            maxLength={200}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-600 dark:text-gray-500 mt-1 text-right">{notes.length}/200</p>
        </div>

        {saveError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}

        <div className="flex gap-3 pt-1">
          <button
            disabled={saving}
            onClick={() => { if (!savingRef.current) onClose() }}
            className="disabled:opacity-60 flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            キャンセル
          </button>
          <button
            disabled={saving}
            onClick={() => void handleSave()}
            className="disabled:opacity-60 flex-1 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
