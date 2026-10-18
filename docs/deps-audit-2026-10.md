# Dependency audit — 2026-10

Snapshot taken on 2026-10-17 against `main` at `1dcb772`, Node 22.22 / npm 10.9.4,
after a clean `npm ci` in each package.

## Summary

| Package | `npm audit --omit=dev` | `npm audit` (incl. dev) before | after this PR |
| --- | --- | --- | --- |
| `web/` | 0 | 7 (6 high, 1 moderate) | 5 high |
| `alexa/` | 0 | 0 | 0 |

Every finding is in development tooling (ESLint, schema validation, build
minification). None is in a package that ships in the web server bundle or the
Alexa Lambda zip, so the production audit job in `security-baseline.yml` is green
before and after.

## Findings and decisions

| # | Package (path) | Advisory | Severity | Decision | Reason |
| --- | --- | --- | --- | --- | --- |
| 1 | `brace-expansion` 1.1.18 (via `eslint` → `minimatch@3`) | GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7 | high | Fix (small, safe) | Patch release 1.1.21 inside the existing `^1` range; lockfile-only. |
| 2 | `brace-expansion` 2.1.4 (via `@opennextjs/aws` → `glob@9`) | GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p | high | Fix (small, safe) | Patch release 2.1.7 inside `^2`; lockfile-only. |
| 3 | `brace-expansion` 5.0.9 (via `typescript-eslint` → `minimatch@10`) | GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7 | high | Fix (small, safe) | Patch release 5.0.12 inside `^5`; lockfile-only. |
| 4 | `fast-uri` 3.1.7 (via `ajv`) | GHSA-hrr3-gc8f-f4qj | moderate | Fix (small, safe) | Patch release 3.1.8 inside `^3`; `ajv` is only used by the schema tests. |
| 5 | `braces` 3.0.3 (via `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob@3.3.1` → `micromatch`) | GHSA-vfj7-8cjw-p6xm | high | Fix (large, needs a decision) — not changed here | No patched `braces` release exists; see below. |
| 6 | `micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next` | (same advisory as #5, reported per dependent) | high | Same as #5 | These four reports only exist because they depend on `braces`; they clear when #5 clears. |

`alexa/` had no findings, so it has no rows.

## Not fixed in this PR: `braces` (GHSA-vfj7-8cjw-p6xm)

- **What:** stack-exhaustion DoS when `braces` expands deeply nested patterns.
  The advisory lists every version (`<=3.0.3`) as affected and no patched release
  is published (`npm view braces versions` ends at 3.0.3).
- **Where it runs:** only inside `npm run lint` (ESLint), through
  `@next/eslint-plugin-next`'s pinned `fast-glob@3.3.1`. The glob patterns come
  from the repository's own ESLint config and Next.js defaults, not from user
  input, and the code never runs in production.
- **Why `npm audit fix --force` is not the answer:** it proposes
  `eslint-config-next@14.2.35`, a downgrade two majors back that does not match
  `next@16`. That would break the lint config, so it was rejected.
- **Upgrading `eslint-config-next` does not help either:** 16.4.2 (the version
  that matches the installed `next`) still pins `fast-glob@3.3.1`.
- **Options for the maintainer:**
  1. Accept the dev-only risk and wait for an upstream `braces` or `fast-glob`
     fix (recommended; the production audit is already clean).
  2. Add an `overrides` entry that forces a different `fast-glob`/`micromatch`
     under `@next/eslint-plugin-next`. This changes a version Next.js pins
     deliberately and would need lint behaviour to be re-checked.
  3. Record the advisory as accepted so the full audit stops reporting it.

## Open Dependabot and related pull requests

| PR | Scope | Relation to this audit |
| --- | --- | --- |
| [#108](https://github.com/larai-w/medication-promise-app/pull/108) (Dependabot) | `brace-expansion` + `fast-uri` in `web/` | Same four lockfile entries as this PR, with the same integrity hashes. It is behind `main`. Whichever lands first makes the other a no-op that can be closed. |
| [#110](https://github.com/larai-w/medication-promise-app/pull/110) (maintainer) | Next.js, sharp, source-map-js, proxy-addr, brace-expansion, fast-uri | Its Next.js, sharp, source-map-js and proxy-addr bumps already reached `main` through #111–#114. It now conflicts with `main`. The remaining part overlaps with #108 and this PR. |

Dependabot security alerts themselves cannot be listed from this session, so this
table only covers open pull requests.

## Lockfile note

`npm audit fix` on npm 10.9.4 also strips the `libc` fields from the
platform-specific optional packages (sharp, SWC). To keep the diff limited to the
fixes, only the `version`, `resolved` and `integrity` fields of the four entries
above were updated, using the registry's published tarball metadata. A clean
`npm ci` installs them without errors.

## Verification (web/)

- `npm ci` (clean `node_modules`)
- `npm test`: 213 passed, 0 failed
- `npx tsc --noEmit`: passed
- `npm run lint`: passed
- `npm run build`: passed
- `npm audit --omit=dev`: 0 vulnerabilities
- `npm audit`: 5 high, all from the `braces` advisory above
