# GitHub Project And Agile Portfolio Automation

## Purpose

The public GitHub delivery trail should show how Medication Promise was framed, prioritised, verified, and constrained as a HealthTech product. It must remain honest about chronology: the detailed roadmap and session notes existed before the GitHub issue portfolio.

Completed work is therefore labelled `evidence:backfill` and linked to contemporaneous commits. New work is managed live through GitHub Issues, pull requests, and the Project board.

## Portfolio Structure

Project title: `Medication Promise — Agile Delivery`

Live project: [github.com/users/larai-w/projects/9](https://github.com/users/larai-w/projects/9)

Recommended views:

- `Delivery board`: grouped by Status.
- `Priorities`: table grouped by Priority.
- `Roadmap`: grouped by Milestone or Target.
- `HealthTech risk`: filter `area:safety`.
- `AI-assisted work`: filter `process:ai-assisted`.

Fields:

| Field | Options |
| --- | --- |
| Status | Todo, In Progress, Done |
| Priority | P0, P1, P2, P3 |
| Area | Web, Alexa, Data, Delivery, Safety, Docs |
| Size | S, M, L, XL |
| Target | Household MVP, Limited Beta, Public Readiness |

Milestones:

1. `Household MVP — Evidence Backfill`
2. `Limited Beta — Identity and Validation`
3. `Public Readiness — Safety and Operations`

## Bootstrap

The script is idempotent by issue title and milestone title.

```bash
node scripts/bootstrap-github-portfolio.mjs --dry-run
node scripts/bootstrap-github-portfolio.mjs
```

It creates:

- Portfolio labels, including `evidence:backfill` and `process:ai-assisted`.
- Three outcome milestones.
- Nine completed household-MVP stories with commit evidence.
- Six open stories for beta and public readiness.

After the Project exists, add all issues:

```bash
node scripts/bootstrap-github-portfolio.mjs --project <PROJECT_NUMBER>
```

The same command synchronises Priority, Area, Size, and Target from issue labels,
milestones, and the evidence-backed story estimates.

GitHub CLI requires the `project` scope for Project commands:

```bash
gh auth refresh -h github.com -s project
```

## Repository Automation

`.github/workflows/add-to-project.yml` adds newly opened/reopened issues and pull requests to the Project. It remains skipped until the repository variable is configured:

- Variable `PROJECT_URL`: full GitHub Project URL.
- Secret `PROJECTS_TOKEN`: token with write access to the user Project and read access to repository issues/pull requests.

Use a dedicated, expiring personal access token for this workflow. Do not reuse the
interactive `gh` login token, commit the token, or paste it into an issue, pull request,
chat, or documentation. Enter it directly as the repository secret
`PROJECTS_TOKEN`. GitHub's documented classic-token scopes for user Project
automation are `project` and `repo`.

`.github/workflows/label-pr.yml` uses `.github/labeler.yml` to label pull requests by changed path.

The user-story, task, bug, and pull-request templates require acceptance evidence and HealthTech risk review.

## Live Operating Rules

1. Create the English user story before implementation.
2. Put technical subtasks under the outcome story or link separate task issues.
3. Keep the story in Todo until the Definition of Ready in `docs/AGILE_DELIVERY.md` is satisfied; move it to In Progress when delivery starts.
4. Link the pull request with `Closes #N`.
5. Record automated and device/production evidence before acceptance.
6. Use `process:ai-assisted` when AI materially contributed under human review.
7. Do not close safety or identity stories based only on code existing locally.

## Portfolio Integrity

Do not claim that:

- Historical issue timestamps represent the original planning dates.
- A solo project used every Scrum role or ceremony.
- A household access code is multi-user authentication.
- Automated tests verify physical Echo behaviour.
- Medication logs demonstrate clinical outcomes.

The portfolio is stronger when these boundaries are visible. They show product judgement, not missing confidence.
