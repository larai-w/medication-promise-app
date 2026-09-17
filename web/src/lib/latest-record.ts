import type { MedicationRecord } from '../types/index.ts'

// 同じ日・同じ時間帯に記録が2件以上あるとき、どれを画面に出すか。
//
// 記録は SK（`RECORD#<date>T<time>:00#<uuid>`）の昇順で返るので、
// 素朴に find() を使うと**一番古い記録**が選ばれる。
// 「朝の薬を飲んだ」と08:00に言い、09:00に言い直しても、画面は08:00のまま残っていた。
//
// 言い直しは訂正なので、**最後に記録されたものを正とする**。
// ⚠️ 古いほうを消すわけではない。記録は両方とも残り、
// `analyzeRecordIntegrity` の `duplicate` が「2件あります」と出し続ける。
// 画面がどちらを代表として見せるか、だけを決めている。
export function latestRecordForTiming(
  records: MedicationRecord[],
  timing: MedicationRecord['timing'],
): MedicationRecord | undefined {
  let latest: MedicationRecord | undefined
  for (const record of records) {
    if (record.timing !== timing) continue
    if (!latest || isLaterThan(record, latest)) latest = record
  }
  return latest
}

// 「飲んだ時刻」(date/time) で比べ、同じなら「記録した時刻」(createdAt) で決める。
// createdAt が無い記録もあるので、そのときは配列の後ろに来たほうを新しいとみなす
// （呼び出し元は昇順の配列を渡す）。
function isLaterThan(a: MedicationRecord, b: MedicationRecord): boolean {
  const aKey = `${a.date}T${a.time}`
  const bKey = `${b.date}T${b.time}`
  if (aKey !== bKey) return aKey > bKey
  if (a.createdAt && b.createdAt) return a.createdAt > b.createdAt
  return true
}
