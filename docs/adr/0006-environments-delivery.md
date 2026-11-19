# 0006. dev and prod in one account; GitHub Actions with OIDC

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Free Tier benefits don't apply to accounts inside AWS Organizations. The GitHub repo is private on the Free plan, where environment approval rules aren't available.

## Decision

Two stages, `dev` and `prod`, in one AWS account. GitHub Actions authenticates with OIDC (no stored keys). PR checks block merges; merging to `main` deploys dev; a `v*` tag deploys prod. Actions spending limit $0.

## Consequences

The deliberate tag push is the prod approval. Branch protection guards `main`.
