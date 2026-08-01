# Web Cognito Household Authentication Runbook

## Purpose

This runbook is the public-safe release and recovery procedure for
[Issue #11](https://github.com/larai-w/medication-promise-app/issues/11). It moves
the Web application from one shared access code and a configured household ID to a
verified Cognito identity that resolves exactly one active household membership on
every API request.

Do not add real user-pool IDs, client IDs, domains, provider subjects, household
IDs, email addresses, tokens, credentials, medication details, or database output
to this document, an Issue, a PR, a commit message, or a workflow log.

## Runtime contract

```text
Cognito authorization code + PKCE
  -> verified access token (`token_use=access`, expected pool and Web client)
  -> encrypted, HTTP-only application session containing the provider subject
  -> consistent DynamoDB query on `USER#<subject>` / `MEMBERSHIP#*`
  -> exactly one active household
  -> `HOUSEHOLD#<householdId>` for records, PDF, settings, and insights
```

The browser never supplies a trusted household ID. The application session is
encrypted with the existing server-side session secret, expires after 12 hours,
and is checked before protected pages or APIs are served. API routes additionally
re-read membership state so disabling or changing a membership takes effect without
waiting for the browser session to expire. Existing membership rows without a
`status` remain active for compatibility; explicit `active` and `disabled` are the
only accepted status values, and unknown values fail closed.

## Cognito Web client

Use the shared invited-household user pool and create a separate public Web client:

| Setting | Required value |
| --- | --- |
| Client secret | None; this is a public PKCE client |
| OAuth flow | Authorization code grant |
| OAuth scope | `openid` only |
| Callback URL | `https://kusuri.veai.jp/api/auth/callback` |
| Logout URL | `https://kusuri.veai.jp/login` |
| Identity provider | Cognito User Pool |
| Token revocation | Enabled |
| Prevent user-existence errors | Enabled |

The Alexa client remains separate because Alexa performs a confidential token
exchange and has different callback URLs.

## Application configuration

Set these SST Secrets for the `production` stage without printing values:

- `CognitoUserPoolId`
- `CognitoWebClientId`
- `CognitoHostedUiHost`

`MvpAccessCode` and `MvpSessionSecret` remain available during the rollback window.
The session secret is reused only to encrypt the short-lived application session;
the Web Cognito client has no client secret.

## Release checks

1. Confirm the Web client metadata matches the table above without displaying IDs.
2. Confirm the existing invited identity has exactly one active membership.
3. Run Web tests, lint, build, Alexa tests, and the publication-boundary check.
4. Deploy the Web stack only after review.
5. Confirm an unauthenticated page request redirects to `/login` and a protected API
   returns `401` without caching.
6. Complete Hosted UI login with the existing private invited account.
7. Confirm records, create/edit/delete, monthly PDF, and settings operate normally.
8. Confirm membership removal or an ambiguous membership fails closed before data
   access. Use synthetic automated evidence unless an authorized private test is
   required.
9. Confirm logs do not contain access tokens, authorization codes, provider subjects,
   household identifiers, medication details, or schedules.

Public completion evidence records pass/fail and links only. Private values and raw
logs remain outside the repository.

## Rollback

1. Stop invitations and do not delete membership or household data.
2. Revert `WEB_AUTH_MODE` to `mvp` through a reviewed deployment.
3. Keep `HOUSEHOLD_PARTITION_MODE=household` so the existing owner records continue
   to use the migrated household partition.
4. Verify the prior access-code login and owner-household API smoke test.
5. Investigate Cognito configuration or membership state without moving records back
   to `USER#default-user`.

The legacy `USER#default-user` partition remains unchanged during this validation
window as a data rollback source. Deleting it is a separate, explicitly approved
retention decision after the identity release is stable.
