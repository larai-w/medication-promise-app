# GitHub Project And Automation Plan

## Current GitHub Status

Checked on 2026-07-06:

- Repository: `larai-w/medication-promise-app`
- Visibility: public
- Issues: enabled
- Projects: enabled
- GitHub Actions workflows: none before adding `.github/workflows/ci.yml`
- Recent workflow runs: none before adding CI

## What Is Now Automated

The repository has a basic GitHub Actions CI workflow:

- Runs on pull requests.
- Runs on pushes to `main`.
- Web job:
  - `npm ci`
  - `npm run lint`
  - `npm run build`
- Alexa job:
  - `npm ci`
  - `node --check index.mjs`
  - `npm run zip`
  - uploads `alexa/skill.zip` as a workflow artifact.

This is CI, not full CD. CD should be added after the production deployment target and required secrets are confirmed.

## Recommended GitHub Project Setup

Create one GitHub Project for the repository:

- Name: `Drug and Oath`
- Views:
  - Board by `Status`
  - Table by `Priority`
  - Roadmap by iteration or milestone
- Fields:
  - `Status`: Backlog, Ready, In progress, In review, Done
  - `Priority`: P0, P1, P2, P3
  - `Area`: web, alexa, data, ci-cd, docs
  - `Size`: S, M, L
  - `Target`: MVP, v1, later

Recommended labels:

- `story`
- `task`
- `bug`
- `web`
- `alexa`
- `data`
- `ci-cd`
- `docs`
- `P0`
- `P1`
- `P2`
- `P3`

## User Story Workflow

Use `.github/ISSUE_TEMPLATE/user_story.yml` for product work.

Good story shape:

```text
As a [user/persona],
I want [capability],
so that [outcome].
```

Acceptance criteria should be concrete and testable:

```text
- [ ] Given ...
- [ ] When ...
- [ ] Then ...
```

## Initial Story Backlog

Suggested first stories to create:

1. `[Story] Caregiver can review today's medication status`
2. `[Story] Caregiver can edit mistaken medication records`
3. `[Story] Caregiver can export a monthly medication PDF`
4. `[Story] Patient can record medication by voice through Alexa`
5. `[Story] Patient can set daily medication reminders through Alexa`
6. `[Story] Caregiver can identify missing medication times in monthly view`
7. `[Story] Maintainer can validate app changes with CI`
8. `[Story] Maintainer can deploy web updates safely`
9. `[Story] Maintainer can deploy Alexa Lambda safely`

## What Can Be Automated Next

High-value automation:

1. Auto-add every new issue and PR to the GitHub Project.
2. Auto-set project status:
   - new issue -> Backlog
   - issue assigned or moved manually -> Ready/In progress
   - PR opened -> In review
   - PR merged and linked issue closed -> Done
3. Auto-label by changed path:
   - `web/**` -> `web`
   - `alexa/**` -> `alexa`
   - `.github/**` -> `ci-cd`
   - `docs/**` -> `docs`
4. Add branch protection for `main`:
   - require PR
   - require CI checks
   - block direct pushes
5. Add Dependabot for npm dependency updates.
6. Add release automation:
   - Web deployment after CI passes on `main`
   - Alexa zip artifact or Lambda deployment after CI passes on `main`

## Automation Requirements

GitHub Project creation and Project item field automation require authenticated GitHub operations.

Options:

- Install `gh` locally and authenticate with `gh auth login`.
- Use a fine-grained GitHub token with repo and project permissions.
- Use GitHub's built-in Project workflows manually for simple status automation.

Because this environment does not currently have `gh` installed, Project creation could not be performed locally during this update.

