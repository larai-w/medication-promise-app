/**
 * Medication Promise Health Event Schema Validation Test
 * 
 * This is a design-phase validation script. It validates:
 * 1. The JSON schema file is valid JSON
 * 2. The schema has required top-level structure
 * 3. Sample events conform to expected structure
 * 
 * Run: node src/lib/event-export/validate-schema.test.mjs
 * 
 * Status: Design only — no implementation, no deploy
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function assertThrows(fn, message) {
  try {
    fn();
    console.error(`  ✗ ${message} (expected to throw)`);
    failed++;
  } catch {
    console.log(`  ✓ ${message}`);
    passed++;
  }
}

// --- Test 1: Schema file is valid JSON ---
console.log('\n[Test 1] Schema file is valid JSON');
let schema;
try {
  const raw = readFileSync(join(__dirname, 'health-event-schema.json'), 'utf-8');
  schema = JSON.parse(raw);
  assert(true, 'health-event-schema.json parsed successfully');
} catch (e) {
  assert(false, `health-event-schema.json parse failed: ${e.message}`);
  process.exit(1);
}

// --- Test 2: Schema top-level structure ---
console.log('\n[Test 2] Schema top-level structure');
assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', '$schema is draft 2020-12');
assert(schema.type === 'object', 'top-level type is object');
assert(Array.isArray(schema.required), 'required is an array');
assert(schema.required.includes('envelope_version'), 'required includes envelope_version');
assert(schema.required.includes('classification'), 'required includes classification');
assert(schema.required.includes('event'), 'required includes event');
assert(schema.required.includes('consent'), 'required includes consent');
assert(schema.properties.envelope_version.const === 'medpromise-event-v1', 'envelope_version const is medpromise-event-v1');
assert(schema.properties.classification.const === 'synthetic', 'classification const is synthetic');

// --- Test 3: $defs structure ---
console.log('\n[Test 3] $defs structure');
assert(schema.$defs !== undefined, '$defs exists');
assert(schema.$defs.event !== undefined, '$defs.event exists');
assert(schema.$defs.medicationRecordPayload !== undefined, '$defs.medicationRecordPayload exists');
assert(schema.$defs.dailyConditionPayload !== undefined, '$defs.dailyConditionPayload exists');
assert(schema.$defs.consent !== undefined, '$defs.consent exists');
assert(schema.$defs.exportMetadata !== undefined, '$defs.exportMetadata exists');
assert(schema.$defs.isoDateTime !== undefined, '$defs.isoDateTime exists');

// --- Test 4: Event type enum ---
console.log('\n[Test 4] Event type enum');
const eventTypeEnum = schema.$defs.event.properties.event_type.enum;
assert(Array.isArray(eventTypeEnum), 'event_type enum is array');
assert(eventTypeEnum.includes('medication_record'), 'event_type includes medication_record');
assert(eventTypeEnum.includes('daily_condition'), 'event_type includes daily_condition');
assert(eventTypeEnum.length === 2, 'event_type has exactly 2 values');

// --- Test 5: Event ID pattern ---
console.log('\n[Test 5] Event ID pattern');
const eventIdPattern = schema.$defs.event.properties.event_id.pattern;
assert(eventIdPattern !== undefined, 'event_id has pattern');
const eventIdRegex = new RegExp(eventIdPattern);
assert(eventIdRegex.test('evt-med-20260822-001'), 'pattern matches evt-med-20260822-001');
assert(eventIdRegex.test('evt-cond-20260822-003'), 'pattern matches evt-cond-20260822-003');
assert(!eventIdRegex.test('evt-invalid-20260822-001'), 'pattern rejects invalid type');
assert(!eventIdRegex.test('evt-med-2026082-001'), 'pattern rejects short date');
assert(!eventIdRegex.test('evt-med-20260822-01'), 'pattern rejects short sequence');

// --- Test 6: Medication record payload ---
console.log('\n[Test 6] Medication record payload schema');
const medPayload = schema.$defs.medicationRecordPayload;
assert(medPayload.type === 'object', 'medicationRecordPayload type is object');
assert(medPayload.required.includes('date'), 'requires date');
assert(medPayload.required.includes('time'), 'requires time');
assert(medPayload.required.includes('timing'), 'requires timing');
assert(medPayload.required.includes('source'), 'requires source');
assert(medPayload.required.includes('has_note'), 'requires has_note');
assert(!medPayload.required.includes('medication_ref'), 'medication_ref is optional');
assert(!medPayload.properties.notes, 'notes field is NOT in payload (privacy)');
assert(!medPayload.properties.userId, 'userId field is NOT in payload (privacy)');
assert(medPayload.additionalProperties === false, 'additionalProperties is false');

const timingEnum = medPayload.properties.timing.enum;
assert(timingEnum.includes('morning'), 'timing includes morning');
assert(timingEnum.includes('lunch'), 'timing includes lunch');
assert(timingEnum.includes('evening'), 'timing includes evening');
assert(timingEnum.includes('bedtime'), 'timing includes bedtime');

const sourceEnum = medPayload.properties.source.enum;
assert(sourceEnum.includes('alexa'), 'source includes alexa');
assert(sourceEnum.includes('manual'), 'source includes manual');

// --- Test 7: Daily condition payload ---
console.log('\n[Test 7] Daily condition payload schema');
const condPayload = schema.$defs.dailyConditionPayload;
assert(condPayload.type === 'object', 'dailyConditionPayload type is object');
assert(condPayload.required.includes('date'), 'requires date');
assert(condPayload.required.includes('score'), 'requires score');
assert(condPayload.required.includes('scale'), 'requires scale');
assert(condPayload.required.includes('has_note'), 'requires has_note');
assert(!condPayload.properties.note, 'note field is NOT in payload (privacy)');
assert(condPayload.properties.score.minimum === 1, 'score minimum is 1');
assert(condPayload.properties.score.maximum === 5, 'score maximum is 5');
assert(condPayload.properties.scale.const === '1-5', 'scale const is 1-5');
assert(condPayload.additionalProperties === false, 'additionalProperties is false');

// --- Test 8: Consent schema ---
console.log('\n[Test 8] Consent schema');
const consent = schema.$defs.consent;
assert(consent.required.includes('status'), 'requires status');
assert(consent.required.includes('granted_at'), 'requires granted_at');
assert(consent.required.includes('scope'), 'requires scope');
const statusEnum = consent.properties.status.enum;
assert(statusEnum.includes('granted'), 'status includes granted');
assert(statusEnum.includes('pending'), 'status includes pending');
assert(statusEnum.includes('withdrawn'), 'status includes withdrawn');
assert(consent.properties.scope.minItems === 1, 'scope minItems is 1');
assert(consent.properties.scope.uniqueItems === true, 'scope uniqueItems is true');

// --- Test 9: Export metadata schema ---
console.log('\n[Test 9] Export metadata schema');
const exportMeta = schema.$defs.exportMetadata;
assert(exportMeta.required.includes('exported_at'), 'requires exported_at');
assert(exportMeta.required.includes('export_batch_id'), 'requires export_batch_id');
assert(exportMeta.required.includes('timezone'), 'requires timezone');
const batchPattern = exportMeta.properties.export_batch_id.pattern;
const batchRegex = new RegExp(batchPattern);
assert(batchRegex.test('batch-20260822-001'), 'batch pattern matches batch-20260822-001');
assert(!batchRegex.test('batch-invalid'), 'batch pattern rejects invalid format');

// --- Test 10: ISO datetime pattern ---
console.log('\n[Test 10] ISO datetime pattern');
const isoPattern = schema.$defs.isoDateTime.pattern;
const isoRegex = new RegExp(isoPattern);
assert(isoRegex.test('2026-08-22T08:30:00+09:00'), 'matches JST datetime');
assert(isoRegex.test('2026-08-22T08:30:00Z'), 'matches UTC datetime');
assert(!isoRegex.test('2026-08-22 08:30:00'), 'rejects space separator');
assert(!isoRegex.test('2026-08-22T08:30:00'), 'rejects missing timezone');

// --- Test 11: Sample valid medication event structure ---
console.log('\n[Test 11] Sample valid medication event structure');
const sampleMedEvent = {
  envelope_version: 'medpromise-event-v1',
  classification: 'synthetic',
  event: {
    event_type: 'medication_record',
    event_id: 'evt-med-20260822-001',
    occurred_at: '2026-08-22T08:30:00+09:00',
    recorded_at: '2026-08-22T08:31:15+09:00',
    payload: {
      date: '2026-08-22',
      time: '08:30',
      timing: 'morning',
      source: 'alexa',
      medication_ref: 'med-ref-abc123',
      has_note: false
    }
  },
  consent: {
    status: 'granted',
    granted_at: '2026-08-01T10:00:00+09:00',
    scope: ['research-export', 'local-analysis'],
    withdrawal_mechanism: 'Settings > Privacy > Withdraw consent'
  },
  export_metadata: {
    exported_at: '2026-08-22T14:00:00+09:00',
    export_batch_id: 'batch-20260822-001',
    timezone: '+09:00'
  }
};

assert(sampleMedEvent.envelope_version === schema.properties.envelope_version.const, 'sample envelope_version matches');
assert(sampleMedEvent.classification === schema.properties.classification.const, 'sample classification matches');
assert(eventTypeEnum.includes(sampleMedEvent.event.event_type), 'sample event_type is valid');
assert(eventIdRegex.test(sampleMedEvent.event.event_id), 'sample event_id matches pattern');
assert(isoRegex.test(sampleMedEvent.event.occurred_at), 'sample occurred_at matches ISO pattern');
assert(isoRegex.test(sampleMedEvent.event.recorded_at), 'sample recorded_at matches ISO pattern');
assert(timingEnum.includes(sampleMedEvent.event.payload.timing), 'sample timing is valid');
assert(sourceEnum.includes(sampleMedEvent.event.payload.source), 'sample source is valid');
assert(typeof sampleMedEvent.event.payload.has_note === 'boolean', 'sample has_note is boolean');
assert(statusEnum.includes(sampleMedEvent.consent.status), 'sample consent status is valid');
assert(sampleMedEvent.consent.scope.length >= 1, 'sample scope has at least 1 item');
assert(batchRegex.test(sampleMedEvent.export_metadata.export_batch_id), 'sample batch_id matches pattern');

// --- Test 12: Sample valid daily condition event structure ---
console.log('\n[Test 12] Sample valid daily condition event structure');
const sampleCondEvent = {
  envelope_version: 'medpromise-event-v1',
  classification: 'synthetic',
  event: {
    event_type: 'daily_condition',
    event_id: 'evt-cond-20260822-001',
    occurred_at: '2026-08-22T20:00:00+09:00',
    recorded_at: '2026-08-22T20:05:30+09:00',
    payload: {
      date: '2026-08-22',
      score: 4,
      scale: '1-5',
      has_note: true
    }
  },
  consent: {
    status: 'granted',
    granted_at: '2026-08-01T10:00:00+09:00',
    scope: ['research-export']
  },
  export_metadata: {
    exported_at: '2026-08-22T21:00:00+09:00',
    export_batch_id: 'batch-20260822-002',
    timezone: '+09:00'
  }
};

assert(sampleCondEvent.event.event_type === 'daily_condition', 'sample event_type is daily_condition');
assert(eventIdRegex.test(sampleCondEvent.event.event_id), 'sample event_id matches pattern');
assert(Number.isInteger(sampleCondEvent.event.payload.score), 'sample score is integer');
assert(sampleCondEvent.event.payload.score >= 1 && sampleCondEvent.event.payload.score <= 5, 'sample score in range 1-5');
assert(sampleCondEvent.event.payload.scale === condPayload.properties.scale.const, 'sample scale matches const');

// --- Test 13: Privacy checks ---
console.log('\n[Test 13] Privacy checks');
const medPayloadKeys = Object.keys(medPayload.properties);
const condPayloadKeys = Object.keys(condPayload.properties);
assert(!medPayloadKeys.includes('notes'), 'medication payload does not include notes content');
assert(!medPayloadKeys.includes('userId'), 'medication payload does not include userId');
assert(!medPayloadKeys.includes('id'), 'medication payload does not include internal id');
assert(!condPayloadKeys.includes('note'), 'condition payload does not include note content');
assert(medPayloadKeys.includes('has_note'), 'medication payload includes has_note boolean');
assert(condPayloadKeys.includes('has_note'), 'condition payload includes has_note boolean');

// --- Test 14: Invalid event rejection checks ---
console.log('\n[Test 14] Invalid event rejection checks');
assertThrows(() => {
  const invalid = { ...sampleMedEvent, classification: 'real' };
  if (invalid.classification !== schema.properties.classification.const) throw new Error('invalid classification');
}, 'rejects classification=real');

assertThrows(() => {
  const invalid = { ...sampleMedEvent, envelope_version: 'wrong-version' };
  if (invalid.envelope_version !== schema.properties.envelope_version.const) throw new Error('invalid version');
}, 'rejects wrong envelope_version');

assertThrows(() => {
  const invalidId = 'evt-unknown-20260822-001';
  if (!eventIdRegex.test(invalidId)) throw new Error('invalid event_id');
}, 'rejects invalid event_id type code');

assertThrows(() => {
  const invalidScore = 6;
  if (invalidScore < 1 || invalidScore > 5) throw new Error('score out of range');
}, 'rejects score > 5');

assertThrows(() => {
  const invalidScore = 0;
  if (invalidScore < 1 || invalidScore > 5) throw new Error('score out of range');
}, 'rejects score < 1');

// --- Summary ---
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  console.error('\nSchema validation FAILED');
  process.exit(1);
} else {
  console.log('\nSchema validation PASSED');
  process.exit(0);
}