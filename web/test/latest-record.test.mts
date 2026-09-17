import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { latestRecordForTiming } from '../src/lib/latest-record.ts'

const rec = (over: Record<string, unknown> = {}) => ({
  id: 'r1', userId: 'u', date: '2026-09-16', time: '08:00',
  timing: '朝', source: 'alexa', ...over,
} as never)

test('同じ時間帯が2件あるとき、あとから記録したほうを返す', () => {
  // 08:00 に「飲んだ」と言い、09:00 に言い直した。配列は昇順で届く。
  const records = [
    rec({ id: 'first',  time: '08:00' }),
    rec({ id: 'second', time: '09:00' }),
  ]
  assert.equal(latestRecordForTiming(records, '朝' as never)?.id, 'second')
})

test('配列の順序に関係なく、遅いほうを返す', () => {
  const records = [
    rec({ id: 'later',   time: '09:00' }),
    rec({ id: 'earlier', time: '08:00' }),
  ]
  assert.equal(latestRecordForTiming(records, '朝' as never)?.id, 'later')
})

test('飲んだ時刻が同じなら、記録した時刻（createdAt）で決める', () => {
  const records = [
    rec({ id: 'first',  time: '08:00', createdAt: '2026-09-16T00:00:00.000Z' }),
    rec({ id: 'second', time: '08:00', createdAt: '2026-09-16T01:00:00.000Z' }),
  ]
  assert.equal(latestRecordForTiming(records, '朝' as never)?.id, 'second')
})

test('日をまたいでも、日付を含めて比べる', () => {
  const records = [
    rec({ id: 'yesterday', date: '2026-09-15', time: '23:00' }),
    rec({ id: 'today',     date: '2026-09-16', time: '07:00' }),
  ]
  assert.equal(latestRecordForTiming(records, '朝' as never)?.id, 'today')
})

test('別の時間帯は混ぜない', () => {
  const records = [
    rec({ id: 'morning', timing: '朝',   time: '08:00' }),
    rec({ id: 'lunch',   timing: '昼',   time: '12:00' }),
  ]
  assert.equal(latestRecordForTiming(records, '朝' as never)?.id, 'morning')
  assert.equal(latestRecordForTiming(records, '昼' as never)?.id, 'lunch')
})

test('該当が無ければ undefined', () => {
  assert.equal(latestRecordForTiming([], '朝' as never), undefined)
})

test('MainScreen が find ではなく latestRecordForTiming を使っている', async () => {
  // 回帰防止。find() に戻すと、言い直しても古い記録が画面に残る。
  const mainScreen = await readFile(new URL('../src/components/MainScreen.tsx', import.meta.url), 'utf8')
  assert.match(mainScreen, /latestRecordForTiming\(todayRecords, t\)/)
  assert.doesNotMatch(mainScreen, /todayRecords\.find\(r => r\.timing === t\)/)
})

test('古い記録は消さない — duplicate の検出は残っている', async () => {
  // 画面がどれを代表に出すかを変えただけで、記録そのものは両方残る。
  const integrity = await readFile(new URL('../src/lib/record-integrity.ts', import.meta.url), 'utf8')
  assert.match(integrity, /kind: 'duplicate'/)
})
