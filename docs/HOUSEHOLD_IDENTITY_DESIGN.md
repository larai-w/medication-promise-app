# Household Identity And Data Isolation Design

## Purpose

Issue #11 is the main release gate before Medication Promise can invite another
household. The original MVP protected one household behind an access code and used
`USER#default-user`. The data migration and household partition cutover are complete;
the remaining release gate is deriving the household from an authenticated identity
instead of a fixed runtime value.

This document defines the public, implementation-ready design for moving from a
single shared household to isolated invited households without publishing private
household data or credentials.

## Release Goal

An invited household can sign in, use the Web app, and only read or mutate records
and settings that belong to that household.

The first release of this work should cover Web identity and DynamoDB isolation.
Alexa account linking is tracked separately in Issue #12 because it has a different
OAuth and device-permission surface.

## Non-Goals

- Public self-service signup.
- Clinical adherence scoring or medication recommendations.
- Facility or staff dashboards.
- Cross-household analytics.
- Sharing records between households.

## Identity Model

Use an external identity provider for authentication rather than extending the
current access-code gate into a custom auth system.

Implemented identity decision:

| Concern | Decision |
| --- | --- |
| Identity provider | Amazon Cognito User Pool shared with Alexa account linking |
| Household identity | Stable `householdId` assigned by the application |
| User identity | Provider subject stored separately from `householdId` |
| Browser flow | Cognito authorization code grant with PKCE and `openid` scope |
| Session | Encrypted, HTTP-only, secure, 12-hour application session |
| Authorization source | Consistent server-side membership lookup on every API request |

Do not trust a client-provided household ID. The browser may display household
metadata, but every API route must derive the household from the server-side
session.

## DynamoDB Partitioning

Current MVP keys:

| Item type | PK | SK |
| --- | --- | --- |
| Record | `USER#default-user` | `RECORD#YYYY-MM-DDTHH:mm:00#uuid` |
| Settings | `USER#default-user` | `SETTINGS#medication` |

Target keys:

| Item type | PK | SK |
| --- | --- | --- |
| Record | `HOUSEHOLD#<householdId>` | `RECORD#YYYY-MM-DDTHH:mm:00#uuid` |
| Settings | `HOUSEHOLD#<householdId>` | `SETTINGS#medication` |
| Membership | `USER#<providerSubject>` | `MEMBERSHIP#<householdId>` |
| Household metadata | `HOUSEHOLD#<householdId>` | `META` |

The application should expose a small data-access function such as
`getAuthenticatedHousehold(request)`. Route handlers then call `makeHouseholdPK`
with the returned identity instead of importing a global `USER_ID`.

## Migration Plan

1. Household-aware data helpers were added with `default-user` retained as a
   compatibility fallback for local development and controlled rollback.
2. A migration script copied existing `USER#default-user` records and settings into
   one owner household partition without deleting the source.
3. Dry-run and write-mode migration checks were completed before the partition cutover.
4. Production Web data access was switched to `HOUSEHOLD#<householdId>`.
5. Cognito authorization code + PKCE now resolves the provider subject; API routes
   query its membership before data access.
6. The previous partition remains unchanged until rollback confidence is high.

Rollback plan:

- Stop new invitations and return `WEB_AUTH_MODE` to `mvp` through a reviewed deploy.
- Keep `HOUSEHOLD_PARTITION_MODE=household` so current owner data remains available.
- Do not delete membership items, the household partition, or `USER#default-user`
  during the validation window.

## API Boundary Changes

Every protected route must resolve household identity before DynamoDB access:

| Route | Required isolation behavior |
| --- | --- |
| `GET /api/records` | Query only the authenticated household partition |
| `POST /api/records` | Write only into the authenticated household partition |
| `PUT /api/records/[id]` | Validate the record key and update only the authenticated household partition |
| `DELETE /api/records/[id]` | Delete only from the authenticated household partition |
| `GET /api/records/pdf` | Export only the authenticated household partition |
| `GET /api/settings` | Read only the authenticated household settings |
| `PUT /api/settings` | Write only the authenticated household settings |

The encoded record ID must remain a record sort key only. It must not include, accept,
or override a household partition key from the client.

## Test Strategy

Required automated tests for Issue #11:

- Unauthenticated production requests fail closed.
- Authenticated household A cannot read household B records.
- Authenticated household A cannot update or delete household B records.
- Monthly PDF queries only include the authenticated household.
- Settings reads and writes are isolated by household.
- Migration dry-run reports expected source and target counts.
- Production fallback to `default-user` is disabled.
- Invalid, expired, or modified Web sessions fail closed.
- Zero, disabled, or multiple active memberships fail closed before data access.
- The authorization flow uses state and PKCE, and does not require a Web client secret.

Unit tests should use two synthetic household IDs such as `household-a` and
`household-b`. Do not use real names, real medication schedules, access codes, or
production records in tests.

## Operational Checks

Before inviting any household:

- Confirm the existing household can still log in and view migrated records.
- Confirm record create, edit, delete, monthly PDF, and settings save after migration.
- Confirm CloudWatch logs do not include medication details, access codes, or raw
  identity tokens.
- Confirm there is a documented rollback path and a retained pre-migration partition.

## Acceptance Criteria Mapping

| Issue #11 criterion | Design response |
| --- | --- |
| Authentication resolves a stable household identity on every request | Server-side `getAuthenticatedHousehold(request)` boundary |
| DynamoDB keys are derived from the authenticated household | `HOUSEHOLD#<householdId>` partition keys |
| Cross-household read, update, delete, PDF, and settings tests fail closed | Two-household automated isolation suite |
| Existing household is migrated with a tested rollback path | Copy-first migration and retained `USER#default-user` partition |

## Decision

Proceed with Web household identity and DynamoDB partition isolation before any
invitation-only beta. Keep Alexa account linking as the next dependent release gate
in Issue #12.

The release and recovery procedure is documented in
[Web Cognito household authentication runbook](WEB_COGNITO_AUTH_RUNBOOK.md). The
dependent Alexa design is documented in
[Alexa account linking and household membership design](ALEXA_ACCOUNT_LINKING_DESIGN.md).
