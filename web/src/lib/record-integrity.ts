import type { MedicationRecord } from '../types/index.ts'

export type RecordIntegrityIssue = {
  kind: 'duplicate' | 'date-mismatch' | 'unconfirmed'
  recordIds: string[]
  date: string
  timing: MedicationRecord['timing']
  reason: string
}

export function analyzeRecordIntegrity(records: MedicationRecord[], expectedDate?: string) {
  const issues: RecordIntegrityIssue[] = []
  const byTiming = new Map<string, MedicationRecord[]>()

  for (const record of records) {
    const key = `${record.date}:${record.timing}`
    const group = byTiming.get(key) ?? []
    group.push(record)
    byTiming.set(key, group)

    if (expectedDate && record.date !== expectedDate) {
      issues.push({
        kind: 'date-mismatch',
        recordIds: [record.id],
        date: record.date,
        timing: record.timing,
        reason: `画面の対象日${expectedDate}と記録日${record.date}が一致しません`,
      })
    }

    if (record.source === 'alexa' && record.reviewStatus !== 'reviewed') {
      issues.push({
        kind: 'unconfirmed',
        recordIds: [record.id],
        date: record.date,
        timing: record.timing,
        reason: '音声入力由来の記録です。記録内容を確認してください',
      })
    }
  }

  for (const group of byTiming.values()) {
    if (group.length < 2) continue
    issues.push({
      kind: 'duplicate',
      recordIds: group.map(record => record.id),
      date: group[0].date,
      timing: group[0].timing,
      reason: `${group[0].date}の${group[0].timing}に${group.length}件の記録があります`,
    })
  }

  return {
    issues,
    hasIssues: issues.length > 0,
    duplicateCount: issues.filter(issue => issue.kind === 'duplicate').length,
    dateMismatchCount: issues.filter(issue => issue.kind === 'date-mismatch').length,
    unconfirmedCount: issues.filter(issue => issue.kind === 'unconfirmed').length,
  }
}
