# 0016. Real use from v0.2.0, alongside the Google Sheet

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Real data in prod changes how schema changes must be made.

## Decision

Dev is always seeded with the spec §10 data. Prod real use starts at `v0.2.0`, run side by side with the Google Sheet for one month (and again for money moves at `v0.3.0`). From then on migrations are forward-only and breaking changes take two releases.

## Consequences

Differences between the site and the Sheet are treated as bugs to explain.
