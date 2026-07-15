import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InputValidationError,
  isValidDate,
  isValidMonth,
  parseCreateRecordInput,
  parseUpdateRecordInput,
  validateRecordSortKey,
} from '../src/lib/record-validation.ts'

test('calendar dates and months are validated strictly', () => {
  assert.equal(isValidDate('2026-02-28'), true)
  assert.equal(isValidDate('2026-02-29'), false)
  assert.equal(isValidDate('2024-02-29'), true)
  assert.equal(isValidMonth('2026-12'), true)
  assert.equal(isValidMonth('2026-13'), false)
})

test('create input accepts only known timings, valid time, and short notes', () => {
  assert.deepEqual(parseCreateRecordInput({
    date: '2026-07-15',
    time: '08:05',
    timing: '朝',
    notes: '  体調よし  ',
  }), {
    date: '2026-07-15',
    time: '08:05',
    timing: '朝',
    notes: '体調よし',
  })
  assert.throws(
    () => parseCreateRecordInput({ date: '2026-07-15', time: '25:00', timing: '朝' }),
    InputValidationError
  )
  assert.throws(
    () => parseCreateRecordInput({ date: '2026-07-15', time: '08:00', timing: '深夜' }),
    InputValidationError
  )
  assert.throws(
    () => parseCreateRecordInput({ date: '2026-07-15', time: '08:00', timing: '朝', notes: 'a'.repeat(201) }),
    InputValidationError
  )
})

test('update input requires at least one valid field', () => {
  assert.deepEqual(parseUpdateRecordInput({ notes: '' }), { notes: '' })
  assert.throws(() => parseUpdateRecordInput({}), /更新内容がありません/)
})

test('record sort keys cannot escape the medication-record namespace', () => {
  const valid = 'RECORD#2026-07-15T08:00:00#123e4567-e89b-12d3-a456-426614174000'
  assert.equal(validateRecordSortKey(valid), valid)
  assert.throws(() => validateRecordSortKey('PROFILE#admin'), /記録ID/)
})
