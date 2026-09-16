import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const mainScreen = await readFile(new URL('../src/components/MainScreen.tsx', import.meta.url), 'utf8')

test('record success is announced with the saved date and timing', () => {
  assert.match(mainScreen, /role="status"/)
  assert.match(mainScreen, /aria-live="polite"/)
  assert.match(mainScreen, /aria-atomic="true"/)
  // 読み上げるのは表示名（`timingLabel`）。保存値そのものではない。
  // 2026-09-16 に「晩」を「夕方」と呼ぶようにした（web/test/timing-label.test.mts）。
  assert.match(mainScreen, /\$\{selectedDateLabel\}の\$\{timingLabel\(timing\)\}（\$\{timingDefaults\[timing\]\}）の服薬記録を保存しました。/)
  assert.match(mainScreen, /\$\{savedDateLabel\}の\$\{timingLabel\(data\.timing\)\}（\$\{data\.time\}）の服薬記録を\$\{editId \? '更新' : '保存'\}しました。/)
  assert.match(mainScreen, /\$\{selectedDateLabel\}の\$\{timingLabel\(record\.timing\)\}（\$\{record\.time\}）の記録を確認済みにしました。/)
})

test('a save confirmation is scoped to the date it describes', () => {
  assert.match(mainScreen, /confirmation\?\.date === selectedDate/)
  assert.match(mainScreen, /setConfirmation\(\{ date: selectedDate/)
  assert.match(mainScreen, /setConfirmation\(\{ date: data\.date/)
})
