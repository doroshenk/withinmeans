# Within Means: rules for every Claude Code session

Within Means is a personal finance site (bills, paychecks, investment income) for one household of one or two people. Read these before doing anything.

- **What to build:** `docs/SPEC.md` (the spec).
- **How and in what order:** `docs/PLAN.md` (the plan; tickets are in §8 and in GitHub Issues).
- **Why:** `docs/adr/` (decision records).

The owner is learning AWS: when you touch infrastructure, explain what each resource is and where to find it in the AWS console.

## Workflow

- One ticket = one conversation = one branch = one PR. Start a ticket with `/work-ticket <ticket ID or issue number>`.
- **Test first, always.** Write the ticket's "tests to write first", run them, show them failing, commit them as `test: …`. Then implement until green (`feat: …`), then refactor (`refactor: …`). Bug fixes start with a failing test that reproduces the bug.
- Never weaken, skip (`.skip`, `.only`) or delete a test to make CI pass. If a test seems wrong, stop and ask.
- Before saying a ticket is done: `pnpm lint && pnpm typecheck && pnpm test && pnpm coverage` all pass, and every box in the ticket and in the plan's Definition of done (§9) is ticked.
- If the spec is unclear or seems wrong, stop and ask. Don't guess, and don't silently change behavior.

## Architecture rules (enforced by lint, dependency-cruiser and tests)

- `packages/domain`: every rule in spec §5 lives here as **pure functions**. No database, no AWS SDK, no network, no `Date`, no `Math.random`, no reading the clock. "Today" is always a parameter.
- `packages/db`: the **only** package that may import `pg`, Kysely's dialects or the DSQL connector. Every repository function takes a `HouseholdContext { householdId, userId, role }` and scopes every query by `household_id`. Writes reject `role: 'view'`.
- `packages/api`: tRPC procedures. Build `HouseholdContext` only from the verified Cognito token and the user's Membership, **never** from request input. Validate input with Zod schemas from `packages/domain`.
- `packages/web`: React. Imports `domain` and the tRPC **types** from `api` only. Every number shown comes from `domain` functions; pages never recompute rules.
- `packages/infra`: AWS CDK. Every stack has assertion tests.

## Data rules

- **Money:** integer cents (`*_cents`), never floats. Format only with `formatMoney()` (`$1,234.56`, true minus sign `−$923`).
- **Dates:** `Temporal.PlainDate` and `"YYYY-MM"` strings for business dates; SQL `DATE`. `timestamptz` only for audit fields (`created_at`, `paid_at`, `done_at`), never to decide a week or month.
- **IDs:** UUIDs. Aurora DSQL has no sequences.
- **Migrations:** forward-only, in `packages/db/migrations`. Never edit a merged migration. Each migration is DDL-only or DML-only. Must pass the DSQL migration linter: no `SERIAL`/`IDENTITY`/sequences, triggers, non-SQL functions, `TRUNCATE` or temp tables. From `v0.2.0`, breaking changes take two releases (add → backfill → switch → drop later).
- **Transactions:** money moves, `openMonth`, Start month and share trades each run in one transaction inside the retry wrapper (DSQL uses optimistic concurrency).
- **Months** are opened only by `openMonth(ym)`, called from the user's flow. Nothing opens a month on a schedule.
- **New table checklist:** isolation tests, the T21 view-only test table for its write procedures, and the JSON export (a test fails if it's missing).

## Privacy and safety

- Never log amounts: the logger drops `*_cents` fields and request/response bodies. Don't work around it.
- Never collect card or account numbers.
- Never read `.env*` files or print secrets. Secrets go in SSM Parameter Store, never in code.
- Never run `cdk deploy` against prod, `git push --force`, or destructive `aws` commands. Prod deploys only from the tag workflow.
- `seed:dev` and any reset scripts run against dev only.

## Testing

- Domain tests use fixed data and today = **Wed Nov 18, 2026**. Spec §10 acceptance numbers (T1–T24) are the source of truth: name tests after them (`it('T4: week 3 available …')`).
- Repository and API tests run on Postgres 16 in Docker (Testcontainers): Docker Desktop must be running.
- Coverage gates: domain 100% lines and branches plus Stryker ≥ 90%; db and api 95/90; web 85/80.
- UI: check every screen at 1440px and 390px, and compare it with its artboard in `design/`.

## Commands

```bash
pnpm install
pnpm test             # all unit and integration tests
pnpm coverage         # with coverage gates
pnpm lint && pnpm typecheck
pnpm dev              # web app against the dev API
pnpm migrate --stage dev
pnpm seed:dev
pnpm --filter infra cdk diff --context stage=dev
```

(Commands become real as Phase 0 tickets create them. Keep this list current.)
