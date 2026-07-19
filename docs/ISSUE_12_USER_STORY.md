# Issue #12 Draft: Alexa account linking and household membership

Suggested title:

```text
[Story] Link Alexa users to the correct household before records or reminders are accessed
```

## User story

As an invited household member,  
I want my linked Alexa skill to resolve my household before it records medication or reads reminder settings,  
so that Alexa only operates on my household's data.

## Context

Issue #11 moved the Web application from a shared legacy partition toward
household-scoped data access. The remaining identity gap is Alexa.

The current Alexa Lambda still records medication and reads settings through
`USER#default-user`. That is acceptable only for the private single-household
deployment. It is not a valid release path for an invited-household beta.

Issue #12 closes that gap by introducing account linking and a server-side
household membership lookup for Alexa requests. The goal is not public signup or
full role management. The goal is a verifiable identity boundary: Alexa must
resolve one linked household before it reads or writes DynamoDB.

Design reference:

- `docs/ALEXA_ACCOUNT_LINKING_DESIGN.md`
- `docs/HOUSEHOLD_IDENTITY_DESIGN.md`

## Acceptance criteria

- [ ] Alexa requests fail closed when no linked account token is present.
- [ ] Alexa requests fail closed when the linked token is invalid, expired, or cannot be verified.
- [ ] A valid linked identity resolves exactly one active household membership before DynamoDB access.
- [ ] Alexa medication records are written only to `HOUSEHOLD#<householdId>` derived from the linked membership.
- [ ] `SetRemindersIntent` reads medication name and reminder schedule only from the linked household settings item.
- [ ] Alexa production code no longer reads from or writes to `USER#default-user` for record or settings paths.
- [ ] Multiple household memberships for one linked identity fail closed until an explicit household-selection design exists.
- [ ] Automated tests cover missing token, invalid token, valid linked membership, ambiguous membership, and household-scoped settings lookup.
- [ ] Echo-device or developer-console verification confirms that one linked account can record medication and recreate reminders for the correct household.
- [ ] Logs and error handling do not expose raw linked tokens, authorization headers, or household-specific private data.

## Risks and non-goals

- Primary risk: an incorrect membership lookup would break the tenant boundary and allow Alexa to operate on the wrong household.
- Operational risk: account linking adds provider configuration, token verification, and more failure states than the current private-skill setup.
- Continuity risk: reminder recreation must continue to work for the existing household during rollout.
- Privacy risk: token contents, household identifiers, or medication details must not leak into logs.
- Non-goal: this story does not add public self-service signup.
- Non-goal: this story does not add multi-household switching in Alexa.
- Non-goal: this story does not claim medical adherence or clinical outcome support.
- Non-goal: this story does not solve facility/staff workflows.

## Suggested metadata

- Area: `alexa`
- Priority: `P0`
- Size: `L`
- Target: `Limited Beta — Identity and Validation`
- Labels to consider: `story`, `area:alexa`, `area:data`, `area:safety`, `process:ai-assisted`

## Evidence and notes

- Current design reference: `docs/ALEXA_ACCOUNT_LINKING_DESIGN.md`
- Related release-gate design: `docs/HOUSEHOLD_IDENTITY_DESIGN.md`
- Product rationale: `docs/PRODUCT_MANAGEMENT_CASE_STUDY.md`
- Delivery policy: `docs/AGILE_DELIVERY.md`
- Current Alexa implementation still uses legacy partitioning:
  - `alexa/dynamodb.mjs`
  - `alexa/index.mjs`

## Suggested implementation split

Created linked tasks:

1. `#22` Define the shared identity provider and Alexa account-linking configuration
2. `#23` Resolve a linked Alexa user to exactly one household membership
3. `#24` Refactor Alexa record and settings access to household-scoped DynamoDB helpers
4. `#25` Add Alexa account-linking failure-path and household-scoped tests
5. `#26` Record linked Alexa device and developer-console verification evidence
