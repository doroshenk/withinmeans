# 0010. tRPC + Zod on one Lambda; Kysely for SQL

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The only client is our own TypeScript web app.

## Decision

tRPC procedures on a single API Lambda behind API Gateway HTTP API, inputs validated by Zod schemas from `domain`. Kysely for type-safe, predictable SQL on DSQL.

## Consequences

End-to-end types. Adding non-TypeScript clients later would need an OpenAPI layer.
