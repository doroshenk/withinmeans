# 0007. Three test layers and strict coverage

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The owner wants TDD and coverage so there are no bugs. There's no local DSQL emulator.

## Decision

Pure domain tests; repository and API tests on Postgres 16 in Docker (Testcontainers); a DSQL conformance run on dev after merge; Playwright end-to-end. Coverage: domain 100/100 plus Stryker ≥ 90%; db and api 95/90; web 85/80. Each PR starts with a failing `test:` commit.

## Consequences

Mutation testing checks the tests themselves, not just coverage.
