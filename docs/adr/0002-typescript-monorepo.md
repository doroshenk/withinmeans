# 0002. TypeScript monorepo with a pure domain package

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The spec requires one shared module for every rule, used by the UI, API and PDF export.

## Decision

One pnpm monorepo in TypeScript: `domain`, `db`, `api`, `web`, `infra`. `domain` holds every §5 rule as pure functions, imported by both the browser and the Lambdas.

## Consequences

Rules exist once. Dependency rules are enforced by dependency-cruiser.
