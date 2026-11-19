# 0004. Aurora DSQL with a tenant-scoped repository layer

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The spec wants a relational, transactional database with row-level security. RDS isn't Always Free; Aurora DSQL is (100k DPUs and 1 GB a month) but lacks sequences, triggers and row-level security we can rely on.

## Decision

Use Aurora DSQL. Enforce household isolation in `packages/db`: every repository function takes a `HouseholdContext` built from the verified login; only `db` may import the driver; an isolation test suite covers every repository function. UUID keys; retry wrapper for optimistic-concurrency conflicts; a migration linter rejects unsupported features.

## Consequences

Isolation depends on discipline enforced by lint and tests rather than the database. Tests run on Postgres in Docker plus a conformance run on real DSQL.
