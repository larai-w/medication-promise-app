# Alexa Account Linking Configuration Reference (Issue #22)

## Purpose

[Issue #12](ISSUE_12_USER_STORY.md) moves the Alexa skill from the legacy
`USER#default-user` partition to a household-aware identity model. The
[account-linking design](ALEXA_ACCOUNT_LINKING_DESIGN.md) defines *why* and the
runtime *shape*; this document defines the concrete configuration that must exist
before the Lambda can trust a linked identity.

It is the deliverable for **Issue #22** ("Define the shared identity provider and
Alexa account-linking configuration"). It records the provider decision, the OAuth
flow, the token claims the Lambda verifies, and the minimum console and backend
configuration points. It is a sanitised reference: it lists *which* values are
required, not the real pool IDs, domains, client IDs, or secrets. Those are supplied
at deploy time and never committed (see [PUBLICATION_POLICY.md](PUBLICATION_POLICY.md)).

## Decision: shared identity provider

| Concern | Decision |
| --- | --- |
| Identity provider | **Amazon Cognito User Pool**, the same pool used for invited Web sign-in ([HOUSEHOLD_IDENTITY_DESIGN.md](HOUSEHOLD_IDENTITY_DESIGN.md)) |
| Why one provider | Web and Alexa resolve the **same provider subject (`sub`)**, so one membership record (`USER#<sub>` → `MEMBERSHIP#<householdId>`) serves both surfaces |
| Linking mode | OAuth 2.0 **authorization code grant** via the Cognito Hosted UI |
| Token Alexa forwards | The Cognito **access token** (Alexa places it on the request context) |
| Trust source | Access-token signature + claims verified against the pool JWKS at request time |
| Household lookup key | The stable `sub` claim from the verified access token |

Rationale: keeping Alexa on the Web identity system avoids a second household-binding
mechanism that would have to be secured and audited separately. The runtime already
assumes this — `alexa/cognito.mjs` verifies a Cognito **access** token
(`tokenUse: 'access'`) and returns `{ subject: claims.sub }`.

## OAuth flow shape

```text
1. User opens the skill card in the Alexa app and taps "Link Account".
2. Alexa redirects to the Cognito Hosted UI authorize endpoint (authorization code grant).
3. The user signs in with the same account used for invited Web access.
4. Cognito redirects back to Alexa's redirect URL with an authorization code.
5. Alexa exchanges the code at the Cognito token endpoint for an access token
   (and refresh token) using the Alexa app client credentials.
6. On each skill request, Alexa forwards the access token on the request context.
7. The Lambda verifies the access token against the pool JWKS and extracts `sub`.
8. `sub` resolves exactly one active household membership before any DynamoDB access.
```

| Flow property | Value |
| --- | --- |
| Grant type | `authorization_code` |
| Expected issuer (`iss`) | `https://cognito-idp.<region>.amazonaws.com/<user-pool-id>` |
| Audience / client binding | Cognito access tokens carry no `aud`; binding is enforced by matching `client_id` to the configured Alexa app client (`aws-jwt-verify` checks this) |
| `token_use` | `access` |
| Subject claim | `sub` (stable per user; used as the membership lookup key) |
| Signature | RS256, verified against the pool JWKS |

## Cognito configuration points

Provision these on the shared user pool (values are placeholders here):

- **A dedicated app client for Alexa linking** (separate from the Web app client) with
  a client secret. Alexa requires a confidential client for the token exchange.
- **Allowed OAuth flow:** authorization code grant.
- **Allowed OAuth scopes:** `openid` (minimum). Add `profile`/`email` only if a claim
  beyond `sub` becomes necessary; keep scopes minimal.
- **Hosted UI domain** enabled: `https://<cognito-domain>.auth.<region>.amazoncognito.com`.
- **Allowed callback URLs:** the three Amazon redirect URLs shown in the skill's Account
  Linking page (Alexa provides `https://layla.amazon.com/...`,
  `https://pitangui.amazon.com/...`, `https://alexa.amazon.co.jp/...`).
- **Token validity:** access token short-lived; refresh token long enough that a linked
  household is not forced to relink frequently. Record the chosen values in the deploy runbook.

## Alexa developer console configuration points

Set these under the skill's **Account Linking** section (authorization code grant):

| Field | Value |
| --- | --- |
| Authorization URI | `https://<cognito-domain>.auth.<region>.amazoncognito.com/oauth2/authorize` |
| Access Token URI | `https://<cognito-domain>.auth.<region>.amazoncognito.com/oauth2/token` |
| Client ID | The Alexa Cognito app client ID |
| Client Secret | The Alexa Cognito app client secret (console-only; never committed) |
| Client Authentication Scheme | HTTP Basic (Cognito supports Basic auth for the token endpoint) |
| Scope | `openid` |
| Domain allow-list | `<cognito-domain>.auth.<region>.amazoncognito.com` |

The interaction model and skill package themselves stay out of this repository per the
publication policy; only this sanitised checklist is public.

## Backend / Lambda configuration points

The Lambda reads its trust configuration from environment variables. None contain a
secret, so they can be set as plain Lambda environment configuration:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `ALEXA_HOUSEHOLD_MODE` | `alexa/index.mjs` | `legacy` (default, single-household `USER#default-user`) or `household` (resolve linked identity). Flip to `household` only after linking is verified. |
| `COGNITO_USER_POOL_ID` | `alexa/cognito.mjs` | User pool the access token is verified against (JWKS + issuer). |
| `COGNITO_CLIENT_ID` | `alexa/cognito.mjs` | The Alexa app client ID the token's `client_id` must match. |
| `DYNAMODB_TABLE_NAME` | `alexa/dynamodb.mjs` | Table holding household records, settings, and `USER#<sub>` membership items. |
| `DYNAMODB_REGION` / `AWS_REGION` | `alexa/dynamodb.mjs` | Region of the table. |

Notes:

- The client **secret** lives only in the Alexa developer console token-exchange
  configuration, never in the Lambda or this repository.
- `ALEXA_HOUSEHOLD_MODE` is the rollout switch. Production stays `legacy` until the
  linked path is verified end to end (Issue #24), then flips to `household`. Rollback is
  flipping it back.
- Membership items (`USER#<sub>` → `MEMBERSHIP#<householdId>`) for the existing owner
  household are created out of band in a non-public setup, not by this skill.

## Claim-to-household mapping

```text
Cognito access token  --verify(JWKS, iss, client_id, token_use=access)-->  claims.sub
claims.sub            --getHouseholdMembershipsBySubject("USER#<sub>")-->   [{ householdId, status }]
exactly one active    --resolveAlexaHousehold-->                            HOUSEHOLD#<householdId>
```

Zero, disabled, ambiguous, or unverifiable identities fail closed before any DynamoDB
access (implemented in `alexa/household.mjs`, covered by `alexa/test/household.test.mjs`).

## Open questions (also recorded on Issue #12)

1. **Refresh-token lifetime vs. relink friction.** Longer refresh tokens reduce relink
   prompts but widen the window before a revoked household loses Alexa access. Decide a
   value and document it in the deploy runbook. *(config decision, not code-blocking)*
2. **Reminder permission is orthogonal to linking.** A linked account can still deny the
   `alexa::alerts:reminders` permission; the existing permission-card flow must remain.
   Already handled in `alexa/index.mjs`; confirm during Issue #24 verification.
3. **Membership provisioning path.** This story assumes membership items already exist for
   the invited subject. The mechanism that writes `USER#<sub>` → `MEMBERSHIP#<householdId>`
   at invitation time is Web-side work and is not in scope for #12.

None of the above blocks the completed implementation tasks; they are provisioning and
verification decisions for #24 and the invited-Web-access work.

## Acceptance-criteria mapping (Issue #22)

| Issue #22 "Done when" | Where satisfied |
| --- | --- |
| Chosen identity provider documented | "Decision: shared identity provider" (Cognito User Pool, shared with Web) |
| Alexa linking flow documented (grant, issuer, audience/client binding, subject claim) | "OAuth flow shape" |
| Required Alexa console and backend configuration points listed | "Alexa developer console configuration points" + "Backend / Lambda configuration points" |
| Open questions resolved or recorded on #12 | "Open questions" (recorded, none code-blocking) |
