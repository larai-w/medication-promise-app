# Medication Promise Health Event Export Design

Version: v1 (Draft)
Date: 2026-08-22
Status: Design only — no implementation, no deploy

## Purpose

Define a synthetic-only health event export layer for Medication Promise (おくすりの約束). This layer converts medication records and daily condition scores into a standardized event envelope for research assetization and cross-project interoperability, following the same pattern as ParkinSync's FHIR event layer.

## Scope

**In scope:**
- Event envelope schema design
- Two event types: `medication_record` and `daily_condition`
- Consent management structure
- Export metadata structure
- Mapping rules from existing data models

**Out of scope:**
- Actual export API implementation
- DynamoDB schema changes
- UI changes
- Deployment or infrastructure changes

## Design Principles

1. **Synthetic-only**: All exported events must be classified as synthetic. Real patient data is prohibited.
2. **Privacy-first**: No personally identifiable information (PII) in event payloads.
3. **Consent-gated**: Export requires explicit consent with withdrawal mechanism.
4. **Schema-validated**: All events must conform to the JSON Schema.
5. **Interoperable**: Envelope structure aligns with ParkinSync event layer for cross-project consistency.

## Event Envelope Structure

```json
{
  "envelope_version": "medpromise-event-v1",
  "classification": "synthetic",
  "event": { ... },
  "consent": { ... },
  "export_metadata": { ... }
}
```

### envelope_version

Fixed string: `"medpromise-event-v1"`

### classification

Fixed string: `"synthetic"`. This field is mandatory and must always be `"synthetic"`. Real patient data export is prohibited by design.

## Event Types

### 1. medication_record

Represents a medication timing record (服薬記録).

**Source**: `MedicationRecord` type

**Payload fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | string (YYYY-MM-DD) | Yes | Record date |
| `time` | string (HH:MM) | Yes | Record time |
| `timing` | enum | Yes | `morning`, `lunch`, `evening`, `bedtime` |
| `source` | enum | Yes | `alexa`, `manual` |
| `medication_ref` | string or null | No | Opaque medication reference (no real drug name) |
| `has_note` | boolean | Yes | Whether a note was attached (content not included) |

**Privacy note**: The actual note content (`notes` field) is never included in the export. Only the presence/absence (`has_note`) is exported.

### 2. daily_condition

Represents a daily condition score (体調スコア).

**Source**: `DailyCondition` type

**Payload fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | string (YYYY-MM-DD) | Yes | Condition date |
| `score` | integer (1-5) | Yes | Condition score |
| `scale` | string | Yes | Fixed: `"1-5"` |
| `has_note` | boolean | Yes | Whether a note was attached (content not included) |

**Privacy note**: The actual note content (`note` field) is never included in the export. Only the presence/absence (`has_note`) is exported.

## Event Common Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event_type` | enum | Yes | `medication_record` or `daily_condition` |
| `event_id` | string | Yes | Pattern: `evt-{type}-{YYYYMMDD}-{NNN}` |
| `occurred_at` | ISO 8601 datetime | Yes | When the event occurred |
| `recorded_at` | ISO 8601 datetime | Yes | When the event was recorded in the app |
| `payload` | object | Yes | Event-type-specific payload |

### Event ID Format

- Medication record: `evt-med-20260822-001`
- Daily condition: `evt-cond-20260822-001`

The sequence number (`NNN`) is a zero-padded 3-digit counter within the same date and type.

## Consent Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | enum | Yes | `granted`, `pending`, `withdrawn` |
| `granted_at` | ISO 8601 datetime | Yes | When consent was granted |
| `scope` | array of enum | Yes | `research-export`, `local-analysis` |
| `withdrawal_mechanism` | string | No | How consent can be withdrawn |

**Rules:**
- Export is blocked when `status` is `withdrawn` or `pending`.
- At least one scope must be present.
- Scopes must be unique.

## Export Metadata Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `exported_at` | ISO 8601 datetime | Yes | Export timestamp |
| `export_batch_id` | string | Yes | Pattern: `batch-{YYYYMMDD}-{NNN}` |
| `timezone` | string | Yes | UTC offset, e.g., `+09:00` |

## Security and Privacy Considerations

1. **No PII**: Event payloads must not contain user IDs, names, or any directly identifiable information.
2. **No note content**: Free-text notes are excluded from export. Only `has_note` boolean is included.
3. **Opaque references**: `medication_ref` is an opaque identifier, not a real medication name.
4. **Synthetic enforcement**: The `classification` field must be validated as `"synthetic"` before any export.
5. **Consent enforcement**: Export must check consent status and block if not `granted`.
6. **ADR-0005 compliance**: This design follows the measurement privacy policy defined in ADR-0005.

## Relationship to ParkinSync Event Layer

This design intentionally mirrors the ParkinSync FHIR event layer envelope structure to enable:
- Consistent cross-project event processing
- Shared validation tooling
- Unified research export pipeline

Differences:
- `envelope_version`: `medpromise-event-v1` (vs `parkinsync-event-v1`)
- Event types: `medication_record`, `daily_condition` (vs `medication`, `symptom`, `wellbeing`, `caregiver_note`)
- Payload schemas are specific to Medication Promise's data model

## Open Questions

1. Should `daily_condition` support multiple dimensions (physical, emotional, etc.) in the future?
2. Should export batch size be limited (e.g., max 1000 events per batch)?
3. Should there be a retention policy for exported event files?
4. How should consent withdrawal propagate to already-exported batches?

## References

- ParkinSync Event Layer Design: `ParkinSync/fhir/event-layer/EVENT-LAYER-DESIGN.md`
- ParkinSync Event Schema: `ParkinSync/fhir/event-layer/event-schema.json`
- ADR-0005: Measurement Privacy Policy
- Medication Promise types: `src/types/index.ts`