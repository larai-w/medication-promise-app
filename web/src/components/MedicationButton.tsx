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

  if (record) {
    return (
      <div className="rounded-xl border-2 border-green-400 bg-green-50 overflow-hidden">
        <button
          onClick={() => setShowActions(v => !v)}
          className="w-full px-4 py-4 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <span className="text-green-600 text-lg font-bold">✓</span>
            <span className="font-semibold text-green-800 text-lg">{timing}</span>
          </div>
          <span className="text-green-700 text-sm">{record.time} 服薬済み</span>
        </button>
        {showActions && (
          <div className="border-t border-green-200 flex">
            <button
              onClick={() => { onEdit(record); setShowActions(false) }}
              className="flex-1 py-3 text-sm text-indigo-600 font-medium hover:bg-indigo-50 transition-colors"
            >
              編集
            </button>
            <div className="w-px bg-green-200" />
            <button
              onClick={() => { onDelete(record.id); setShowActions(false) }}
              className="flex-1 py-3 text-sm text-red-500 font-medium hover:bg-red-50 transition-colors"
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
      onClick={onQuickRecord}
      className="w-full px-4 py-4 rounded-xl border-2 border-gray-200 bg-white flex items-center justify-between hover:border-indigo-400 hover:bg-indigo-50 active:bg-indigo-100 transition-colors"
    >
      <span className="font-semibold text-gray-700 text-lg">{timing}</span>
      <span className="text-gray-400 text-sm">{TIMING_DEFAULTS[timing]} 服薬予定 →</span>
    </button>
  )
}
