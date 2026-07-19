# Agile Delivery And Governance

Medication Promise uses an agile, evidence-led delivery process. It does not claim a full Scrum implementation: there is no standing cross-functional Scrum team, and historical work was not consistently tracked in GitHub Issues. The useful practices are retained without inventing ceremonies that did not occur.

## Working Method

- Deliver the smallest end-to-end increment that can be verified in the household workflow.
- Write user stories around an observable outcome, not an implementation component.
- Add testable acceptance criteria before new implementation begins.
- Prioritise safety, data boundaries, and continuity of the live routine before growth work.
- Keep architecture decisions and failed approaches in dated session notes.
- Use automated checks for repeatable verification and human acceptance for physical-device or destructive state changes.
- Review the outcome and limitations before deciding the next increment.

## Story Format

```text
As a [specific user],
I want [observable capability],
so that [user or operational outcome].
```

Each issue also records:

- Context and evidence.
- Acceptance criteria in Given/When/Then or testable checklist form.
- Priority and milestone.
- Safety, privacy, and operational risks.
- Non-goals that protect the current scope.
- Verification evidence when complete.

## Definition Of Ready

A story is Ready when:

- The user and outcome are clear.
- Acceptance criteria can be independently checked.
- Dependencies and data-boundary effects are known.
- Medical or care-related wording has been reviewed for overclaiming.
- The issue is small enough to complete as one coherent increment, or has been split.

## Definition Of Done

A story is Done when:

- Acceptance criteria are met and checked in the issue or pull request.
- Relevant automated tests, lint, and builds pass.
- A reviewer or maintainer has examined the change.
- Production verification is completed when the story changes deployed behaviour.
- Physical Echo/device checks are recorded when automation cannot verify the real interaction.
- Documentation and operational instructions reflect the released behaviour.
- Remaining limitations are explicit.

## Workflow

```text
Backlog -> Ready -> In progress -> In review -> Done
                         |              |
                         +-> Blocked <--+
```

`Blocked` is used for a genuine external dependency, such as device permission or account authorisation, not merely for difficult work.

## AI-Assisted Delivery

AI assistance is governed as delegated work:

1. The maintainer defines the issue, acceptance criteria, constraints, and files in scope.
2. An agent may implement or analyse the bounded task.
3. The maintainer reviews the diff and verifies the acceptance criteria.
4. CI and production/device checks provide additional evidence.
5. Only the maintainer accepts, commits, deploys, or closes the story.

Issues materially implemented with AI assistance use `process:ai-assisted`. This records the delivery model without transferring accountability to the tool.

## Historical Evidence

The original roadmap and session notes pre-date the public GitHub backlog. Completed stories are therefore backfilled with:

- `evidence:backfill` label.
- The date the issue was reconstructed.
- Links to contemporaneous documents and commits.
- Checked acceptance criteria only where repository or production evidence exists.

This preserves a useful portfolio view without implying that the issue timestamps are the original planning dates.
