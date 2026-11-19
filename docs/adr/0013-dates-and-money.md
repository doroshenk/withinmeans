# 0013. Calendar dates, injected clock, integer cents

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Week and month boundaries must follow the household's time zone; DSQL's clock is UTC.

## Decision

Business dates are `Temporal.PlainDate` / SQL `DATE`; months are `YYYY-MM`. "Today" comes from an injected clock in the household's time zone. Money is integer cents with one `formatMoney()`.

## Consequences

No `Date` in `domain` (lint-enforced). Tests pin today to Wed Nov 18, 2026.
