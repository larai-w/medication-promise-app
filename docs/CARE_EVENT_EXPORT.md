# Versioned Care Event Export

Medication Promise provides a household-scoped, machine-readable export for personal
review and approved downstream workflows. PDF remains the human-readable report; it
is not the machine-readable contract.

## Endpoint

```text
GET /api/records/export?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Both dates are required and the inclusive range is limited to 366 days. The existing
Web authentication mode determines the household. Query parameters cannot select or
override a household.

The response is an attachment using `medication-promise-export/v2`. Each item follows
the `care-event/v1` medication-event subset documented by
[`schemas/medication-promise-export-v2.schema.json`](schemas/medication-promise-export-v2.schema.json).
The canonical `care-event/v1` schema is maintained in the public
[`GutPacer-ParkinSync-Module`](https://github.com/larai-w/GutPacer-ParkinSync-Module/blob/main/schema/care-event-v1.schema.json)
repository. This repository intentionally encodes a stricter medication-only specialization rather
than copying the full schema. The schema-specialization checker verifies canonical required fields, closed nested objects,
formats, and narrowed enums/constants. The existing CI invocation checks the retained v1
schema; v2 has dedicated export-schema tests and can be checked with the same script.

## Data boundary

The export contains factual medication records, their source, timestamps, optional
household-authored notes, correction status, and provenance. It deliberately excludes:

- household and account identifiers;
- credentials, access codes, and tokens;
- medication names and reminder text;
- themes, badges, streaks, and other presentation state; and
- inferred missed doses.

`patientId: "self"` and `careTeamId: "household"` are self-relative placeholders,
not globally linkable identifiers. A downstream governed environment must assign its
own pseudonymous participant scope when combining exports.

The current record does not distinguish whether the person entering it was the
patient or a family caregiver. The export therefore omits `actorId` and `actorRole`
instead of inferring them.

An optional `payload.medicationRef` may be exported when the source record contains
an opaque `med-...` reference. It is not a medication name and does not establish
clinical identity; absent values remain absent.

Every exported source record has `missingness: "observed"`. Absence of a record is
not converted to `medication_missed`, `confirmed_none`, or any adherence conclusion.
The export is marked `personal_review`; it does not grant research use or establish
consent for another purpose.

Daily condition scores are exported separately in `dailyConditions`. Each score has
`observedAt` (when the person describes the condition) and `recordedAt` (when the
score was saved). These timestamps are intentionally distinct so a downstream
normalizer does not substitute the export time for the original record time. Older
stored condition items without `recordedAt` are returned with the legacy
`observedAt` value as a compatibility fallback.

## Scheduled time in v2

`payload.scheduledTime` is the saved scheduled time, or `null` when unknown.
`scheduledTimeStatus` is `recorded_snapshot` or `unknown`. A recorded snapshot also
includes `scheduledTimeProvenance.settingsUpdatedAt` and `capturedAt`.

New Web and Alexa records capture the versioned settings read in their own partition.
A snapshot is retained only when that settings version predates the recorded occurrence
and the occurrence is not in the future. Missing, unversioned, or inapplicable settings
leave the schedule unknown. Settings read errors remain errors; they are not treated
as default schedules. This is a snapshot of the configuration observed at capture,
not a complete schedule history or proof that a reminder was delivered.

Exports never consult current settings and never substitute the built-in reminder times.
Legacy records without a snapshot remain unknown, including records created before this
change. Backdated records before the current settings version also remain unknown.
Editing a record's time or timing clears the snapshot; notes-only and review-only edits
preserve it. Settings changes do not rewrite existing records. No historical backfill
or database migration is performed.

Consumers must branch on `schemaVersion`, accept null schedules in v2, and exclude
unknown schedules from lateness calculations. A known schedule does not establish a
prescription or justify an adherence conclusion. Event `missingness: observed` still
refers to the medication record, not the availability of its scheduled time.
The retained [v1 schema](schemas/medication-promise-export-v1.schema.json) describes old
exports whose scheduled time was a built-in default. Those values must not be relabeled
as recorded snapshots. The endpoint now emits v2; it does not offer a v1 fallback.

## Corrections and deletion

Records with `updatedAt` are marked `correction.status: "corrected"`. The current
store does not preserve a complete revision chain, so the export does not invent a
superseded event or correction reason.

Deleting an individual record removes it through the existing household-scoped API.
The household-wide deletion code path and its retention/recovery disclosure are
documented in [DATA_DELETION.md](DATA_DELETION.md), but production activation remains
gated by Alexa household cutover and recovery verification.

## Synthetic verification

Automated tests use only the clearly synthetic fixture under
`web/test/fixtures/care-event-export-records.synthetic.json`. Production exports,
household records, and generated export files must not be committed to this public
repository.
