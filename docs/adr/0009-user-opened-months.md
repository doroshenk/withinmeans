# 0009. Only the user opens a month

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The spec allowed a background job to generate a month's bills, and also a user-driven Start flow.

## Decision

One idempotent `openMonth(ym)` creates the Month, Bills, Paychecks and CarryIn in one transaction. It is called only by setup step 1, a temporary "Open {month}" button (Phases 2–3) and the Start flow (Phase 4). No job ever opens a month, and there is no monthly reminder.

## Consequences

If the owner doesn't start the new month, it stays "Not started" until they do.
