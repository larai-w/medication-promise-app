# Medication Promise Event Export Mapping Table

Version: v1 (Draft)
Date: 2026-08-22
Status: Design only — no implementation

## Overview

This document defines the mapping rules from Medication Promise's existing data models to the health event envelope schema.

## Source Data Models

### MedicationRecord (from `src/types/index.ts`)

```typescript
interface MedicationRecord {
  id: string         // base64url(SK) — for API use
  userId: string
  date: string       // YYYY-MM-DD
  time: string       // HH:MM
  timing: Timing     // 'morning' | 'lunch' | 'evening' | 'bedtime'
  source: 'alexa' | 'manual'
  medicationRef?: string
  notes?: string
  createdAt: string  // ISO8601
  updatedAt?: string // ISO8601
}
```

### DailyCondition (from `src/types/index.ts`)

```typescript
interface DailyCondition {
  date: string
  score: 1 | 2 | 3 | 4 | 5
  observedAt: string
  recordedAt: string
  note?: string
}
```

## Mapping Rules

### 1. MedicationRecord → medication_record Event

| Source Field | Event Field | Transformation | Notes |
|--------------|-------------|----------------|-------|
| — | `envelope_version` | Fixed: `"medpromise-event-v1"` | Not from source |
| — | `classification` | Fixed: `"synthetic"` | Mandatory, never from source |
| — | `event.event_type` | Fixed: `"medication_record"` | Discriminator |
| Generated | `event.event_id` | `evt-med-{YYYYMMDD}-{NNN}` | NNN = sequence within date |
| `date` + `time` | `event.occurred_at` | Combine to ISO 8601 with timezone | e.g., `2026-08-22T08:30:00+09:00` |
| `createdAt` | `event.recorded_at` | Direct copy | Already ISO 8601 |
| `date` | `payload.date` | Direct copy | YYYY-MM-DD |
| `time` | `payload.time` | Direct copy | HH:MM |
| `timing` | `payload.timing` | Direct copy | Enum values match |
| `source` | `payload.source` | Direct copy | `alexa` or `manual` |
| `medicationRef` | `payload.medication_ref` | Direct copy or `null` | Opaque reference only |
| `notes` | `payload.has_note` | `Boolean(notes)` | **Content never exported** |

**Excluded fields:**
- `id`: Internal identifier, not exported
- `userId`: PII, never exported
- `notes`: Free-text content, never exported (only presence via `has_note`)
- `updatedAt`: Internal audit field, not exported

### 2. DailyCondition → daily_condition Event

| Source Field | Event Field | Transformation | Notes |
|--------------|-------------|----------------|-------|
| — | `envelope_version` | Fixed: `"medpromise-event-v1"` | Not from source |
| — | `classification` | Fixed: `"synthetic"` | Mandatory, never from source |
| — | `event.event_type` | Fixed: `"daily_condition"` | Discriminator |
| Generated | `event.event_id` | `evt-cond-{YYYYMMDD}-{NNN}` | NNN = sequence within date |
| `observedAt` | `event.occurred_at` | Direct copy | Already ISO 8601 |
| `recordedAt` | `event.recorded_at` | Direct copy | Already ISO 8601 |
| `date` | `payload.date` | Direct copy | YYYY-MM-DD |
| `score` | `payload.score` | Direct copy | Integer 1-5 |
| — | `payload.scale` | Fixed: `"1-5"` | Scale identifier |
| `note` | `payload.has_note` | `Boolean(note)` | **Content never exported** |

**Excluded fields:**
- `note`: Free-text content, never exported (only presence via `has_note`)

## Event ID Generation

### Format

```
evt-{type}-{YYYYMMDD}-{NNN}
```

| Component | Description | Example |
|-----------|-------------|---------|
| `evt` | Fixed prefix | `evt` |
| `{type}` | Event type code | `med` (medication_record), `cond` (daily_condition) |
| `{YYYYMMDD}` | Event date | `20260822` |
| `{NNN}` | Zero-padded sequence | `001`, `002`, ... |

### Sequence Numbering

- Sequence is per-date, per-type
- Resets daily
- Starts at `001`
- Maximum `999` per date per type (overflow handling: open question)

### Examples

- First medication record on 2026-08-22: `evt-med-20260822-001`
- Third daily condition on 2026-08-22: `evt-cond-20260822-003`

## Consent Mapping

Consent is not derived from event data. It must be explicitly provided at export time.

| Field | Source | Notes |
|-------|--------|-------|
| `status` | Consent store (future) | Must be `granted` for export |
| `granted_at` | Consent store (future) | ISO 8601 timestamp |
| `scope` | Consent store (future) | Array of granted scopes |
| `withdrawal_mechanism` | Static text | e.g., "Settings > Privacy > Withdraw consent" |

**Export gate:** If `status` is not `granted`, export must be blocked.

## Export Metadata Mapping

| Field | Source | Notes |
|-------|--------|-------|
| `exported_at` | System clock | ISO 8601 with timezone |
| `export_batch_id` | Generated | `batch-{YYYYMMDD}-{NNN}` |
| `timezone` | App config | e.g., `+09:00` for JST |

## Timezone Handling

- All `occurred_at` and `recorded_at` timestamps must include timezone offset
- Default timezone: `+09:00` (JST)
- For `MedicationRecord`, combine `date` and `time` with the configured timezone to produce `occurred_at`

## Validation Rules

Before export, validate:

1. `classification` is exactly `"synthetic"`
2. `consent.status` is `"granted"`
3. `event_id` matches the pattern `^evt-(med|cond)-[0-9]{8}-[0-9]{3}$`
4. Payload conforms to the event-type-specific schema
5. No PII fields (`userId`, `notes`, `note`) are present in the output

## Example Outputs

### Medication Record Event

```json
{
  "envelope_version": "medpromise-event-v1",
  "classification": "synthetic",
  "event": {
    "event_type": "medication_record",
    "event_id": "evt-med-20260822-001",
    "occurred_at": "2026-08-22T08:30:00+09:00",
    "recorded_at": "2026-08-22T08:31:15+09:00",
    "payload": {
      "date": "2026-08-22",
      "time": "08:30",
      "timing": "morning",
      "source": "alexa",
      "medication_ref": "med-ref-abc123",
      "has_note": false
    }
  },
  "consent": {
    "status": "granted",
    "granted_at": "2026-08-01T10:00:00+09:00",
    "scope": ["research-export", "local-analysis"],
    "withdrawal_mechanism": "Settings > Privacy > Withdraw consent"
  },
  "export_metadata": {
    "exported_at": "2026-08-22T14:00:00+09:00",
    "export_batch_id": "batch-20260822-001",
    "timezone": "+09:00"
  }
}
```

### Daily Condition Event

```json
{
  "envelope_version": "medpromise-event-v1",
  "classification": "synthetic",
  "event": {
    "event_type": "daily_condition",
    "event_id": "evt-cond-20260822-001",
    "occurred_at": "2026-08-22T20:00:00+09:00",
    "recorded_at": "2026-08-22T20:05:30+09:00",
    "payload": {
      "date": "2026-08-22",
      "score": 4,
      "scale": "1-5",
      "has_note": true
    }
  },
  "consent": {
    "status": "granted",
    "granted_at": "2026-08-01T10:00:00+09:00",
    "scope": ["research-export"],
    "withdrawal_mechanism": "Settings > Privacy > Withdraw consent"
  },
  "export_metadata": {
    "exported_at": "2026-08-22T21:00:00+09:00",
    "export_batch_id": "batch-20260822-002",
    "timezone": "+09:00"
  }
}
```

## Open Questions

1. How to handle sequence overflow (>999 events per date per type)?
2. Should `occurred_at` for medication records use the scheduled time or the actual taken time?
3. How to handle timezone changes (e.g., user travels)?
4. Should deleted/updated records trigger event corrections or new events?