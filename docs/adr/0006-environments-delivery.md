# 0006. dev and prod in one account; GitHub Actions with OIDC

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Free Tier benefits don't apply to accounts inside AWS Organizations. The GitHub repo was made public (ADR 0017), so branch protection is available on GitHub Free.

## Decision

Two stages, `dev` and `prod`, in one AWS account. GitHub Actions authenticates with OIDC (no stored keys); the deploy role trusts only `main` and `v*` tags, never pull requests. Branch protection blocks direct pushes and unready merges; merging to `main` deploys dev; a `v*` tag deploys prod.

## Consequences

The deliberate tag push is the prod approval. Branch protection guards `main`. (Revised Nov 19, 2026 when the repo went public.)
