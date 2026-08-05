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

The response is an attachment using `medication-promise-export/v1`. Each item follows
the `care-event/v1` medication-event subset documented by
[`schemas/medication-promise-export-v1.schema.json`](schemas/medication-promise-export-v1.schema.json).

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

Every exported source record has `missingness: "observed"`. Absence of a record is
not converted to `medication_missed`, `confirmed_none`, or any adherence conclusion.
The export is marked `personal_review`; it does not grant research use or establish
consent for another purpose.

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
