# Reminder Schedule Contract

The medication reminder schedule has exactly one authoritative copy: the settings
item in DynamoDB (`SK = SETTINGS#medication`, within the account's household or
legacy user partition). This document defines the stored shape, the validation
rules on both the write path (Web settings) and the read path (Alexa skill
Lambda), and the atomic-write and failure rules that keep a corrupted or partial
schedule from ever producing a wrong-time reminder.

## Canonical shape

The Web settings screen writes each reminder as:

```json
{ "timing": "朝", "time": "08:00" }
```

- `timing` — one of the five supported medication timings: `朝`, `昼`, `晩`,
  `夜8時`, `夜9時`. Closed set; unknown values are rejected.
- `time` — 24-hour clock string matching `HH:MM` (`^(?:[01]\d|2[0-3]):[0-5]\d$`).

The Alexa read path additionally accepts the legacy/environment shape
`{ "timing": "朝", "hour": 8, "min": 0 }` (integers, or numeric strings). When
both `time` and `hour`/`min` are present, `time` wins. Every consumer
normalises to `{ timing, hour, min }` before use.

## Validation rules

Write path (`parseMedicationSettingsInput`, Web):

- Exactly five entries — one per supported timing — are required and stored
  sorted in canonical timing order. Partial schedules are not writable.
- `medicationName` is a trimmed string of at most 80 characters.
- Any violation raises a validation error; nothing is persisted.

Read path (`getReminderSchedule`, Alexa Lambda):

- Accepts 1 to 10 entries (legacy `REMINDER_SCHEDULE_JSON` overrides may carry
  fewer); in practice the write path guarantees exactly five.
- Every entry must carry a supported `timing` and an in-range integer time
  (`hour` 0–23, `min` 0–59). Duplicate timings are rejected.
- The stored schedule always takes precedence over `REMINDER_SCHEDULE_JSON`.

## Atomic-write rules

1. The whole settings item — medication name, schedule, and `updatedAt` — is
   written as one DynamoDB `Put`. Household-scoped writes run inside a single
   `TransactWrite` together with the active-membership condition check, so a
   settings update and its authorisation guard commit or fail together.
2. There are no partial or field-level schedule updates. A schedule change is a
   full replacement of the validated array.
3. Readers never write back what they read, and never merge a stored schedule
   with defaults. A stored value is either fully valid or not used at all.

## Failure behaviour

- **Missing item** — no `SETTINGS#medication` item exists yet: readers fall back
  to the documented default schedule (all five canonical timings). The default
  is copied on read; callers cannot mutate the shared constant.
- **Absent or non-array schedule field** — treated as missing (default applies).
- **Present but corrupt schedule** — wrong entry type, missing or unsupported
  timing, malformed or out-of-range time, duplicates: the read fails loudly with
  a validation error. The Alexa skill answers with a controlled error message;
  no partial schedule is ever served and nothing is silently re-defaulted,
  because a silent change of reminder times is worse than an explicit error.
- An empty array is treated as corrupt (it is present), not as missing.

Regression coverage lives in `alexa/test/config.test.mjs` and
`alexa/test/schedule-robustness.test.mjs` (missing, partial, and corrupt
inputs; run with `npm test` in `alexa/`).