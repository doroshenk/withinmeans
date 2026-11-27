# Within Means: rules for every Claude Code session

Within Means is a personal finance site (bills, paychecks, investment income) for one household of one or two people. Read these before doing anything.

- **What to build:** `docs/SPEC.md` (the spec).
- **How and in what order:** `docs/PLAN.md` (the plan; tickets are in §8 and in GitHub Issues).
- **Why:** `docs/adr/` (decision records).

The owner is learning AWS: when you touch infrastructure, explain what each resource is and where to find it in the AWS console.

## Workflow

- One ticket = one conversation = one branch = one PR. Start a ticket with `/work-ticket <ticket ID or issue number>`.
- **No plan sign-off needed.** Write the ticket plan (files, tests, open questions) and show it, then keep going without waiting for approval. Only stop for a real spec ambiguity or a decision that is the owner's to make; otherwise pick the sensible default and list it in the PR.
- **Test first, always.** Write the ticket's "tests to write first", run them, show them failing, commit them as `test: …`. Then implement until green (`feat: …`), then refactor (`refactor: …`). Bug fixes start with a failing test that reproduces the bug.
- Never weaken, skip (`.skip`, `.only`) or delete a test to make CI pass. If a test seems wrong, stop and ask.
- Before saying a ticket is done: `pnpm lint && pnpm typecheck && pnpm test && pnpm coverage` all pass, and every box in the ticket and in the plan's Definition of done (§9) is ticked.
- If the spec is unclear or seems wrong, stop and ask. Don't guess, and don't silently change behavior.
- **Pull requests:** before opening any PR, always run the `pr-reviewer` subagent (no need to ask) and fix or answer its blocking findings. The Claude GitHub Action reviews every PR. Address or answer every review comment; the owner resolves threads. Merge only with `/merge-pr <n>` (merge commit, never `--admin`); update branches with `/sync`. Branch protection on `main` is the real gate: never try to get around it.

## Side tickets (a second ticket at the same time)

Two clones of the repo sit side by side, so two tickets never share a working tree:

- **Main:** `C:\dev\WithinMeans\withinmeans`, for normal tickets.
- **Side:** `C:\dev\WithinMeans\sideTickets`, for side tickets. Start one with `/work-ticket <ticket> sideTicket`.

`/work-ticket` starts a side ticket when `sideTicket` (any capitalisation) is a separate argument, or when it runs in the side folder. Merely mentioning the folder or this section does not. Compare folder paths ignoring case and slash style.

- **Wrong folder:** if `/work-ticket … sideTicket` runs outside the side folder, change nothing (no branch, files or commands). Ask the owner to open the side folder in a new VS Code window and run the same command there.
- **Stay inside:** in the side folder, never edit files or run git, pnpm or scripts in the main folder, and the other way round.
- **Starting a new ticket** (not when resuming one: stay on its branch): `git status` must be clean (otherwise stop and ask), then `git switch main`, `git pull --ff-only` and `pnpm install --frozen-lockfile`. Check that no open PR or pushed branch is on the same ticket, and ask the owner to confirm the other folder isn't working it (unpushed work is invisible from here).
- **PR commands:** run `/sync <n>` and `/merge-pr <n>` only in the folder that holds that PR's branch. Otherwise stop and ask the owner to switch windows.
- **Shared dev AWS:** both folders use the same dev stage. From the side folder, never run `pnpm migrate`, `pnpm seed:dev`, reset scripts or `cdk deploy`; migrations reach dev when the PR merges and the dev deploy succeeds.
- **The second PR to merge** updates from `main`. If it is only `BEHIND`, use `/sync <n>`. If it has conflicts (`DIRTY`), in its own folder run `git fetch`, then `git merge origin/main` (never rebase: that needs a force-push), keep both tickets' additions in list-like files (routers, indexes, `permissions.test.ts`, JSON export), show the owner each resolution, regenerate `pnpm-lock.yaml` with `pnpm install`, and push normally. Either way, then rerun all checks.
- **Migration numbers:** after updating, list `packages/db/migrations` even if there was no conflict. If this branch's unmerged migration shares a number, renumber it. If it was ever applied to dev, stop and ask first.

## Architecture rules (enforced by lint, dependency-cruiser and tests)

- `packages/domain`: every rule in spec §5 lives here as **pure functions**. No database, no AWS SDK, no network, no `Date`, no `Math.random`, no reading the clock. "Today" is always a parameter.
- `packages/db`: the **only** package that may import `pg`, Kysely's dialects or the DSQL connector. Every repository function takes a `HouseholdContext { householdId, userId, role }` and scopes every query by `household_id`. Writes reject `role: 'view'`.
- `packages/api`: tRPC procedures. Every write procedure is built on `writeProcedure` (FORBIDDEN for view-only, before input parsing) and added to the T21 table in `permissions.test.ts` (a test fails if it's missing); the web hides write controls with `useCan().write`. Build `HouseholdContext` only from the verified Cognito token and the user's Membership, **never** from request input. Validate input with Zod schemas from `packages/domain`.
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
- Never read `.env*` files or print secrets. Secrets go in SSM Parameter Store, never in code. **The repo is public:** never commit keys, tokens, real email addresses, real financial data or screenshots with real numbers.
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
pnpm test             # all unit and integration tests (vitest projects: packages/* and tooling)
                      # (test and coverage first remove leftover test Postgres containers, if no other run is active)
pnpm coverage         # per-package coverage gates (domain 100/100, db and api 95/90, web 85/80)
pnpm --filter @withinmeans/domain mutation   # Stryker on domain, must score 90% or more
pnpm lint             # ESLint + Prettier --check + dependency-cruiser
pnpm typecheck        # tsc per package, plus tooling/
pnpm format           # prettier --write .
pnpm dev              # web app on :5173 against the dev API (see packages/web/README.md)
pnpm --filter @withinmeans/web build   # production build into packages/web/dist
pnpm migrate --stage dev        # applies migrations to the dev DSQL cluster (prod is refused except in the tag workflow)
pnpm e2e                        # Playwright smoke tests; needs SMOKE_BASE_URL (+ SMOKE_EMAIL, SMOKE_PASSWORD for sign-in); runs from the deploy workflow
pnpm --filter @withinmeans/db conformance   # needs DSQL_ENDPOINT; runs the repo suite on real DSQL
scripts/backup-now.sh dev|prod      # on-demand AWS Backup of the stage's cluster (prod deploy calls it)
pnpm seed:dev                   # loads the spec §10 data into dev (never prod); --reset rebuilds it,
                                # --owner-email <dev login> --leave-household lets you sign in to it
pnpm --filter @withinmeans/infra exec cdk diff --context stage=dev   # (P0-04+); cdk is a bin, so use exec
```

(Commands marked with a ticket become real when that ticket lands. Keep this list current.)

## Repo conventions learned so far

- **Layout:** `packages/{domain,db,api,web,infra}` are `@withinmeans/*`. `tooling/` is not a package: it holds tests for the repo's own rules (dependency-cruiser in `tooling/depcruise`, domain lint rules in `tooling/lint`). Fixtures live under `tooling/depcruise/fixtures/packages/<pkg>/src` and must keep the `packages/<pkg>/` path so the rules' path patterns match them. Fixtures are excluded from ESLint, Prettier and tsc.
- **`packages/domain` lint rules** (in `eslint.config.js`): no `Date`, `Temporal.Now` or `Math.random`; no division, fractional multiplication, `Math.*` or `toFixed` on identifiers ending `_cents` or `Cents`. Do money arithmetic through `money.ts` helpers; `formatMoney` works on the digit string. The rule is syntactic, so name money variables `*Cents` / `*_cents`.
- **Temporal:** Node 24 has no native `Temporal`. Import it from `temporal-polyfill` (domain dependency). Domain code takes a `Clock` and a time zone; only `api` / `web` build the real clock.
- **Versions:** TypeScript is pinned to `~5.9` because typescript-eslint doesn't support 7.0 yet. Bump both together.
- **Line endings:** `.gitattributes` forces LF. Windows checkouts with `core.autocrlf=true` otherwise make `prettier --check` fail. New config files you write must be LF.
- **Prettier ignores** `docs/`, `design/`, `scripts/`, `.github/`, `.claude/`, `README.md` and the fixtures.
- **Placeholders for red tests:** to get a test that fails for the right reason, add a stub that `throw new Error('not implemented')` (never a missing import). Check the failure output is an assertion, not an import or syntax error.
- **Setup:** use `npm install -g pnpm@10` if `corepack enable` fails with EPERM (it needs an admin shell). `gh` and `git` on this machine: if `git push`/`fetch` fail with "could not read Username", run `gh auth setup-git` once.
- **Merging:** PRs are merged with a merge commit (so the `test:` then `feat:` commits stay visible).
