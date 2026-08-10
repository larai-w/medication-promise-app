#!/usr/bin/env bash
# redeploy-last-good.sh — MTTR helper for the manual web deploy path.
#
# Why: the web app is deployed manually with `npm run deploy` (SST / OpenNext) and has no
# automated rollback. A 2026-08 DORA baseline found MTTR at the Low band, i.e. recovery after a
# bad change is the weak link. This script removes the "which commit + which command" delay:
# it finds the most recent main commit whose CI passed and redeploys that known-good commit.
# Pairs with docs/INCIDENT_RESPONSE.md (scenario MP-04).
#
# Safety:
#   - Dry run by DEFAULT. It only prints the plan.
#   - It actually deploys ONLY when you pass --deploy, and the deploy uses YOUR already-configured
#     AWS credentials (this script never handles secrets).
#
# Usage:
#   scripts/redeploy-last-good.sh                 # dry run: show the last-good commit + plan
#   scripts/redeploy-last-good.sh --sha <commit>  # target a specific known-good commit
#   scripts/redeploy-last-good.sh --deploy        # actually roll production back to last-good
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

WORKFLOW="CI / CD"
BRANCH="main"
SHA=""
DO_DEPLOY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deploy) DO_DEPLOY=true; shift ;;
    --sha)    SHA="${2:-}"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

# 1. Determine the last-good commit (most recent green CI on main), unless one was passed.
if [[ -z "$SHA" ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh CLI not found. Re-run with --sha <known-good-commit>." >&2
    exit 1
  fi
  echo "Looking up the most recent successful '$WORKFLOW' run on $BRANCH ..."
  SHA="$(gh run list --branch "$BRANCH" --workflow "$WORKFLOW" --status success \
        --limit 1 --json headSha --jq '.[0].headSha // empty' 2>/dev/null || true)"
  if [[ -z "$SHA" ]]; then
    echo "Could not find a green CI run automatically. Pass --sha <commit> explicitly." >&2
    exit 1
  fi
fi

if ! git cat-file -e "${SHA}^{commit}" 2>/dev/null; then
  echo "Commit $SHA not found locally. Run 'git fetch origin' first, or check the SHA." >&2
  exit 1
fi

SHORT="$(git rev-parse --short "$SHA")"
SUBJECT="$(git log -1 --format='%s  (%cr)' "$SHA")"

echo ""
echo "Last-good candidate: ${SHORT}  ${SUBJECT}"
echo "Plan:"
echo "  git checkout --detach ${SHORT}"
echo "  ( cd web && npm run deploy )   # sst deploy --stage production, uses your AWS creds"
echo ""

if ! $DO_DEPLOY; then
  echo "Dry run — nothing deployed. Re-run with --deploy to roll production back to this commit."
  echo "After recovering, fix forward on a branch and redeploy once CI is green again."
  exit 0
fi

# 2. Explicit deploy path.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash your changes before rolling back." >&2
  exit 1
fi

RETURN_REF="$(git symbolic-ref --quiet --short HEAD || git rev-parse --short HEAD)"
echo "Checking out ${SHORT} (detached) and deploying..."
git checkout --detach "$SHA"
( cd web && npm run deploy )
echo ""
echo "Deployed ${SHORT} to production."
echo "You are in DETACHED HEAD. Return to your branch with: git checkout ${RETURN_REF}"
