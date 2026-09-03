import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const mainScreen = await readFile(new URL('../src/components/MainScreen.tsx', import.meta.url), 'utf8')

test('record success is announced with the selected date and timing', () => {
  assert.match(mainScreen, /role="status"/)
  assert.match(mainScreen, /aria-live="polite"/)
  assert.match(mainScreen, /aria-atomic="true"/)
  assert.match(mainScreen, /\$\{selectedDateLabel\}の\$\{timing\}の服薬記録を保存しました。/)
  assert.match(mainScreen, /\$\{selectedDateLabel\}の\$\{data\.timing\}の服薬記録を\$\{editId \? '更新' : '保存'\}しました。/)
})

test('a save confirmation is scoped to the date it describes', () => {
  assert.match(mainScreen, /confirmation\?\.date === selectedDate/)
  assert.match(mainScreen, /setConfirmation\(\{ date: selectedDate/)
})
