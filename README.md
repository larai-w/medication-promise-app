# Medication Promise (おくすりの約束) — Medication Logging for Older Adults

A dual-interface medication logging tool: tap buttons on a Next.js web app or say
"Alexa, open Medication Promise" to record a dose by voice. Both interfaces write to
the same DynamoDB table, and the web app generates a monthly PDF report.
Designed for single-household use with a fixed user ID.

**Status:** In development · [https://veai.jp/apps/medication-promise/](https://veai.jp/apps/medication-promise/)

---

## Status & Limitations

| State | Detail |
|---|---|
| Working | Alexa Skill — voice recording for 5 timings (朝/昼/晩/夜8時/夜9時) stored in DynamoDB |
| Working | Alexa Reminders API — daily reminders at 08:00 / 12:00 / 18:00 / 20:00 / 21:00 JST, configurable via `REMINDER_SCHEDULE_JSON` |
| Working | Web app — view today's records, quick-record button, manual add/edit/delete modal, recent 6-day list |
| Working | Web monthly screen — month table, record count, unique-day count |
| Working | Web PDF export — `/api/records/pdf?month=YYYY-MM` via `@react-pdf/renderer` with NotoSansJP font |
| Working | MVP access gate — shared access code required; URL alone is not sufficient |
| Limitation | Single user (`USER_ID=default-user`); shared access code is not per-household isolation |
| Limitation | No automated test suite yet (`PROJECT_HANDOFF.md` documents this gap explicitly) |
| Limitation | Alexa interaction model requires manual deployment via Alexa Developer Console |
| Future | Per-user / per-household authentication, automated tests, CI/CD for Alexa Lambda |

---

## Architecture

```mermaid
graph TD
    subgraph "Voice Interface"
        Echo[Amazon Echo] -->|Intent JSON| ASK[Alexa Skills Kit]
        ASK -->|RecordXxxIntent / SetRemindersIntent| AlexaLambda[Lambda\ndrug-and-oath-alexa\nNode.js ESM\nus-east-1]
        AlexaLambda -->|Reminders API| AlexaAPI[Alexa Reminders API]
    end

    subgraph "Web Interface (ap-northeast-1)"
        Browser[Browser] -->|HTTPS| CF[CloudFront\ndhr30db6tf09e.cloudfront.net]
        CF --> NextLambda[Lambda@Edge / Regional Lambda\nNext.js 16 via OpenNext + SST]
        NextLambda -->|API routes| NextAPI[/api/records\n/api/records/pdf]
    end

    subgraph "Data — us-east-1"
        AlexaLambda -->|PutItem source=alexa| DDB[(DynamoDB\nDrugAndOathRecords)]
        NextAPI -->|Query / PutItem / UpdateItem / DeleteItem| DDB
    end
```

**DynamoDB key design:**

| Pattern | PK | SK |
|---|---|---|
| Medication record | `USER#<userId>` | `RECORD#YYYY-MM-DDTHH:mm:00#<uuid>` |

Note: Alexa Lambda (`us-east-1`) and web server Lambda (`ap-northeast-1`) both write to
the same DynamoDB table in `us-east-1` via cross-region access.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web framework | Next.js 16.2.9, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| PDF generation | `@react-pdf/renderer` v4, NotoSansJP-Regular.ttf |
| Database client | `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` v3 |
| Web deployment | SST v4 + OpenNext AWS (`@opennextjs/aws` v4) → CloudFront + Lambda |
| Alexa Lambda | Node.js ESM, `ask-sdk-core` v2, `@aws-sdk/client-dynamodb` v3 |
| IaC | SST v4 (`sst.config.ts`) for web; Alexa Lambda is managed manually |

---

## Web API Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/records?date=YYYY-MM-DD` | Records for one day |
| `GET` | `/api/records?from=YYYY-MM-DD&to=YYYY-MM-DD` | Records for a date range |
| `POST` | `/api/records` | Create a record |
| `PUT` | `/api/records/[id]` | Update a record (id = base64url-encoded SK) |
| `DELETE` | `/api/records/[id]` | Delete a record |
| `GET` | `/api/records/pdf?month=YYYY-MM` | Monthly PDF export |

---

## Alexa Skill Intents

| Intent | Timing recorded |
|---|---|
| `RecordMorningIntent` | 朝 (morning) |
| `RecordLunchIntent` | 昼 (noon) |
| `RecordDinnerIntent` | 晩 (evening) |
| `RecordNightEightIntent` | 夜8時 (20:00) |
| `RecordNightNineIntent` | 夜9時 (21:00) |
| `SetRemindersIntent` | Sets / replaces all 5 daily reminders via Alexa Reminders API |
| `RecordUnknownIntent` | Fallback: asks which timing was taken |

`SetRemindersIntent` deletes all existing reminders for the skill before creating
the five new daily ones. Requires `alexa::alerts:reminders:skill:readwrite` permission
granted in the Alexa app by the user.

---

## Testing

No automated test suite is currently present (documented in `docs/PROJECT_HANDOFF.md`).

Alexa Lambda has been structured for testability: `createHandler()` accepts injectable
`recordMedicationFn` and `fetchFn` dependencies, allowing unit tests to mock DynamoDB
and the Reminders API without hitting AWS.

```bash
# Alexa — run node built-in test runner (no tests defined yet)
cd alexa && npm test

# Web — ESLint
cd web && npm run lint

# Web — build check
cd web && npm run build
```

---

## Local Development

### Web

```bash
cd web
npm install
# Create web/.env.local with:
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# DYNAMODB_REGION=us-east-1
# DYNAMODB_TABLE_NAME=DrugAndOathRecords
# USER_ID=default-user
# MVP_ACCESS_GATE=disabled   # skip access gate locally
npm run dev    # http://localhost:3000
```

### Alexa Lambda

```bash
cd alexa
npm install
npm run zip    # produces skill.zip for manual Lambda upload
```

---

## Deployment

### Web

```bash
cd web
npm run deploy   # sst deploy --stage production
```

SST provisions: CloudFront distribution, regional Lambda (ap-northeast-1) via OpenNext,
S3 asset bucket. DynamoDB table (`DrugAndOathRecords`, us-east-1) is managed separately
and referenced by ARN in `sst.config.ts`.

### Alexa Lambda

Upload `skill.zip` (produced by `npm run zip`) to the existing Lambda function
`DrugAndOathFunction` in us-east-1 via the AWS Management Console or CLI.
Then update the interaction model in the Alexa Developer Console manually.

---

## Environment Variables

| Variable | Used by | Default | Description |
|---|---|---|---|
| `DYNAMODB_REGION` | web, alexa | `us-east-1` | DynamoDB table region |
| `DYNAMODB_TABLE_NAME` | web, alexa | `DrugAndOathRecords` | Table name |
| `USER_ID` | web, alexa | `default-user` | Fixed user identifier |
| `MEDICATION_NAME` | alexa | `""` | Name spoken in reminder text |
| `REMINDER_SCHEDULE_JSON` | alexa | (5 hardcoded times) | Override reminder schedule |
| `MVP_ACCESS_GATE` | web | `enabled` | Set to `disabled` for local dev |
| `MVP_ACCESS_CODE` | web | (SST Secret) | Shared access code |
| `MVP_SESSION_SECRET` | web | (SST Secret) | Session signing secret |

---

## 日本語

「おくすりの約束」は、高齢者の服薬を記録する2チャンネルツールです。Web アプリのボタンタップ、
または Alexa への音声入力（「朝の薬を飲んだ」など）で、朝・昼・晩・夜8時・夜9時の5タイミングを
同一の DynamoDB テーブルに記録します。Web アプリでは月次 PDF を出力できます。
Alexa Reminders API を利用した毎日のリマインダー機能も実装済みです（設定反映は手動）。
現在は1世帯固定の MVP 段階で、マルチユーザー対応は将来の課題です。

---

## License

MIT License

---

Part of the [VEAI LAB.](https://veai.jp) ecosystem · [Product page](https://veai.jp/apps/medication-promise/)
