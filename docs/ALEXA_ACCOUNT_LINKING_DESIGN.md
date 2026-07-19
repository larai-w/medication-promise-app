# Alexa Account Linking And Household Membership Design

## Purpose

Issue #12 is the next release gate after Web household isolation. Web requests can
now resolve a household-scoped DynamoDB partition, but the Alexa skill still writes
and reads through a fixed legacy user partition.

This document defines the public, implementation-ready design for moving the Alexa
skill from `USER#default-user` to a household-aware identity model without
publishing private account-linking secrets, tokens, or production identifiers.

## Release Goal

An invited household member can link the Alexa skill to the application account,
and Alexa will only:

- record medication into that member's household partition
- read settings from that member's household partition
- fail closed when no valid linked household exists

The release goal is not generic public signup. It is a bounded identity bridge
between an Amazon account and the application's household model.

## Non-Goals

- Public marketplace launch.
- Family role management inside Alexa.
- Facility or staff workflows.
- Alexa-only signup without a Web invitation flow.
- Sharing one Amazon account across multiple households in the first release.

## Current State

The current Alexa Lambda uses:

```text
PK = USER#default-user
SK = RECORD#YYYY-MM-DDTHH:mm:00#uuid
SK = SETTINGS#medication
```

The Lambda has no household lookup step. It records medication and reads settings
by constructing the legacy partition key directly from `USER_ID`.

That is acceptable only for the current private single-household deployment.

## Target Identity Model

The first linked release should separate three identities:

| Concern | Decision |
| --- | --- |
| Web user identity | External identity provider subject |
| Application household identity | Stable internal `householdId` |
| Alexa caller identity | Amazon user identifier from the linked account token |

Alexa must not choose a household by request slot, skill session attribute, or
environment variable. The Lambda should resolve the Amazon user identity from the
linked account token, then look up the corresponding application household.

## Recommended Linking Model

Use Alexa account linking with an authorization-code OAuth flow backed by the same
application identity system chosen for invited Web households.

Recommended first implementation:

| Concern | Decision |
| --- | --- |
| OAuth provider | Same provider used for invited Web sign-in |
| Linking mode | Authorization code grant |
| Alexa token audience | Application backend |
| Household lookup key | Stable provider subject from the linked user |
| Session trust source | Verified access token or introspected token result |

This keeps Web and Alexa on one identity system instead of maintaining a separate
household-binding mechanism only for the skill.

## Membership Data Model

The Web household design already introduced a membership concept:

```text
PK = USER#<providerSubject>
SK = MEMBERSHIP#<householdId>
```

Issue #12 should extend that model to cover Alexa-linked identities by storing a
stable user record that can be resolved from the linked token claims.

Recommended minimum item set:

| Item type | PK | SK | Purpose |
| --- | --- | --- | --- |
| Household membership | `USER#<providerSubject>` | `MEMBERSHIP#<householdId>` | Maps a linked identity to one household |
| Household metadata | `HOUSEHOLD#<householdId>` | `META` | Human-managed metadata and status |
| Optional Alexa link audit | `HOUSEHOLD#<householdId>` | `ALEXA_LINK#<providerSubject>` | Support troubleshooting and unlink cleanup |

The first release should require exactly one active household membership for the
linked subject. Multiple memberships should fail closed until role selection or
household switching is explicitly designed.

## Lambda Boundary

The Lambda should stop constructing partition keys directly from `USER_ID`.

Instead, the data path becomes:

1. Read the linked account token from the Alexa request context.
2. Verify or introspect the token against the chosen identity provider.
3. Extract the stable provider subject.
4. Resolve the application household membership from DynamoDB.
5. Derive `HOUSEHOLD#<householdId>`.
6. Record medication or read settings only within that partition.

This implies a small identity helper boundary for Alexa, similar in intent to the
Web helper that resolves the authenticated household before data access.

Suggested functions:

```text
resolveAlexaHousehold(event)
getHouseholdMembershipBySubject(providerSubject)
recordMedicationForHousehold(household, timing)
getMedicationSettingsForHousehold(household)
```

## Token Handling

The Lambda should not trust unverified token payloads.

Allowed approaches for the first release:

- Verify JWT signature and claims locally against the provider JWKS.
- Introspect opaque tokens against the provider.

Required checks:

- signature or introspection success
- token not expired
- expected issuer
- expected audience or client binding
- subject present

The Lambda must not log raw tokens, full authorization headers, or token claims
containing private personal data.

## Failure Behavior

The linked skill must fail closed and speak clearly when identity resolution fails.

Required user-visible outcomes:

| Failure case | Expected behavior |
| --- | --- |
| No linked account token | Ask the user to link the skill in the Alexa app |
| Invalid or expired token | Ask the user to relink the skill |
| No household membership | Explain that the linked account is not yet invited |
| More than one active household membership | Return a generic unavailable message and log for operator review |
| Household disabled | Return a generic unavailable message |
| DynamoDB or provider error | Return a retry-safe generic error |

The response copy should remain supportive and non-clinical. It should not expose
internal identifiers or account state beyond what the user needs to recover.

## Reminder Behavior

Reminder creation still depends on Alexa reminders permission, but the schedule and
medication name must come from the resolved household settings, not from a global
legacy partition.

Required behavior:

- `SetRemindersIntent` reads settings from the linked household partition
- reminder recreation deletes and recreates only Alexa reminders owned by the skill
- the skill can still operate with generic reminder text when no medication name is
  configured

Reminder permission handling is separate from account linking. A linked account may
still deny reminders permission, and that must continue to produce the existing
permission card flow.

## Migration Strategy

Issue #12 should not migrate historical Alexa records separately. After Issue #11,
records and settings already exist in a household partition.

The migration work here is identity state, not record state:

1. Choose the invited-household identity provider and Web sign-in path.
2. Create membership items for the existing owner household in a non-public setup.
3. Enable Alexa account linking in the skill configuration.
4. Deploy Lambda code that resolves linked household membership.
5. Test linked record creation and settings-backed reminder creation.
6. Remove the production dependency on `USER_ID=default-user` for Alexa paths.

Rollback path:

- Disable account-linked rollout in the skill configuration.
- Redeploy the previous Lambda behavior only for the private household if needed.
- Preserve membership items for later retry unless they are known-bad test data.

## Test Strategy

Required automated tests for Issue #12:

- Missing linked token fails closed with a link-account response.
- Invalid token fails closed.
- Valid token resolves one household membership and writes into that household
  partition.
- Reminder setup reads settings from the resolved household partition.
- Multiple memberships fail closed.
- Disabled or missing household membership fails closed.
- No Alexa path reads or writes `USER#default-user` in production mode.

Unit tests should use synthetic provider subjects and household IDs such as:

```text
provider-user-a
household-a
household-b
```

Do not use real Amazon account identifiers, tokens, invitation codes, or production
records in tests.

## Manual Verification

Before inviting another household:

- Confirm the linked skill can record one medication event into the correct
  household partition.
- Confirm `SetRemindersIntent` uses that household's settings.
- Confirm unlinking or relinking changes access as expected.
- Confirm reminder permission denial still shows the Alexa permission consent card.
- Confirm CloudWatch logs do not contain access tokens, medication details beyond
  existing app behavior, or private household identifiers.

## Acceptance Criteria Mapping

| Issue #12 criterion | Design response |
| --- | --- |
| Alexa resolves a stable linked identity before DynamoDB access | Verified linked token and membership lookup |
| Alexa reads and writes only the linked household partition | `HOUSEHOLD#<householdId>` derived after membership resolution |
| Alexa fails closed when linking is missing, invalid, or ambiguous | Explicit failure behavior and tests |
| Reminder setup uses linked household settings | Household-scoped settings lookup in `SetRemindersIntent` |
| Legacy global Alexa partition dependency is removed | No production Alexa path depends on `USER#default-user` |

## Decision

Proceed with a single identity system shared by invited Web access and Alexa account
linking. The first implementation should support one linked household membership per
user and fail closed for ambiguous or missing identity state.
