# Incident Response Runbook

**Status:** Initial version
**Scope:** Production incident handling for the household Web app (Next.js / OpenNext / SST) and the Alexa Lambda.
**Audience:** On-call operator / incident responder.
**Related:** [Web Cognito authentication runbook](WEB_COGNITO_AUTH_RUNBOOK.md) · [Household identity design](HOUSEHOLD_IDENTITY_DESIGN.md) · [Alexa linked device verification](ALEXA_LINKED_DEVICE_VERIFICATION.md)

> **Why this exists.** A DORA baseline (2026-08, ecosystem measurement) found Deployment
> Frequency, Lead Time, and Change Failure Rate all at Elite, but **MTTR at ~98h (Low)** —
> recovery after a failed change is the weak link. The likely structural cause is the
> cross-region topology plus a **manual web deploy** (`npm run deploy`, no automated
> rollback). This runbook shortens recovery by making the "which procedure do I jump to"
> decision fast and pre-decided.

---

## 1. Architecture at a glance (recovery-relevant)

| Component | Where | Recovery note |
|-----------|-------|---------------|
| Web (Next.js 16, OpenNext/SST, CloudFront + Lambda + S3) | **ap-northeast-1** | Deploy is **manual** (`npm run deploy`). No automated rollback → redeploy the last-good commit. |
| DynamoDB `DrugAndOathRecords` (+ `veai-ben004-metrics`) | **us-east-1** | Cross-region: web in ap-northeast-1 reads/writes this table in us-east-1. |
| Alexa Skills Kit Lambda | **us-east-1** | Deployed via GitHub Actions `deploy-lambda` job (needs AWS secrets). |
| Auth | Cognito + household membership (PKCE) | Rollback path: `WEB_AUTH_MODE=mvp` — see auth runbook §Rollback. |
| Weekly report (AI) | Amazon Bedrock | Feature-flagged; failure is degraded, not data loss. |

**Key single points of failure:** the us-east-1 DynamoDB table (shared by Web + Alexa) and the manual web deploy step.

---

## 2. Severity classification

| Severity | Definition | Example | Target response |
|----------|-----------|---------|-----------------|
| **SEV1** | Loss or corruption of medication records | DynamoDB write failure/corruption on `DrugAndOathRecords` | Immediate |
| **SEV2** | Household cannot record or cannot sign in | Cross-region outage, Cognito lockout, web deploy broken, Alexa reminders not set | ≤ 1h |
| **SEV3** | Degraded but usable | Monthly PDF export fails, weekly AI report fails | ≤ 4h |
| **SEV4** | Minor | Cosmetic, delayed non-critical notification | Next working day |

> This app is **not a medical device** and does not decide whether medication should be
> taken. Even so, record loss (SEV1) and sign-in lockout (SEV2) are the highest-impact
> failures for the household and are prioritised accordingly.

---

## 3. First-response checklist (do this first, every incident)

1. **Classify** severity using §2.
2. **Locate blast radius** — Web only? Alexa only? Both? (Both → suspect the shared us-east-1 DynamoDB table.)
3. **Check the two SPOFs first:**
   - DynamoDB `DrugAndOathRecords` (us-east-1): throttles / errors?
   - Last web deploy: did a recent `npm run deploy` precede the incident? If yes → §4.4 redeploy last-good.
4. **Decide: stop the bleeding vs diagnose.** If a change caused it, **roll back / redeploy last-good first**, diagnose after. This is the main MTTR lever.
5. **Record a timeline** (detection time, actions, recovery time) for the postmortem — needed to move MTTR off "Low".

---

## 4. Scenarios and recovery

### 4.1 MP-01 — DynamoDB write failure (SEV1)
**Detect:** write errors / throttles on `DrugAndOathRecords` (us-east-1); user reports records not saving.
**Recover:**
1. Confirm region is **us-east-1** (a common misfire is querying ap-northeast-1).
2. Throttling → raise capacity / confirm on-demand; transient → retry.
3. Suspected corruption → restore via DynamoDB PITR to a pre-incident timestamp (SEV1: preserve the current table state before any destructive step).

### 4.2 MP-02 — Cross-region failure: Web (ap-northeast-1) cannot reach DynamoDB (us-east-1) (SEV2)
**Detect:** Web API 5xx while the table itself is healthy; errors reference cross-region access.
**Recover:**
1. Verify `DYNAMODB_REGION=us-east-1` and `DYNAMODB_TABLE_NAME=DrugAndOathRecords` in the deployed web env (`web/sst.config.ts`).
2. Check the server Lambda IAM policy still grants the table (GetItem/PutItem/DeleteItem/Query).
3. If a recent deploy changed either → **redeploy last-good** (§4.4).

### 4.3 MP-03 — Cognito household sign-in lockout (SEV2)
**Detect:** household cannot sign in; membership resolution fails.
**Recover:** follow **[WEB_COGNITO_AUTH_RUNBOOK.md](WEB_COGNITO_AUTH_RUNBOOK.md) §Rollback** — revert `WEB_AUTH_MODE` to `mvp` through a reviewed deployment. `MvpAccessCode` / `MvpSessionSecret` remain available during the rollback window. **Do not delete membership data** during an ordinary rollback.

### 4.4 MP-04 — Web deploy broken / bad release (SEV2) — *primary MTTR driver*
**Detect:** site errors immediately after `npm run deploy`.
**Recover (there is no automated rollback):**
1. Identify the last-good commit (last green before the failing change).
2. `git checkout <last-good-sha>` and `cd web && npm run deploy` to roll production back.
3. Fix forward on a branch; redeploy once CI is green.
> One-command helper: `scripts/redeploy-last-good.sh` finds the most recent main commit with green CI and prints the rollback plan (dry run by default). Add `--deploy` to actually roll production back, or `--sha <commit>` to target a specific known-good commit.

### 4.5 MP-05 — Alexa Lambda failure (SEV2/SEV3)
**Detect:** reminders not set / voice records fail; `deploy-lambda` job failing.
**Recover:**
1. If secrets are missing the deploy is skipped by design (see the job's warning) — supply secrets, re-run.
2. Re-deploy a known-good Lambda artifact. Linked-device rollout can be disabled as a rollback without deleting membership data (see Alexa verification doc).

### 4.6 MP-06 — Weekly AI report failure (SEV3)
**Detect:** Bedrock errors / empty weekly report.
**Recover:** disable the report feature flag (degraded mode) — no data loss. Aligns with the AI-governance dual-gate: the AI path stays behind an explicit flag.

### 4.7 MP-07 — Monthly PDF export failure (SEV3)
**Detect:** `GET /api/records/pdf` errors. Data is intact; export is a read path. Fix forward; not a rollback trigger.

---

## 5. After recovery

1. Confirm the household can record and sign in (smoke test the record + settings paths).
2. Write a blameless postmortem: timeline, root cause, and **the specific MTTR contributor** (e.g. "no scripted rollback", "wrong region checked first").
3. Feed one concrete improvement back (e.g. redeploy-last-good script, region check in first-response) so measured MTTR drops on the next DORA run.

---

## Publication note

This runbook contains only sanitised architecture (regions, table/flag names already
present in tracked source) — **no household data, credentials, access codes, or records**,
per [PUBLICATION_POLICY.md](PUBLICATION_POLICY.md).
