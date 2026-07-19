# Product Management Case Study: Medication Promise

## Executive Summary

Medication Promise began as a working household Alexa routine: five reminders each day, a short voice phrase after medication, and a shared record visible on the web. The product-management challenge was not to maximise feature output. It was to preserve a useful routine while identifying the gap between a home prototype and a service that could responsibly support other households.

The delivery approach combined user-centred discovery, outcome-based prioritisation, incremental releases, explicit acceptance criteria, automated verification, and risk-led scope control. The result is a working single-household MVP with a documented path to an invitation-only beta.

## Problem And Users

Primary problem:

> Families repeatedly carry the cognitive work of remembering whether a scheduled medication was taken. Recording must be easier than relying on memory, without making medical decisions on the user's behalf.

Primary personas:

| Persona | Need | Constraint |
| --- | --- | --- |
| Person taking medication | Record a completed medication timing without navigating a phone | Voice recognition must be short and forgiving |
| Family caregiver | See today's state and correct mistakes quickly | The workflow competes with other care work |
| Maintainer | Change the system without losing household records or reminders | Production state already existed before formalisation |
| Future beta household | Use the product without seeing another household's records | Identity and tenant isolation are not yet implemented |

Facility staff were explored in the original roadmap, then removed from the near-term scope. A single-household prototype does not provide the identity, roles, auditability, or operational controls required for facility use.

## Product Outcomes

The MVP was organised around four outcomes rather than a feature inventory:

1. **Lower recording effort:** one tap or one short voice interaction after medication.
2. **Improve shared awareness:** today's status and recent history are visible to the household.
3. **Support reflection:** a monthly view and PDF provide material for discussion, not clinical advice.
4. **Reduce unsafe ambiguity:** the product states what it can and cannot guarantee.

## Incremental Delivery

### Increment 1: Working household loop

- Five daily timing categories.
- Web and Alexa writing to the same DynamoDB records.
- Recent and monthly history.
- Monthly PDF output with Japanese font support.

### Increment 2: Reliability and delivery

- Automated Web and Alexa checks in GitHub Actions.
- Alexa Lambda deployment after successful checks.
- Migration from an unsupported Amplify SSR path to OpenNext and SST.
- Explicit cross-region DynamoDB configuration and corrected AWS credential handling.

### Increment 3: Safety retrofit

- Shared access-code gate with signed secure cookies.
- Authentication checks at both page and API boundaries.
- Same-origin and input validation controls.
- Safer Alexa wording without a universal hard-coded medication instruction.
- Privacy and terms pages, `noindex`, and crawler blocking.
- Explicit single-household scope.

### Increment 4: Household configuration

- Protected medication-name and five-time settings screen.
- Settings stored in DynamoDB.
- Alexa reads the current settings when reminders are recreated.
- ASK CLI/SMAPI automation for the Japanese interaction model and manifest.

## Prioritisation

Work was prioritised using a simple risk-adjusted sequence:

| Priority | Decision test | Examples |
| --- | --- | --- |
| P0 | Could this expose data, break a live household routine, or misrepresent safety? | Access protection, unsafe copy, region/data correctness |
| P1 | Does this make the core record-remind-review loop reliable? | Error handling, tests, settings, deployment |
| P2 | Does this improve usability without changing the safety boundary? | UI polish, reporting improvements |
| P3 | Is this valuable only after identity and validation exist? | Facility dashboard, broad public promotion |

This ordering deliberately placed tenant identity ahead of growth features. Adding charts or notifications would not solve the central public-release risk: every request still resolves to one household identity.

## Decisions And Trade-offs

### Preserve existing data instead of normalising infrastructure

The Web infrastructure runs in Tokyo while the existing Alexa Lambda and DynamoDB table are in `us-east-1`. The team kept an explicit cross-region connection rather than migrating live household data during the MVP safety work.

### Change hosting instead of downgrading the application

AWS Amplify's managed SSR path did not support the project's Next.js version. OpenNext and SST replaced the host while preserving application behaviour and API routes.

### Treat an access code as a temporary gate

The access code materially improved the private household deployment but was not described as multi-user authentication. The next release gate remains per-household identity and data isolation.

### Keep destructive reminder testing human-controlled

Reminder recreation deletes reminders previously created by the skill. Automated launch simulations and unit tests were used, while the final live reminder check remained a deliberate physical-device acceptance test.

### Make AI delegation visible

AI agents assisted implementation and documentation. The maintainer retained responsibility for scope, acceptance criteria, review, tests, production checks, and release decisions. Future delegated issues use the `process:ai-assisted` label rather than implying autonomous acceptance.

## Technical PM And Cloud Architecture Evidence

The PM role in this project included architecture-level decisions because product scope, data risk, cost, and operability were tightly coupled.

| Decision | Product constraint | Technical response | PM evidence |
| --- | --- | --- | --- |
| Preserve the live household record | Existing data and Alexa behaviour could not be treated as disposable test state | Keep DynamoDB/Alexa in `us-east-1`; make the Web runtime's cross-region dependency explicit | Continuity risk was prioritised over infrastructure uniformity |
| Recover the Web deployment | Amplify managed SSR did not support the chosen Next.js version | Move to OpenNext/SST on CloudFront, Lambda, and S3 | A failed path was replaced without downgrading the product or hiding the failure |
| Remove credential ambiguity | Lambda temporary credentials were broken by manual partial credential injection | Restore the AWS SDK default credential chain and least-privilege runtime role | Security and operability were handled as delivery outcomes |
| Separate public content from the app | The main site and private household app have different access and release needs | Keep product content on `veai.jp`; deploy the application at `kusuri.veai.jp` | Brand, cookie boundary, blast radius, and deployment ownership were considered together |
| Delay multi-household promotion | A fixed household key cannot provide tenant isolation | Make identity, partitioning, account linking, and negative isolation tests the next release gate | Growth was subordinated to a verifiable data boundary |

This is the profile the repository is intended to evidence: a Technical Product Manager who can move between user outcomes, architecture diagrams, cloud failure modes, delivery controls, and release decisions without treating them as separate conversations.

## Evidence Model

The public evidence chain is:

```text
Product outcome
  -> user story and acceptance criteria
  -> prioritised issue and milestone
  -> implementation commit / pull request
  -> automated verification
  -> production or device acceptance evidence
  -> documented limitation or next decision
```

Historical issues carry `evidence:backfill` and link to the original commits and dated session notes. New issues are created before implementation and closed by linked pull requests or verified completion.

## Measures For The Limited Beta

The next phase should not use downloads or page views as its primary success measure. Proposed beta measures are:

- Percentage of scheduled timings with a record, reported descriptively rather than as medical adherence.
- Number of caregiver confirmation checks required per day.
- Percentage of records created by voice versus Web.
- Record corrections and duplicate attempts as usability signals.
- Households still using the core loop after two weeks.
- Data-isolation incidents, target: zero.
- Safety or support events, with a documented correction path.

No impact on health outcomes should be claimed from this MVP.

## Research And Doctoral Study Potential

The product can support research questions if the data collection is consented, minimised, and separated from medical claims. Candidate questions include:

- Does a voice-first logging option reduce the interaction cost of maintaining a household record compared with Web-only logging?
- Which scheduled times produce the most corrections, delayed records, or caregiver confirmation checks?
- How does the division of labour between reminders, self-report, and family review change over a two-week period?
- Which parts of the workflow can be automated safely, and where does human confirmation remain necessary?
- How should a care-support prototype communicate uncertainty so that users do not overestimate its reliability?

A doctoral proposal would require ethics review, informed consent, a defensible study design, and a clear distinction between product telemetry, self-reported burden, and health outcomes. The current household MVP is a source of research questions, not clinical evidence.

## Current Release Decision

The product is suitable for continued use in the existing household and for development storytelling. It is not ready for unrestricted public use. The next go/no-go gate requires per-household identity, Alexa account linking, isolation tests, deletion/recovery operations, and a small invitation-only validation period.

This decision is the clearest demonstration of the PM approach used here: progress is measured by validated capability and controlled risk, not by how many features can be called finished.

The first release-gate design for that next phase is documented in
[Household identity and data isolation design](HOUSEHOLD_IDENTITY_DESIGN.md).
