# Project Handoff: Drug and Oath

Last updated: 2026-07-06

## Current Status

Drug and Oath is a medication tracking project with two parts:

- `web/`: Next.js app for viewing, manually recording, editing, deleting, and exporting medication records.
- `alexa/`: Alexa Skill Lambda for recording medication by voice into the same DynamoDB table.

The actual Git repository is `drug-and-oath/`. The parent directory is only the workspace wrapper.

Current Git state at this update:

- Branch has two commits: initial commit and `chore: remove duplicate layout and page files`.
- Uncommitted changes exist in:
  - `alexa/index.mjs`
  - `alexa/interaction-model.json`
- GitHub Actions CI has been added locally in `.github/workflows/ci.yml`.
- GitHub Issue Forms have been added locally for user stories and tasks.
- Ignored local artifacts include `node_modules/`, `web/.next/`, `web/.env.local`, `web/next-env.d.ts`, `web/tsconfig.tsbuildinfo`, and `.DS_Store`.

## Implemented Features

### Web App

Main screen:

- Route: `/`
- Entry: `web/src/app/page.tsx`
- Component: `web/src/components/MainScreen.tsx`
- Shows today's five medication timings: `朝`, `昼`, `晩`, `夜8時`, `夜9時`.
- Quick record button creates a manual record with default times from `web/src/lib/constants.ts`.
- Existing record can be expanded, edited, or deleted.
- Manual add/edit modal supports date, timing, time, and optional notes.
- Recent list shows the previous six days.

Monthly screen:

- Route: `/monthly`
- Entry: `web/src/app/monthly/page.tsx`
- Component: `web/src/components/MonthlyScreen.tsx`
- Shows a month table by date and timing.
- Supports previous/next month navigation.
- Shows record count and unique medication day count.
- Downloads monthly PDF through `/api/records/pdf?month=YYYY-MM`.

API routes:

- `GET /api/records?date=YYYY-MM-DD`
- `GET /api/records?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/records`
- `PUT /api/records/[id]`
- `DELETE /api/records/[id]`
- `GET /api/records/pdf?month=YYYY-MM`

Data layer:

- DynamoDB helper: `web/src/lib/dynamodb.ts`
- Table default: `DrugAndOathRecords`
- User default: `default-user`
- PK format: `USER#${USER_ID}`
- SK format: `RECORD#YYYY-MM-DDTHH:mm:00#uuid`
- API record IDs are base64url-encoded SK values.

PDF:

- Document component: `web/src/lib/MedPdfDocument.tsx`
- Uses `@react-pdf/renderer`.
- Japanese font file: `web/public/fonts/NotoSansJP-Regular.ttf`.

### Alexa Skill

Core files:

- Lambda handler: `alexa/index.mjs`
- DynamoDB helper: `alexa/dynamodb.mjs`
- Interaction model: `alexa/interaction-model.json`

Implemented voice record intents:

- `RecordMorningIntent` -> `朝`
- `RecordLunchIntent` -> `昼`
- `RecordDinnerIntent` -> `晩`
- `RecordNightEightIntent` -> `夜8時`
- `RecordNightNineIntent` -> `夜9時`
- `RecordUnknownIntent` asks which medication timing was taken.

Night 9 PM behavior:

- `夜9時` returns a special reassuring message about sleeping without calling the nurse if there is no problem.

Uncommitted Alexa work currently adds:

- `SetRemindersIntent` with Japanese sample phrases.
- Alexa Reminders API integration in `alexa/index.mjs`.
- Daily reminder schedule at 08:00, 12:00, 18:00, 20:00, and 21:00 JST.
- Logic to delete existing skill reminders before creating new daily reminders.
- Permission prompt for `alexa::alerts:reminders:skill:readwrite` when reminder permission is missing.

## Environment And Commands

Run commands from the actual repository:

```bash
cd drug-and-oath
```

Web:

```bash
cd web
npm run dev
npm run build
npm run lint
```

Alexa:

```bash
cd alexa
npm run zip
```

Environment variables used by web and Alexa:

- `AWS_REGION`, default `ap-northeast-1`
- `DYNAMODB_TABLE_NAME`, default `DrugAndOathRecords`
- `USER_ID`, default `default-user`
- For local web AWS access: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`

Do not commit `web/.env.local`.

## Known Gaps And Risks

- No automated tests are present yet.
- `alexa/index.mjs` duplicates DynamoDB recording logic that also exists in `alexa/dynamodb.mjs`; it currently does not import `recordMedication` from the helper.
- Reminder setup deletes all existing reminders returned by the skill before recreating the five daily reminders. Confirm this is acceptable before production use.
- Alexa Reminders API requires the skill permission to be configured in the Alexa developer console in addition to the runtime permission card.
- Web UI uses `confirm()` for deletion and has no explicit API error handling in the client.
- Web app is configured for Next.js 16. Existing `web/AGENTS.md` says to read `node_modules/next/dist/docs/` before changing Next.js-specific code.

## Suggested Next Steps

1. Finish and test the Alexa reminder change.
2. Verify the Alexa developer console has reminders permission enabled.
3. Deploy/update the Alexa interaction model and Lambda package.
4. Run `npm run lint` and `npm run build` in `web/`.
5. Consider consolidating Alexa DynamoDB logic into `alexa/dynamodb.mjs`.
6. Add minimal tests or smoke scripts for API routes and the Alexa handler.
7. Push `.github/workflows/ci.yml` so GitHub Actions starts running on PRs and pushes to `main`.
8. Create the GitHub Project described in `docs/PROJECT_AUTOMATION.md`.

## Quick Resume Checklist For Agents

1. Start in `drug-and-oath/`, not the workspace parent.
2. Read this file first.
3. Run `git status --short`.
4. Inspect uncommitted diffs before editing:

```bash
git diff -- alexa/index.mjs alexa/interaction-model.json
```

5. Preserve local ignored files and secrets.
6. For Next.js code, read the relevant Next 16 docs in `web/node_modules/next/dist/docs/` before changing framework-specific APIs.
