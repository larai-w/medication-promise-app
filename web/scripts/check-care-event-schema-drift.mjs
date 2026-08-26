#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

function allowedValues(schema) {
  if (Object.hasOwn(schema, 'const')) return [schema.const]
  if (Array.isArray(schema.enum)) return schema.enum
  return null
}

function valueMatchesType(value, type) {
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'number') return typeof value === 'number'
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (type === 'null') return value === null
  return typeof value === type
}

function assertMinLengthIsNarrower(base, candidate, path) {
  if (base.minLength === undefined) return
  if (candidate.minLength !== undefined) {
    assert.ok(candidate.minLength >= base.minLength, `${path}: minLength was widened`)
    return
  }

  const values = allowedValues(candidate)
  if (values) {
    assert.ok(
      values.every((value) => typeof value === 'string' && value.length >= base.minLength),
      `${path}: allowed value violates canonical minLength`
    )
    return
  }

  if (candidate.pattern && base.minLength === 1) {
    assert.equal(new RegExp(candidate.pattern).test(''), false, `${path}: pattern permits empty string`)
    return
  }

  assert.fail(`${path}: candidate does not preserve canonical minLength`)
}

export function assertSchemaSpecialization(base, candidate, path = '$') {
  const candidateValues = allowedValues(candidate)

  if (base.type !== undefined) {
    if (candidate.type !== undefined) {
      assert.equal(candidate.type, base.type, `${path}: type differs from canonical`)
    } else {
      assert.ok(candidateValues, `${path}: candidate omits canonical type without const/enum`)
      assert.ok(
        candidateValues.every((value) => valueMatchesType(value, base.type)),
        `${path}: candidate value has the wrong canonical type`
      )
    }
  }

  if (Object.hasOwn(base, 'const')) {
    assert.ok(candidateValues, `${path}: candidate omits canonical const`)
    assert.ok(
      candidateValues.every((value) => Object.is(value, base.const)),
      `${path}: candidate widens canonical const`
    )
  }

  if (Array.isArray(base.enum)) {
    assert.ok(candidateValues, `${path}: candidate omits canonical enum`)
    assert.ok(
      candidateValues.every((value) => base.enum.includes(value)),
      `${path}: candidate enum is not a subset of canonical enum`
    )
  }

  if (base.format !== undefined) {
    assert.equal(candidate.format, base.format, `${path}: canonical format is not preserved`)
  }

  if (base.pattern !== undefined) {
    const values = allowedValues(candidate)
    if (values) {
      const pattern = new RegExp(base.pattern)
      assert.ok(values.every((value) => pattern.test(value)), `${path}: value violates canonical pattern`)
    } else {
      assert.equal(candidate.pattern, base.pattern, `${path}: canonical pattern is not preserved`)
    }
  }

  assertMinLengthIsNarrower(base, candidate, path)

  if (base.type !== 'object') return

  if (base.additionalProperties === false) {
    assert.equal(candidate.additionalProperties, false, `${path}: closed object was widened`)
  }

  const baseRequired = new Set(base.required ?? [])
  const candidateRequired = new Set(candidate.required ?? [])
  for (const field of baseRequired) {
    assert.ok(candidateRequired.has(field), `${path}: canonical required field '${field}' is optional`)
  }

  const baseProperties = base.properties ?? {}
  const candidateProperties = candidate.properties ?? {}
  if (base.additionalProperties === false) {
    for (const field of Object.keys(candidateProperties)) {
      assert.ok(Object.hasOwn(baseProperties, field), `${path}: unknown field '${field}' is allowed`)
    }
  }

  for (const [field, fieldSchema] of Object.entries(candidateProperties)) {
    if (Object.hasOwn(baseProperties, field)) {
      assertSchemaSpecialization(baseProperties[field], fieldSchema, `${path}.${field}`)
    }
  }
}

export function assertMedicationExportCompatibility(canonical, exportSchema) {
  assert.equal(
    exportSchema.properties?.records?.items?.$ref,
    '#/$defs/medicationCareEvent',
    'records must reference the medication care-event definition'
  )
  const candidate = exportSchema.$defs?.medicationCareEvent
  assert.ok(candidate, 'medication care-event definition is missing')
  assertSchemaSpecialization(canonical, candidate)
}

async function main() {
  const [canonicalPath, exportPath] = process.argv.slice(2)
  if (!canonicalPath || !exportPath) {
    throw new Error('usage: check-care-event-schema-drift.mjs CANONICAL_SCHEMA EXPORT_SCHEMA')
  }
  const canonical = JSON.parse(await readFile(canonicalPath, 'utf8'))
  const exportSchema = JSON.parse(await readFile(exportPath, 'utf8'))
  assertMedicationExportCompatibility(canonical, exportSchema)
  console.log('care-event/v1 specialization drift check: PASS')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`care-event/v1 specialization drift check: FAIL: ${error.message}`)
    process.exitCode = 1
  })
}
