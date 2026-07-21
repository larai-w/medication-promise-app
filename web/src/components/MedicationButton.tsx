'use client'

import { useState } from 'react'
import { TIMING_DEFAULTS, type Timing } from '@/lib/constants'
import type { MedicationRecord } from '@/types'

interface Props {
  timing: Timing
  record?: MedicationRecord
  onQuickRecord: () => void
  onEdit: (record: MedicationRecord) => void
  onDelete: (id: string) => void
}

export default function MedicationButton({ timing, record, onQuickRecord, onEdit, onDelete }: Props) {
  const [showActions, setShowActions] = useState(false)
  const [justRecorded, setJustRecorded] = useState(false)

  const handleQuickRecord = () => {
    setJustRecorded(true)
    onQuickRecord()
    setTimeout(() => setJustRecorded(false), 600)
  }

  if (record) {
    return (
      <div
        role="group"
        aria-label={`${timing} 服薬済み`}
        className={`rounded-xl border-2 border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-900/30 overflow-hidden transition-all ${justRecorded ? 'animate-fade-slide-up' : ''}`}
      >
        <button
          onClick={() => setShowActions(v => !v)}
          className="w-full px-4 py-4 flex items-center justify-between text-left"
          aria-expanded={showActions}
          aria-label={`${timing} 服薬済み ${record.time} 詳細を表示`}
        >
          <div className="flex items-center gap-3">
            <span className={`text-green-600 dark:text-green-400 text-lg font-bold ${justRecorded ? 'animate-check-pop' : ''}`} aria-hidden="true">
              ✓
            </span>
            <span className="font-semibold text-green-800 dark:text-green-300 text-lg">{timing}</span>
          </div>
          <span className="text-green-700 dark:text-green-400 text-sm">{record.time} 服薬済み</span>
        </button>
        {showActions && (
          <div className="border-t border-green-200 dark:border-green-700 flex" role="toolbar" aria-label={`${timing} の操作`}>
            <button
              onClick={() => { onEdit(record); setShowActions(false) }}
              className="flex-1 py-3 text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
              aria-label={`${timing} の記録を編集`}
            >
              編集
            </button>
            <div className="w-px bg-green-200 dark:bg-green-700" />
            <button
              onClick={() => { onDelete(record.id); setShowActions(false) }}
              className="flex-1 py-3 text-sm text-red-500 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              aria-label={`${timing} の記録を削除`}
            >
              削除
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={handleQuickRecord}
      className="w-full px-4 py-4 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 flex items-center justify-between hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 active:bg-indigo-100 dark:active:bg-indigo-900/50 transition-colors"
      aria-label={`${timing} ${TIMING_DEFAULTS[timing]} 服薬予定、タップで記録`}
    >
      <span className="font-semibold text-gray-700 dark:text-gray-200 text-lg">{timing}</span>
      <span className="text-gray-400 dark:text-gray-500 text-sm">{TIMING_DEFAULTS[timing]} 💊</span>
    </button>
  )
}
