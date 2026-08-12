# Household Data Deletion

Medication Promise contains a household-scoped deletion path for records, settings,
household-partition metadata, and the requesting Cognito subject's application
membership mapping. It is implemented and synthetic-test verified, but it remains
disabled in production until the release gates below are complete.

## Endpoint

```http
GET /api/account/data
DELETE /api/account/data
```

The server derives the household and provider subject from the encrypted Cognito
session and DynamoDB membership. A request body cannot select a household. The
destructive request requires the same configured origin, the exact confirmation
phrase returned by `GET`, and explicit acknowledgement of recovery and external-data
limits.

## Deletion Order

1. Change the verified membership state from `active` to `deleting`. Normal Web and
   linked Alexa household resolution then fail closed.
   Household-mode record and settings mutations also condition-check that same
   membership as `active` in the DynamoDB transaction that performs the write. A
   request resolved immediately before the state change therefore cannot write after
   the deletion lock.
2. Query only the resolved `HOUSEHOLD#<householdId>` partition with consistent reads.
3. Delete every item in batches, retry unprocessed writes, and repeat the sweep to
   catch requests that were already in flight.
4. Verify that the household partition is empty.
5. Delete only `USER#<verified-subject>` / `MEMBERSHIP#<householdId>`.
6. Clear the Web application session and return a generic confirmation without IDs,
   medication details, or record counts.

If a data sweep fails, the membership remains in `deleting` state. The deletion
endpoint can resolve that state and retry, while ordinary product access remains
blocked.

## Retention And Recovery Boundary

- Active DynamoDB items become unavailable to the app when deletion completes.
- DynamoDB point-in-time recovery or backup copies may retain data for the configured
  AWS recovery period. They are not available through the product UI. The operator
  must verify the live retention setting before enabling deletion and must not restore
  a deleted household into active service without a documented legal and user-approved
  reason.
- The Cognito credential account is outside this DynamoDB deletion operation. Removing
  the application membership prevents product data access; deleting the Cognito user
  remains an operator action.
- Alexa reminders are held by Amazon, not this DynamoDB table. The UI tells the user
  to remove reminders and unlink the skill separately.
- No deletion receipt containing household, subject, medication, or record values is
  written to a public issue or support channel.

## Production Release Gates

`ACCOUNT_DELETION_ENABLED` is set to `false` in the production SST configuration.
Do not enable it until all of the following are verified:

1. Alexa production uses household account linking and no active path writes to the
   retained `USER#default-user` legacy partition.
2. The disposition of the retained legacy migration source is approved and executed
   without deleting unrelated data.
3. The live DynamoDB PITR/backup retention period and recovery procedure are recorded
   privately.
4. A synthetic production household proves export-before-delete, deletion, blocked
   re-entry, no cross-household effect, and sanitized confirmation.
5. The Cognito-user and Alexa-reminder operator steps have named owners.

Until then, users can delete individual records through the existing household-scoped
record API, and the settings screen reports that bulk deletion is being prepared.

## Automated Evidence

`web/test/account-deletion.test.mts` uses synthetic household and subject identifiers
to verify partition isolation, server-derived identity, fail-closed feature and origin
gates, membership-last deletion, and session clearing. Production records, account
identifiers, and credentials must never be added to this repository or its issues.
The household-isolation and Alexa DynamoDB tests also verify that every household-mode
mutation carries an active-membership condition in the same transaction.
