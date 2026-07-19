# Agent Notes

When available in the owner's private workspace, start every session by reading:

- `docs/PROJECT_HANDOFF.md`

This handoff is intentionally ignored and is not part of the public repository.

Orchestration: the main session (Fable) plans strategy and tasks, then delegates
implementation to the subagents defined in `.claude/agents/` — `implementer`
(Sonnet, routine work) and `senior-implementer` (Opus, complex/high-risk work).
See `docs/AGENT_WORKFLOW.md` for the full workflow.

This repository contains:

- `web/`: Next.js medication tracking app.
- `alexa/`: Alexa Skill Lambda for medication recording.

Important:

- The parent directory is only a workspace wrapper; this directory is the Git repository.
- Do not commit secrets or ignored local artifacts.
- Run `git status --short` before editing.
- Existing uncommitted Alexa changes may be intentional; inspect diffs before modifying them.
- Read `docs/PUBLICATION_POLICY.md` before any commit or push.
- Never add internal strategy, growth, handoff, session, task, or draft notes to Git.
- Never add Alexa/ASK interaction models, skill packages, or `ask-resources.json` to Git.
- Before committing, run `git status --short --ignored` and verify that private material remains ignored.
