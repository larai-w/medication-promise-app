# Public Repository Publication Policy

This repository is public. Treat every tracked file, commit, issue, pull request,
workflow log, and artifact as publicly readable.

## Never Publish

- Internal product strategy, growth plans, commercial plans, and unpublished roadmaps.
- Agent handoffs, session logs, working notes, task lists, and human-only instructions.
- Draft blog posts or unpublished research notes.
- Household-specific medication names, schedules, identifiers, access details, or care context.
- Secrets, credentials, tokens, access codes, account-linking data, or production records.
- Alexa/ASK interaction models, skill packages, developer-console exports, and
  `ask-resources.json`, even when they do not contain a conventional secret.
- Trained AI/ML model weights, checkpoints, and serialised model artifacts.

Keep these files only in ignored local paths such as `docs/private/` or an external
private workspace. Do not force-add them with `git add -f`.

## Allowed Public Evidence

- Application source code and automated tests after privacy review.
- Sanitised architecture documentation without household or credential data.
- Generalised product-management case studies, acceptance criteria, and release gates.
- Published blog links and portfolio material already approved for public use.

## Required Check Before Commit Or Push

1. Run `git status --short --ignored`.
2. Review every staged path with `git diff --cached --name-status`.
3. Confirm no ignored file was force-added and no private value appears in a public file.
4. If uncertain, do not commit or push until the file is reviewed by the repository owner.

CI runs `node scripts/check-publication-boundary.mjs` (required check `private-files`)
and rejects private paths. The same script also runs locally as a pre-commit hook —
enable it once per clone with `git config core.hooksPath .githooks`. The guard blocks
both exact known names and generalized keyword patterns (e.g. `*STRATEGY*`, `*ROADMAP*`,
`*GROWTH*`, `*HANDOFF*`, `*PRICING*`, `SESSION_NOTE*`, `WORKLOG*`, `BLOG_DRAFT*` markdown),
so renamed or newly named internal notes are caught too. It supplements review; it does
not make a genuinely new kind of private file safe to publish.

Removing a file in a later commit does not remove it from Git history. If private
material was previously pushed, assess whether repository history must be rewritten
and whether any exposed credential or access code must be rotated.
