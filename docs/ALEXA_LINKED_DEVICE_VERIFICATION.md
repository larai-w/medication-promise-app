# Linked Alexa Device Verification Runbook

## Purpose

This runbook is the manual release gate for
[Issue #24](https://github.com/larai-w/medication-promise-app/issues/24) and the
final device-level criterion in
[Issue #12](https://github.com/larai-w/medication-promise-app/issues/12).
Automated tests prove the fail-closed and household-scoped code paths; they do not
prove that the Alexa account-linking console, Cognito Hosted UI, physical device,
and Reminders API work together.

Do not paste screenshots, identifiers, tokens, medication names, schedules,
household keys, email addresses, or raw database/log output into a public issue.
Record only the sanitized outcomes defined below.

## Roles

- **Operator:** performs Alexa app, Hosted UI, and Echo or developer-console actions.
- **Verifier:** checks sanitized AWS evidence and records pass/fail without private values.
- One person may hold both roles, but the device action and evidence check remain distinct steps.

## Automated Preflight

Before touching the device, verify these conditions without printing real values:

- the latest reviewed Alexa package is deployed to the intended Lambda
- `ALEXA_HOUSEHOLD_MODE` is `household`
- the Lambda has Cognito pool/client and DynamoDB table configuration
- the Cognito Hosted UI domain is active
- the Alexa Cognito client uses authorization-code flow and has the expected callback URLs
- exactly one active membership resolves the linked subject to the intended household
- the production log group exists

If any check fails, stop. Do not temporarily return to the legacy partition merely
to make the device test pass.

## Test Data

Use the existing private owner household. Choose one medication timing that can be
clearly identified by the test timestamp. Do not change the real medication name or
schedule solely for this test.

Record the test start/end times privately. Public evidence may state the date and
result, but not the exact household, user, medication, or token values.

## Verification Sequence

### 1. Link the account

1. Open the private skill's settings in the Alexa app.
2. Select **Link Account**.
3. Sign in through the configured Cognito Hosted UI and approve the link.
4. Confirm the Alexa app reports a linked account.

Expected result: linking completes without exposing a token or internal identifier.

### 2. Record one medication event

1. Open the skill on the Echo or in the Alexa developer console.
2. Record the selected timing using the normal utterance.
3. Confirm Alexa speaks the success response.
4. Verify that exactly one new item has `source = alexa` in the resolved household
   partition and that no corresponding item was written to the legacy partition.

Expected result: one linked-household record, zero legacy-partition records.

### 3. Recreate reminders

1. Invoke the reminder-setting intent.
2. If permission is not granted, confirm the permission card is shown, grant only
   the Reminders permission, and invoke the intent again.
3. Confirm Alexa reports the expected reminder count.
4. Confirm the recreated reminders use the household settings and are visible in
   the Alexa app.

Expected result: reminders are recreated from household settings without a generic
or legacy settings read.

### 4. Verify unlink and relink behavior

1. Unlink the skill account in the Alexa app.
2. Attempt the record utterance again.
3. Confirm the request fails closed and asks for account linking; confirm no record
   is written.
4. Relink the same account.
5. Repeat one record utterance and confirm household-scoped access is restored.

Expected result: unlink blocks data access; relink restores only the same household.

### 5. Review operational evidence

For the test window, verify:

- no DynamoDB or reminder error remains unexplained
- logs contain no JWT-shaped value, raw access token, authorization header,
  provider subject, household identifier, medication name, or schedule
- test records and reminders are either retained intentionally or removed through
  the normal product workflow
- rollback remains available by disabling the linked rollout; do not delete
  membership data during an ordinary rollback

## Public Evidence Template

Post only this sanitized shape to the issue:

```text
Verification date: YYYY-MM-DD
Surface: physical Echo | Alexa developer console
Account linking: PASS | FAIL
Household-scoped record: PASS | FAIL
Legacy partition remained untouched: PASS | FAIL
Household settings reminder recreation: PASS | FAIL
Permission-card path: PASS | FAIL | NOT EXERCISED
Unlink fails closed: PASS | FAIL
Relink restores expected access: PASS | FAIL
Sensitive-log scan: PASS | FAIL
Open defects: none | public issue links only
Operator notes: sanitized limitations or manual rollout steps only
```

## Completion Rule

Issue #24 is complete only when all required checks pass and no critical defect is
open. A successful Lambda deployment, unit test, or direct backend invocation alone
is not device or developer-console evidence.
