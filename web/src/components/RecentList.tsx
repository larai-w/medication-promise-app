import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { MedicationRecord } from '@/types'

interface Props {
  records: MedicationRecord[]
}

export default function RecentList({ records }: Props) {
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-gray-600 dark:text-gray-500" role="status">
        <span className="text-3xl mb-2" aria-hidden="true">📋</span>
        <p className="text-sm">過去6日間の記録はありません</p>
        <p className="text-xs mt-1">今日からお薬を記録してみましょう</p>
      </div>
    )
  }

  const byDate = records.reduce<Record<string, MedicationRecord[]>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = []
    acc[r.date].push(r)
    return acc
  }, {})

  const dates = Object.keys(byDate).sort().reverse()

  return (
    <div className="space-y-3">
      {dates.map(date => (
        <div key={date} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {format(parseISO(date), 'M月d日 (eee)', { locale: ja })}
            </span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {byDate[date].map(record => (
              <div key={record.id} className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{record.timing}</span>
                <div className="flex items-center gap-3">
                  {record.notes && (
                    <span className="text-xs text-gray-600 dark:text-gray-500 truncate max-w-24">{record.notes}</span>
                  )}
                  <span className="text-sm text-gray-500 dark:text-gray-400">{record.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
