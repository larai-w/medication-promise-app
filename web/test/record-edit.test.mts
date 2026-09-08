import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRecordEdit } from '../src/lib/record-edit.ts'
import { parseUpdateRecordInput } from '../src/lib/record-validation.ts'
import type { MedicationRecord } from '../src/types/index.ts'

const original: MedicationRecord = {
  id: 'synthetic-edit', userId: 'synthetic', date: '2035-01-15',
  time: '08:12', timing: '朝', source: 'manual',
  notes: 'synthetic old note', createdAt: '2035-01-14T23:12:30.000Z',
}

test('notes-only form submits no occurrence fields, including when clearing the note', () => {
  for (const notes of ['synthetic new note', undefined]) {
    assert.deepEqual(parseUpdateRecordInput(buildRecordEdit(original, { ...original, notes })),
      { notes: notes ?? '' })
  }
})

test('changed occurrence fields reach validation to invalidate the saved schedule', () => {
  assert.deepEqual(parseUpdateRecordInput(buildRecordEdit(original, { ...original, time: '08:20' })),
    { time: '08:20', notes: original.notes })
  assert.deepEqual(parseUpdateRecordInput(buildRecordEdit(original, { ...original, timing: '昼' })),
    { timing: '昼', notes: original.notes })
})
