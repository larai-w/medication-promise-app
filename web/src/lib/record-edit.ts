import type { MedicationRecord, UpdateRecordInput } from '../types/index.ts'

// Only send changed occurrence fields: a notes edit must not invalidate its schedule
// snapshot or overwrite an occurrence changed elsewhere since this modal opened.
export function buildRecordEdit(
  original: MedicationRecord,
  edited: Pick<MedicationRecord, 'time' | 'timing' | 'notes'>
): UpdateRecordInput {
  return {
    ...(edited.time !== original.time ? { time: edited.time } : {}),
    ...(edited.timing !== original.timing ? { timing: edited.timing } : {}),
    notes: edited.notes ?? '',
  }
}
