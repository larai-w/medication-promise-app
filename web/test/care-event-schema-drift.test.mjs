import assert from 'node:assert/strict'
import test from 'node:test'
import { assertSchemaSpecialization } from '../scripts/check-care-event-schema-drift.mjs'

const canonical = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'eventType', 'source'],
  properties: {
    schemaVersion: { const: 'care-event/v1' },
    eventType: { type: 'string', enum: ['medication_taken', 'bowel_movement'] },
    source: { type: 'string', minLength: 1 },
  },
}

const validSpecialization = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'eventType', 'source'],
  properties: {
    schemaVersion: { const: 'care-event/v1' },
    eventType: { const: 'medication_taken' },
    source: { const: 'medication-promise' },
  },
}

test('accepts a schema that only narrows the canonical contract', () => {
  assert.doesNotThrow(() => assertSchemaSpecialization(canonical, validSpecialization))
})

test('rejects a specialization that makes a canonical field optional', () => {
  const candidate = structuredClone(validSpecialization)
  candidate.required = candidate.required.filter((field) => field !== 'source')
  assert.throws(() => assertSchemaSpecialization(canonical, candidate), /required field 'source'/)
})

test('rejects a specialization that widens a canonical enum', () => {
  const candidate = structuredClone(validSpecialization)
  candidate.properties.eventType = { enum: ['medication_taken', 'unsupported_event'] }
  assert.throws(() => assertSchemaSpecialization(canonical, candidate), /not a subset/)
})

test('rejects a specialization that adds a field to a closed canonical object', () => {
  const candidate = structuredClone(validSpecialization)
  candidate.properties.extra = { type: 'string' }
  assert.throws(() => assertSchemaSpecialization(canonical, candidate), /unknown field 'extra'/)
})
