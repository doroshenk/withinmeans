#!/usr/bin/env bash
# One-time: protect `main` so changes need a PR and a green `ci-gate` check, with no direct pushes.
# Needs a public repo or GitHub Pro (the API returns 403 on a private repo on the free plan).
# Usage: bash scripts/protect-main.sh [owner/repo]
set -euo pipefail

repo="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

gh api -X PUT "repos/${repo}/branches/main/protection" --input - <<JSON
{
  "required_status_checks": { "strict": true, "contexts": ["ci-gate"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
echo "Protected main on ${repo}"
