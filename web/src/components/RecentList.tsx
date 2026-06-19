import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { MedicationRecord } from '@/types'

interface Props {
  records: MedicationRecord[]
}

export default function RecentList({ records }: Props) {
  if (records.length === 0) {
    return <p className="text-gray-400 text-sm py-2">過去6日間の記録はありません</p>
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
        <div key={date} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-600">
              {format(parseISO(date), 'M月d日 (eee)', { locale: ja })}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {byDate[date].map(record => (
              <div key={record.id} className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{record.timing}</span>
                <div className="flex items-center gap-3">
                  {record.notes && (
                    <span className="text-xs text-gray-400 truncate max-w-24">{record.notes}</span>
                  )}
                  <span className="text-sm text-gray-500">{record.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
