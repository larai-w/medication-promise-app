# Contributing to Medication Promise

Thanks for contributing. This repository has both web and Alexa components, so please read `README.md` and project notes before making changes.

## Required public-boundary rule

- Do not commit unpublished business strategy, pilot data, pricing/sales notes, credentials, or personal/facility-identifying information.
- Internal handover or growth notes belong in `larai-w/veai-private`, not this public repo.
- Never commit unpublished Alexa/ASK model assets or private interaction packages.

## Before contributing

- Open an issue for non-trivial changes with expected outcome and acceptance criteria.
- Keep changes small and reviewable.
- Include a short note about impacted component (`web` or `alexa`).

## How to contribute

### Issue
- Include steps to reproduce and exact behavior expected.
- Attach screenshots or logs only when they contain no private data.

### Pull Request
1. Reference the issue.
2. Explain what changed and what evidence was collected.
3. Add/adjust tests and docs where behavior changed.

## Run it locally

There are **two components with separate `package.json` files.** Work inside the
one you are changing; commands run from the repo root will not find the scripts.

```bash
cd web && npm ci && npm run dev    # http://localhost:3000
```

`alexa` is a Lambda handler with no server to start — you exercise it with
`cd alexa && npm ci && npm test`.

Neither component needs an AWS or Alexa account to run its tests. **No test
touches real medication records.**

## Minimum checks

```bash
git status --short --ignored
```

Then run what CI runs for the component you touched:

```bash
cd web   && npm ci && npm test && npm run lint && npm run build
cd alexa && npm ci && npm test && npm run zip
```

The same list is in **Local Verification** in `README.md`.

If your change is docs-only, make sure it stays within publication policy.

## License

By contributing, you agree to license your work under this repository's existing license.
