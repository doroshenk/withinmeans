# Within Means — Development Plan

> Companion to `within-means-spec.md` (the spec). The spec says **what** the site does; this plan says **how** it gets built, tested and deployed, and **in what order**. Decided in a planning session on Nov 19, 2026.
>
> Copies: this Project (`claude/within-means-dev-plan.md`) and the repo (`docs/PLAN.md`). Tickets are GitHub Issues in `doroshenk/withinmeans`, one per ticket below, with milestones per phase, created from `docs/tickets.json` by `node scripts/create-issues.mjs` (§10.1).

---

## 1. Decisions

| Area | Decision |
|---|---|
| AWS account | Free plan credits for now; switch to the Paid plan with a $1 budget alert **before the Free plan's 6 months end** (the account closes otherwise). Build only on Always Free services. |
| Region | us-east-1 |
| Stack | TypeScript monorepo: `domain`, `db`, `api`, `web`, `infra` |
| Database | Aurora DSQL. UUID keys, no sequences or triggers, migrations linted, retry on conflicts |
| Isolation | Tenant-scoped repository layer with `HouseholdContext`; only `packages/db` may touch the database (lint-enforced); isolation tests for every repository function |
| Auth | Cognito Essentials for identity; Household, Membership, Invite in DSQL; our own sign-in screens |
| API | tRPC + Zod on one Lambda behind API Gateway HTTP API; Kysely for SQL |
| Web | React + Vite SPA, PWA (no push), S3 + CloudFront |
| Domain | `within.doroshenk.com` (prod), `dev.within.doroshenk.com` (dev): CNAMEs at Network Solutions, free ACM certificate. Gmail on `doroshenk.com` untouched |
| Email | SES from `no-reply@within.doroshenk.com`, invites only, sandbox mode with both addresses verified. Password reset by Cognito |
| Infrastructure | AWS CDK (TypeScript) with assertion tests; each infra ticket has a "find it in the console" checklist |
| Environments | `dev` + `prod` in one account |
| Delivery | GitHub Actions + OIDC. PR checks block merges; merge → dev; tag `v*` → prod. $0 Actions spending limit |
| Tests | Domain (pure) → repository/API on Postgres in Docker → DSQL conformance on dev after merge; Playwright e2e |
| Coverage | domain 100/100 + Stryker ≥ 90%; db/api 95/90; web 85/80 |
| Months | Only the user opens a month, via `openMonth(ym)`. No job ever opens one |
| Reminders | **Removed.** "This week" stays, computed on page load by `dueSoon()` |
| PDF | In the browser with `@react-pdf/renderer` |
| Dates and money | `Temporal.PlainDate`, SQL `DATE`, injected `Clock`, integer cents, one `formatMoney()` |
| Backups | Daily AWS Backup (14 days) + nightly JSON export to S3 (90 days) + a restore drill; no amounts in logs |
| Phone | Responsive from day one; Phase 6 adds phone-only flows |
| Real data | Prod real use from `v0.2.0`, side by side with the Google Sheet for one month |
| Design | Artboards snapshotted into `design/`; tokens in code; side-by-side review per screen PR |
| Planning | This plan + GitHub Issues + `CLAUDE.md` + decision records in `docs/adr/` |

---

## 2. Architecture

```text
 Browser (React SPA / PWA)
   │  https://within.doroshenk.com
   ▼
 CloudFront ──── /*      ──► S3 (private, Origin Access Control)   static site
     │
     └────────── /api/*  ──► API Gateway HTTP API ──► Lambda "api" (tRPC)
                                                         │  verifies Cognito JWT (aws-jwt-verify)
                                                         │  builds HouseholdContext from Membership
                                                         ▼
                                                    packages/db (Kysely) ──► Aurora DSQL
 Cognito user pool  ◄── sign-up / sign-in / reset from the SPA
 SES  ◄── invite emails from the api Lambda
 EventBridge Scheduler ──► Lambda "export" (nightly) ──► S3 export bucket (versioned, 90 days)
 AWS Backup ──► daily DSQL recovery points (14 days)
```

### Repo layout

```text
withinmeans/
  CLAUDE.md                 standing rules for every Claude Code session
  docs/PLAN.md              this plan
  docs/adr/                 decision records (0001-aurora-dsql.md …)
  docs/runbooks/            aws-account.md, restore.md, release.md
  design/                   pinned snapshot of the Claude Design artboards
  packages/
    domain/                 every §5 rule as pure functions + Zod schemas. No DB, no AWS, no Date
    db/                     Kysely, migrations, migration linter, repositories, isolation suite
    api/                    tRPC routers, context, Lambda handlers (api, export)
    web/                    React app, theme/tokens.ts, components, pages, Playwright e2e
    infra/                  CDK app: Ci, Data, Auth, Api, Web, Email, Backup, Jobs stacks
  .github/workflows/        pr.yml, deploy-dev.yml, deploy-prod.yml
  .claude/                  project settings and the work-ticket skill
```

### Dependency rules (enforced by dependency-cruiser)

- `domain` imports nothing from the other packages and no AWS SDK.
- Only `db` imports the Postgres driver or the DSQL connector.
- `web` imports `domain` (for formatting, validation and live previews) and the tRPC **types** from `api`, nothing else from `api` or `db`.

---

## 3. How testing works

| Layer | What | Runs against | When |
|---|---|---|---|
| Domain | Every §5 rule; §10 numbers T1–T13, T22–T23 | Nothing: pure functions with a fixed "today" (Wed Nov 18, 2026) | Every save and every PR. Stryker on PRs touching `domain` |
| Repository + API | SQL, transactions, isolation, roles (T21), procedures | Postgres 16 in Docker (Testcontainers), fresh schema per file | Every PR |
| Infra | CDK assertions (permissions, privacy, retention) | `cdk synth` output | Every PR |
| Web | Components and hooks | Vitest + Testing Library, mocked tRPC | Every PR |
| DSQL conformance | Migrations + repository suite | The real dev DSQL cluster, throwaway schema | After merge to `main` |
| End-to-end | Happy path per screen at 1440 and 390; phase acceptance tests | Playwright against `dev.within.doroshenk.com` | After merge to `main` |

**TDD rule.** Each ticket's PR starts with a `test:` commit containing the failing tests listed in the ticket, then `feat:` commits that make them pass, then optional `refactor:` commits. Bug fixes start with a test that reproduces the bug. `main` is always green.

---

## 4. Environments, releases and migrations

- **dev**: deployed automatically on every merge to `main`. Seeded with the §10 data by `pnpm seed:dev`. Safe to reset.
- **prod**: deployed only by pushing a tag (`git tag v0.2.0 && git push --tags`) or by running the prod workflow by hand. You never run `cdk deploy` against prod from your laptop.
- **Each phase ends with a prod release** (`v0.0.1` … `v1.0.0`) after its acceptance tests pass on dev.
- **From `v0.2.0` (real data):**
  - Migrations are forward-only; old migrations are never edited.
  - Breaking changes take two releases: add → backfill → switch code → drop later.
  - The prod pipeline takes an on-demand AWS Backup before migrating and stops if the backup fails.
  - `seed:dev` refuses to run on any stage but dev.

---

## 5. Staying free

| Service | What we use | Free allowance |
|---|---|---|
| Aurora DSQL | 2 clusters (dev, prod) | 100k DPUs + 1 GB a month, shared by the account (Always Free) |
| Lambda | api + export | 1M requests and 400k GB-seconds a month (Always Free) |
| API Gateway HTTP API | 1 per stage | Covered by credits; at two users the usage is cents a year |
| CloudFront | 1 distribution per stage | 1 TB and 10M requests a month (Always Free) |
| Cognito Essentials | 1 pool per stage | 10,000 monthly active users (Always Free) |
| SES | Invite emails | Pennies at most |
| S3, AWS Backup | Site files, exports, backups | Well under 1 GB: a few cents a month at most |
| ACM certificates | 2 | Free |
| GitHub Actions | Private repo | Free plan allowance (about 2,000 Linux minutes a month); $0 spending limit |

**Guardrails:** the $1 budget alert, the DSQL DPU graph in CloudWatch (check it monthly), no NAT gateways, no RDS, no Secrets Manager (use SSM Parameter Store standard parameters if a secret is ever needed), and no provisioned capacity anywhere.

---

## 6. Manual steps only you can do

These can't be automated by CDK. Each is part of a ticket's checklist.

| When | Where | Step |
|---|---|---|
| Before P0-01 | Terminal at the repo root | `node scripts/install-tooling.mjs`, commit and push, then `node scripts/create-issues.mjs` (§10.1) |
| P0-01 | Claude Design canvas | Export the 16 artboards into `design/` |
| P0-03 | GitHub → Settings → Billing | Set the Actions spending limit to $0 |
| P0-03 | GitHub → repo → Settings → Branches | Protect `main` (PR required, checks required) |
| P0-04 | AWS console | Root MFA, admin user with MFA, $1 budget, note the credit expiry |
| P0-10 | Network Solutions DNS for `doroshenk.com` | CNAME for the ACM certificate validation (value printed by CDK) |
| P0-10 | Network Solutions | CNAME `within` → prod CloudFront domain; CNAME `dev.within` → dev CloudFront domain |
| P1-03 | Network Solutions | 3 DKIM CNAMEs for `within.doroshenk.com`; TXT `_dmarc.within` = `v=DMARC1; p=none; rua=mailto:<your Gmail>` |
| P1-03 | SES console | Verify your and your partner's email addresses |
| Before the Free plan ends | AWS Billing | Upgrade to the Paid plan |

Network Solutions changes can take a few hours to take effect. Don't touch the root `doroshenk.com` MX, SPF or DMARC records: Gmail relies on them.

---


## 7. Phase overview

| Phase | Tickets | Release | What you can do at the end |
|---|---|---|---|
| Phase 0 — Walking skeleton | 13 | `v0.0.1` | A thin, deployed thread through every layer: repo and CI, AWS account, every CDK stack, Cognito sign-in, one API call that reads DSQL, the custom domain, backups. Ends deployed to dev **and** prod. |
| Phase 1 — Foundation | 14 | `v0.1.0` | Sign-up (solo or partner), invites, sign-in, roles, the app shell, setup wizard steps 1, 2, 4, 5 and 9, and the JSON export. |
| Phase 2 — Bills and paychecks | 12 | `v0.2.0` | The "within means" core: openMonth, bills, cards, paychecks, other income, money in/out. **Real use in prod starts here, alongside the Google Sheet for one month.** |
| Phase 3 — Investments and money moves | 12 | `v0.3.0` | Holdings, options, dividends, splits, weekly money moves with carry-over, reinvest suggestions, bills covered. |
| Phase 4 — Dashboard, accounts and months | 8 | `v0.4.0` | The dashboard with This week, the Accounts page with forecast and reconcile, the Start-a-new-month flow, locking and Unlock. |
| Phase 5 — Year in review | 3 | `v0.5.0` | Year in review with projections, and the in-browser PDF. |
| Phase 6 — Phone polish and empty states | 7 | `v1.0.0` | The phone-only flows, bottom sheets, remaining empty states and the accessibility audit. |

Tickets within a phase can be done in any order that respects *Blocked by*. Phases run in order.

---

## 8. Tickets


### Phase 0 — Walking skeleton → `v0.0.1`

A thin, deployed thread through every layer: repo and CI, AWS account, every CDK stack, Cognito sign-in, one API call that reads DSQL, the custom domain, backups. Ends deployed to dev **and** prod.


#### P0-01 · Monorepo scaffold and quality gates

**Spec:** §12  
**Blocked by:** nothing

**Goal.** pnpm workspace with `packages/domain`, `db`, `api`, `web`, `infra`; strict TypeScript; ESLint + Prettier; Vitest with per-package coverage thresholds; dependency-cruiser rules.

**Tests to write first (red):**

- [ ] A placeholder domain test fails, then passes (proves the red→green loop works)
- [ ] dependency-cruiser fails when any package other than `db` imports `pg` or the DSQL connector
- [ ] dependency-cruiser fails when `domain` imports anything from `db`, `api`, `web`, `infra` or any AWS SDK

**Also done when:**

- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` and `pnpm coverage` work from the repo root
- [ ] Coverage thresholds set: domain 100/100, db and api 95/90, web 85/80
- [ ] Node 24 pinned in `.nvmrc` and `engines`; README has the local setup steps
- [ ] `design/` snapshot filled: export the 16 artboards from the Claude Design canvas into `design/` (see `design/README.md`)


#### P0-02 · Domain foundations: money, dates, week(), clock

**Spec:** §4, §5.1, §7 Formatting, §12  
**Blocked by:** P0-01

**Goal.** The building blocks every rule uses: integer-cents money, `formatMoney`, `Temporal.PlainDate` helpers, `ym` helpers, `week()`, and an injectable `Clock`.

**Tests to write first (red):**

- [ ] T1: `week()` for Nov 1, 7, 8, 21, 22, 30 → 1, 1, 2, 3, 4, 4
- [ ] `formatMoney(123456)` → `$1,234.56`; `formatMoney(-92300, {whole:true})` → `−$923` with a true minus sign
- [ ] `today(clock, 'America/New_York')` at 2026-12-01T02:00Z → 2026-11-30
- [ ] `addMonths('2026-12', 1)` → `2027-01`; `monthOf(date)`, `daysInMonth` cover Feb in leap and non-leap years
- [ ] Money helpers reject non-integer cents

**Also done when:**

- [ ] A lint rule forbids `Date` in `packages/domain` and float math on `*_cents` identifiers


#### P0-03 · CI: PR checks and branch protection

**Spec:** §12  
**Blocked by:** P0-01

**Goal.** GitHub Actions workflow on every PR: install with cache, lint, typecheck, unit tests with coverage gates, dependency-cruiser, CDK synth. Stryker mutation run only when `packages/domain` changes.

**Tests to write first (red):**

- [ ] A PR that drops domain coverage below 100% fails the check (verify once with a throwaway PR)
- [ ] Stryker job fails below a 90% mutation score

**Also done when:**

- [ ] Branch protection on `main`: PR required, checks required, no direct pushes
- [ ] `concurrency` cancels superseded runs on the same PR
- [ ] GitHub Actions spending limit set to $0 (manual step in GitHub billing settings)


#### P0-04 · AWS account baseline (manual, guided)

**Spec:** §12  
**Blocked by:** P0-01

**Goal.** Set up the AWS account safely before any infrastructure exists.

**Tests to write first (red):**

- [ ] `aws sts get-caller-identity` with the admin profile returns the expected account

**Also done when:**

- [ ] Root user has MFA; daily work uses an admin user or IAM Identity Center user with MFA, never root
- [ ] AWS Budget with a $1 alert to your email
- [ ] Note the Free plan credit expiry date in `docs/runbooks/aws-account.md`; switch to the Paid plan before it
- [ ] AWS CLI v2 installed and signed in (`aws login` or SSO profile `withinmeans`)
- [ ] `cdk bootstrap aws://<account>/us-east-1` run once

**Find it in the console (learning):**

- [ ] Billing → Free Tier page: find your remaining credits and expiry date
- [ ] IAM: find your admin user and confirm MFA is on
- [ ] Budgets: find the $1 budget and its alert
- [ ] CloudFormation: find the `CDKToolkit` stack that bootstrap created


#### P0-05 · GitHub OIDC deploy role

**Spec:** §12  
**Blocked by:** P0-04

**Goal.** A CDK `CiStack` that lets GitHub Actions deploy without stored AWS keys.

**Tests to write first (red):**

- [ ] CDK assertion: the role trusts only `token.actions.githubusercontent.com` with `sub` limited to `repo:doroshenk/withinmeans:*`
- [ ] CDK assertion: the role can assume only the CDK bootstrap roles

**Also done when:**

- [ ] A workflow run can call `aws sts get-caller-identity` using the role

**Find it in the console (learning):**

- [ ] IAM → Identity providers: find the GitHub OIDC provider
- [ ] IAM → Roles: open the deploy role and read its trust policy


#### P0-06 · Database package: migrations, linter, test harness

**Spec:** §4, §8, §12  
**Blocked by:** P0-02

**Goal.** `packages/db` with Kysely, a forward-only migration runner, the DSQL migration linter, a Postgres 16 Testcontainers harness, the retry wrapper, and the `HouseholdContext` repository pattern.

**Tests to write first (red):**

- [ ] Migration linter rejects: `SERIAL`/`BIGSERIAL`/`IDENTITY`, `CREATE SEQUENCE`, `CREATE TRIGGER`, non-SQL functions, `TRUNCATE`, temp tables, and a migration mixing DDL with DML
- [ ] Migration linter accepts the first real migration
- [ ] Retry wrapper retries a transaction on DSQL's serialization/OCC error code and gives up after N tries
- [ ] Isolation suite template: household A cannot read, update or delete household B's row for the first repository (`households.getMine`)
- [ ] A repository write with `role: 'view'` throws `Forbidden`

**Also done when:**

- [ ] Docker Desktop required locally; documented in README
- [ ] Each test file gets a fresh schema


#### P0-07 · Data stack: Aurora DSQL cluster and conformance run

**Spec:** §12  
**Blocked by:** P0-05, P0-06

**Goal.** CDK `DataStack` per stage creates a single-Region DSQL cluster; the migration runner connects with the official DSQL Node connector (IAM auth tokens).

**Tests to write first (red):**

- [ ] CDK assertion: one DSQL cluster per stage with deletion protection on in prod
- [ ] Conformance job: runs migrations and the repository suite against the dev cluster in a throwaway schema, then drops it

**Also done when:**

- [ ] `pnpm migrate --stage dev` works from your laptop

**Find it in the console (learning):**

- [ ] Aurora DSQL console: find the dev cluster, its endpoint and the query editor
- [ ] Run `select * from household` in the query editor
- [ ] CloudWatch → Metrics → AuroraDSQL: find the DPU usage graph (this is your free-tier meter)


#### P0-08 · Auth stack: Cognito user pool

**Spec:** §3, §12  
**Blocked by:** P0-05

**Goal.** CDK `AuthStack` per stage: Cognito user pool on the Essentials tier, email sign-in, 8-character password policy, a public app client for the SPA, refresh tokens for "keep me signed in".

**Tests to write first (red):**

- [ ] CDK assertion: user pool feature plan is Essentials; password minimum length 8; self sign-up allowed; email is the username
- [ ] CDK assertion: the app client has no secret and allows SRP auth and refresh tokens

**Find it in the console (learning):**

- [ ] Cognito → User pools: find the dev pool, its app client, and the password policy
- [ ] After P0-11, find your own test user in the Users list


#### P0-09 · API stack: tRPC Lambda with auth and safe logging

**Spec:** §8, §12  
**Blocked by:** P0-07, P0-08

**Goal.** CDK `ApiStack`: one Node 24 Lambda running tRPC behind an HTTP API. The context verifies the Cognito JWT with `aws-jwt-verify`, loads the Membership and builds `HouseholdContext`. First procedure: `me`.

**Tests to write first (red):**

- [ ] `me` with no token → UNAUTHORIZED; with a valid token but no membership → returns user with no household
- [ ] `me` returns the user's name and household name from the database
- [ ] Logger drops any field ending in `_cents` and any request/response body
- [ ] CDK assertion: the Lambda's role can connect to the stage's DSQL cluster only

**Also done when:**

- [ ] Unhandled errors return a generic message; details go to CloudWatch without amounts

**Find it in the console (learning):**

- [ ] Lambda: open the API function, find its CloudWatch log group, and read one request log
- [ ] API Gateway: find the HTTP API and its routes


#### P0-10 · Web stack: S3, CloudFront, certificate and domain

**Spec:** §12  
**Blocked by:** P0-05

**Goal.** CDK `WebStack`: private S3 bucket with Origin Access Control, CloudFront with SPA fallback, `/api/*` routed to the HTTP API, an ACM certificate for `within.doroshenk.com` / `dev.within.doroshenk.com`.

**Tests to write first (red):**

- [ ] CDK assertion: the bucket blocks all public access and is readable only by the distribution
- [ ] CDK assertion: `/api/*` behavior has caching disabled and forwards the Authorization header
- [ ] CDK assertion: the distribution's alternate domain matches the stage

**Also done when:**

- [ ] Network Solutions checklist done: certificate validation CNAME, then `within` and `dev.within` CNAMEs to the distribution domains (CDK prints the values)
- [ ] HTTPS works at both addresses

**Find it in the console (learning):**

- [ ] Certificate Manager (us-east-1): watch the certificate go from Pending to Issued
- [ ] CloudFront: find the distribution, its origins and its behaviors
- [ ] S3: open the bucket and confirm "Block all public access" is on


#### P0-11 · Web app skeleton: tokens, sign-up, sign-in, hello

**Spec:** §3, §7, §12  
**Blocked by:** P0-09, P0-10

**Goal.** Vite + React app with design tokens in `theme/tokens.ts`, DM Sans and Fraunces, a minimal sign-up and sign-in against Cognito, and a page that calls `me` and shows "Hello {name}". PWA manifest and icons.

**Tests to write first (red):**

- [ ] Tokens test: every §7 hex value is present and named
- [ ] Sign-in form shows Cognito errors with `role="alert"`
- [ ] Hello page renders the name returned by `me` (mocked tRPC client)

**Also done when:**

- [ ] Layout works at 1440px and 390px


#### P0-12 · Backups and restore drill

**Spec:** §8, §12  
**Blocked by:** P0-07

**Goal.** AWS Backup plan for the DSQL cluster: daily, 14-day retention, plus an on-demand job the prod deploy calls.

**Tests to write first (red):**

- [ ] CDK assertion: backup plan exists with daily rule and 14-day retention, selecting the stage's cluster

**Also done when:**

- [ ] Restore drill done once on dev: restore to a new cluster, check a row, delete the restored cluster
- [ ] `docs/runbooks/restore.md` written from the drill

**Find it in the console (learning):**

- [ ] AWS Backup: find the plan, the vault and the first recovery point


#### P0-13 · Deploy pipeline: dev on merge, prod on tag

**Spec:** §12  
**Blocked by:** P0-03, P0-11, P0-12

**Goal.** Workflows: merge to `main` → deploy all dev stacks, run migrations, run the DSQL conformance job, run Playwright smoke against `dev.within.doroshenk.com`. Tag `v*` → deploy prod.

**Tests to write first (red):**

- [ ] Playwright smoke: sign in with a dev test user and see "Hello"

**Also done when:**

- [ ] A prod deploy takes an on-demand AWS Backup before running migrations (wired in P0-12)
- [ ] Release `v0.0.1` deployed to prod and you can sign in at `within.doroshenk.com`


### Phase 1 — Foundation → `v0.1.0`

Sign-up (solo or partner), invites, sign-in, roles, the app shell, setup wizard steps 1, 2, 4, 5 and 9, and the JSON export.


#### P1-01 · Core schema: household, users, months, categories, accounts

**Spec:** §4  
**Blocked by:** P0-13

**Goal.** Migrations and repositories for Household, User, Membership, Invite, Month, Category, Account, BalanceSnapshot and RecurringBill (needed by setup step 5).

**Tests to write first (red):**

- [ ] Isolation suite covers every new repository function (A can't see or change B)
- [ ] Category names are unique per household ignoring case
- [ ] `view` role is rejected on every write function
- [ ] Migration linter passes on all migrations


#### P1-02 · Sign-up: solo or with a partner

**Spec:** §3 Creating an account  
**Blocked by:** P1-01

**Goal.** API and screens for steps 1–2 and 4 of sign-up: choose mode, create login (Cognito), create Household and owner Membership in one transaction, household time zone from the browser.

**Tests to write first (red):**

- [ ] Solo sign-up creates a `solo` household with one owner membership
- [ ] Partner sign-up requires a household name
- [ ] Password strength meter has 4 steps; under 8 characters is rejected
- [ ] T20: a solo account never shows a partner invite option anywhere

**Also done when:**

- [ ] Matches `SignIn.dc.html` / `Setup.dc.html` sign-up artboards at 1440 and 390


#### P1-03 · Partner invite and SES email

**Spec:** §3 Invite your partner  
**Blocked by:** P1-02

**Goal.** Invite step: name, email, access, note; token with 7-day expiry; email sent through SES from `no-reply@within.doroshenk.com`; Done screen with pending status and Resend.

**Tests to write first (red):**

- [ ] T19: an invite to the user's own email is rejected with "Use your partner's own email…"
- [ ] Invite token expires after 7 days; Resend issues a new token and invalidates the old one
- [ ] There is no "invite later" path: the partner flow cannot finish without sending
- [ ] Email sender is called with the accept URL and never with amounts

**Also done when:**

- [ ] CDK: SES domain identity for `within.doroshenk.com` with DKIM; Network Solutions checklist for the 3 DKIM CNAMEs and `_dmarc.within` TXT
- [ ] Both your and your partner's addresses verified in SES (sandbox is fine)

**Find it in the console (learning):**

- [ ] SES: find the domain identity and see DKIM status "Successful"
- [ ] SES: find the verified email addresses


#### P1-04 · Accept invite

**Spec:** §3 The partner accepting an invite  
**Blocked by:** P1-03

**Goal.** Accept screen shows inviter, household, note and access; the partner creates their own Cognito login and gets a Membership with the invited role.

**Tests to write first (red):**

- [ ] Expired or used token shows an error and creates nothing
- [ ] Accepting creates exactly one Membership with the invite's role and sets `accepted_at`
- [ ] The partner then sees the same household data via `me`


#### P1-05 · Sign in, keep me signed in, forgot password

**Spec:** §3 Sign in  
**Blocked by:** P1-02

**Goal.** Sign-in screen per design; "Keep me signed in" controls refresh-token storage; "Forgot password?" uses Cognito's reset flow.

**Tests to write first (red):**

- [ ] Without "keep me signed in", tokens are kept for the browser session only
- [ ] Forgot-password flow handles code sent, wrong code and success
- [ ] Signed-out users are redirected to sign-in from every app route

**Also done when:**

- [ ] Passkeys left for later (Cognito Essentials supports them)


#### P1-06 · Roles in the UI and API

**Spec:** §3 Permissions  
**Blocked by:** P1-01

**Goal.** A `useCan()` hook hides create/edit/delete controls for view-only members; every write procedure checks role on the server too.

**Tests to write first (red):**

- [ ] T21 (so far): a view-only member sees no write controls, and every write procedure returns FORBIDDEN
- [ ] Owner always has full access

**Also done when:**

- [ ] Every later ticket with a write procedure adds itself to the T21 test table


#### P1-07 · App shell: sidebar, tab bar, month navigator, Add button

**Spec:** §6 intro, §6.15  
**Blocked by:** P0-11

**Goal.** The responsive shell: desktop sidebar with nav links, "+ Add" placeholder and the money-moves card placeholder; phone tab bar with More; the reusable month navigator with status chip.

**Tests to write first (red):**

- [ ] Month navigator moves between months and shows open / closed / not started chips
- [ ] Tab bar appears below 768px and the sidebar above it
- [ ] Every icon button has an aria-label; focus rings visible

**Also done when:**

- [ ] Matches the shell in `Main.dc.html` and `Phone.dc.html`


#### P1-08 · Setup wizard framework

**Spec:** §3 First-time setup wizard  
**Blocked by:** P1-07, P1-01

**Goal.** Stepper with 9 steps, save on continue, resume where you left off, jump to any step, optional steps skippable, unbuilt steps show "coming soon".

**Tests to write first (red):**

- [ ] Leaving and returning resumes at the last unfinished step
- [ ] Skipped optional steps show as skipped in the stepper and in Review


#### P1-09 · Setup step 1: first month (openMonth v1)

**Spec:** §3 step 1, §5.11  
**Blocked by:** P1-08

**Goal.** Choose this month or next; calls the first version of `openMonth(ym)` which creates the Month row (bills and paychecks are added in P2-01/P2-03).

**Tests to write first (red):**

- [ ] `openMonth` is idempotent: calling it twice creates one Month
- [ ] "This month" sets `first_month` to the current household month; "next month" to the following one


#### P1-10 · Setup step 2: bank accounts and cushion

**Spec:** §3 step 2  
**Blocked by:** P1-08

**Goal.** Add accounts (name, type, balance today → first BalanceSnapshot) and the checking cushion.

**Tests to write first (red):**

- [ ] At least one account is required; every account needs a name and a balance
- [ ] The first checking account becomes `is_primary_checking`


#### P1-11 · Setup step 4: bill categories

**Spec:** §3 step 4  
**Blocked by:** P1-08

**Goal.** Seven default categories, one-tap suggestions, rename, recolor by tapping the swatch, delete with move.

**Tests to write first (red):**

- [ ] T18: deleting "Home" used by 1 bill moves the bill to the first remaining category and shows a message
- [ ] Renaming a category renames it on every bill that uses it
- [ ] Duplicate names are rejected ignoring case; at least one category required


#### P1-12 · Setup step 5: recurring bills

**Spec:** §3 step 5  
**Blocked by:** P1-11

**Goal.** Add recurring bills (name, estimate, due day 1–28, category, autopay), suggestions crossed out when used, total per month and share of take-home.

**Tests to write first (red):**

- [ ] Estimate must be > 0; due day 1–28 only
- [ ] Total per month sums the estimates; share of take-home shows "—" until paychecks exist


#### P1-13 · Setup step 9: review and finish

**Spec:** §3 step 9  
**Blocked by:** P1-09, P1-10, P1-12

**Goal.** Review lists each step with Edit, Add now or Finish this; finishing goes to the dashboard (a placeholder until Phase 4).

**Tests to write first (red):**

- [ ] Review reflects saved, skipped and coming-soon steps correctly


#### P1-14 · JSON export and nightly backup export

**Spec:** §8 Privacy, §12  
**Blocked by:** P1-01

**Goal.** "Download my data" returns the household's full JSON export; a scheduled Lambda writes every household's export to a private, versioned, encrypted S3 bucket with 90-day expiry.

**Tests to write first (red):**

- [ ] Export includes every household-scoped table: a test compares the export's keys with the schema's table list and fails if one is missing
- [ ] Export for household A contains nothing from household B
- [ ] CDK assertion: bucket is private, versioned, encrypted, with a 90-day expiration rule; schedule runs daily

**Also done when:**

- [ ] Every later ticket that adds a table must add it to the export (the test enforces it)

**Find it in the console (learning):**

- [ ] EventBridge Scheduler: find the nightly schedule
- [ ] S3: find last night's export object and its versions


### Phase 2 — Bills and paychecks → `v0.2.0`

The "within means" core: openMonth, bills, cards, paychecks, other income, money in/out. **Real use in prod starts here, alongside the Google Sheet for one month.**


#### P2-01 · openMonth: generate bills

**Spec:** §4 Bill, §5.11  
**Blocked by:** P1-13

**Goal.** Extend `openMonth(ym)` to create one Bill per active recurring bill (at its estimate and due date) in the same transaction, with retry.

**Tests to write first (red):**

- [ ] Recurring bills with `start_ym > ym` or `end_ym < ym` are skipped
- [ ] Running `openMonth` twice creates no duplicate bills
- [ ] Ending a recurring bill never deletes past months' Bills


#### P2-02 · Paydays domain

**Spec:** §5.9  
**Blocked by:** P0-02

**Goal.** Pure functions for expected paydays per month: biweekly from the anchor, weekly, semimonthly (1st and 15th or next business day, configurable days), monthly.

**Tests to write first (red):**

- [ ] Biweekly anchored Fri Nov 6, 2026 → Nov 6 and Nov 20; December → Dec 4 and Dec 18 (T24 dates)
- [ ] Biweekly months with 3 paydays are detected (the "3 paydays" note)
- [ ] Semimonthly moves a weekend payday to the next business day
- [ ] Monthly uses the anchor's day of month


#### P2-03 · Pay schedules and paychecks

**Spec:** §4, §5.9  
**Blocked by:** P2-01, P2-02

**Goal.** Schema, repositories and procedures for PaySchedule and Paycheck; `openMonth` generates expected paychecks; mark received; stop and restart a schedule.

**Tests to write first (red):**

- [ ] T3: marking Nov 20 received at $3,248.60 replaces the expected amount (never adds both)
- [ ] Stopping a schedule removes future expected paychecks and keeps past ones
- [ ] Unique `(schedule_id, expected_date)` prevents duplicates


#### P2-04 · Other (one-time) income

**Spec:** §4 OtherIncome  
**Blocked by:** P1-01

**Goal.** Schema, repository, procedures and the one-time income list and form.

**Tests to write first (red):**

- [ ] Other income counts in the month of its date


#### P2-05 · Money in, money out, kept, status

**Spec:** §5.6  
**Blocked by:** P2-03, P2-04

**Goal.** Domain functions `moneyIn`, `moneyOut`, `kept`, `spentPct`, `status` (checking moves are 0 until Phase 3).

**Tests to write first (red):**

- [ ] T2: November paychecks + other income with Nov 20 still expected = $7,031.38
- [ ] T12: 85% → Within means, 86% → Tight, 100% → Tight, 101% → Over
- [ ] T11 (partial): March 2026 money out $7,480 vs money in → status Over
- [ ] Cards with no statement count $0 and are reported as missing


#### P2-06 · Bills & cash flow page

**Spec:** §6.2  
**Blocked by:** P2-05

**Goal.** Month navigator, tiles, weeks 1–4 with bill rows (paid toggle, edit, delete with confirm), one-time bill form, by category, paychecks card, "How {month} adds up", and the temporary "Open {month}" button.

**Tests to write first (red):**

- [ ] Bills group into the right week by due date
- [ ] Paid toggle sets `actual_cents` and `paid_at`; the tiles update
- [ ] "Open {month}" calls `openMonth` and is hidden once the month is open
- [ ] Main empty state shows when the month has no bills

**Also done when:**

- [ ] Matches `Bills.dc.html` at 1440 and 390


#### P2-07 · Credit cards and statements

**Spec:** §5.10, §3 step 6  
**Blocked by:** P2-06

**Goal.** CreditCard and CardStatement schema; statement rules; the credit card balances form on Bills; setup step 6.

**Tests to write first (red):**

- [ ] Planned payment > statement is rejected; minimum > statement is rejected
- [ ] T17: statement $1,471.60 paid $1,284.17 → next month's row shows "carries $187.43"
- [ ] Planned payment defaults from the usual plan (full / minimum / varies)
- [ ] No card number field exists anywhere


#### P2-08 · Recurring bills page and categories manager

**Spec:** §6.3  
**Blocked by:** P2-01

**Goal.** Bill list with add/edit/delete, end and restart, and the categories manager.

**Tests to write first (red):**

- [ ] Ending a bill keeps its history and stops it from future `openMonth` runs; restarting brings it back
- [ ] Category delete requires choosing where its bills move

**Also done when:**

- [ ] Matches `Recurring.dc.html`


#### P2-09 · Paychecks page and setup step 3

**Spec:** §6.4, §3 step 3  
**Blocked by:** P2-03, P2-04

**Goal.** Schedules, this month's paydays with mark received, one-time income, month navigator; setup step 3 with monthly estimate, 3-paydays note and next 3 paydays.

**Tests to write first (red):**

- [ ] Setup step 3 shows the next 3 paydays from the domain function
- [ ] Take-home must be > 0 and the date valid

**Also done when:**

- [ ] Matches `Paychecks.dc.html`


#### P2-10 · Quick Add: bill, other income, paycheck, card balance

**Spec:** §5.14, §6.9  
**Blocked by:** P2-06, P2-07, P2-09

**Goal.** The Quick Add modal with its first four types, reusing each page's form and procedure, and the "landed in week / month / page" confirmation.

**Tests to write first (red):**

- [ ] Each Quick Add type saves exactly the same record as its page form
- [ ] Confirmation names the right week and month and uses `role="status"`

**Also done when:**

- [ ] Matches `QuickAdd.dc.html`


#### P2-11 · Dev seed script (§10 data, part 1)

**Spec:** §10  
**Blocked by:** P2-05

**Goal.** `pnpm seed:dev` loads "Our household", John and a partner, the 12 recurring bills, Main job, November paychecks and other income. Refuses to run unless the stage is `dev`.

**Tests to write first (red):**

- [ ] Seed refuses with a non-dev stage
- [ ] Seeded November reproduces T2 through the real repositories


#### P2-12 · Release v0.2.0: real data rules

**Spec:** §12  
**Blocked by:** P2-10, P2-11

**Goal.** Before real data goes in: release checklist, migration rules in `CLAUDE.md`, prod pipeline backup-before-migrate verified, side-by-side comparison sheet for one month.

**Tests to write first (red):**

- [ ] Prod pipeline fails if the pre-migration backup job fails

**Also done when:**

- [ ] `docs/runbooks/release.md` written
- [ ] You complete setup in prod with your real data and start the side-by-side month


### Phase 3 — Investments and money moves → `v0.3.0`

Holdings, options, dividends, splits, weekly money moves with carry-over, reinvest suggestions, bills covered.


#### P3-01 · Holdings, prices and share trades

**Spec:** §4, §5.8 brokerage, §3 step 7  
**Blocked by:** P2-12

**Goal.** Holding and ShareTrade schema; brokerage value and cash domain; `PriceSource` interface with the manual source; holdings table on Accounts; setup step 7.

**Tests to write first (red):**

- [ ] Brokerage value = Σ shares × price + brokerage cash
- [ ] A buy changes shares and cash in one transaction; a buy above available cash shows a warning
- [ ] Ticker 1–6 letters, stored upper case; shares up to 6 decimals


#### P3-02 · Options trades and lifecycle

**Spec:** §5.3  
**Blocked by:** P3-01

**Goal.** OptionTrade schema and the expired / closed / rolled / assigned actions.

**Tests to write first (red):**

- [ ] T14: AMD put, premium $246 opened Nov 10, bought back $96 on Nov 18 → week 2 options +$246, week 3 −$96
- [ ] Rolling closes the old trade at a cost and opens a linked new trade whose premium counts in its own week
- [ ] T15: assigned leaves holdings unchanged and returns a "record the shares" prompt


#### P3-03 · Dividend payments and the daily week grid

**Spec:** §5.3, §6.6  
**Blocked by:** P3-01

**Goal.** DividendPayment schema; single-payment entry; the Mon–Fri grid for daily payers where saving replaces that week's days.

**Tests to write first (red):**

- [ ] Saving a week grid replaces only that ticker's payments in that week
- [ ] A daily payer's payments count as `weekly` income


#### P3-04 · Investment income by week and type

**Spec:** §5.3  
**Blocked by:** P3-02, P3-03

**Goal.** Domain function returning income per week per type for a month, from options, dividends and buy-backs.

**Tests to write first (red):**

- [ ] November seed totals: options $960.00, weekly/daily $278.73, monthly $674.45 (total $1,913.18)
- [ ] When buy-backs exceed premiums in a week, options show negative and that week's new move amounts are $0


#### P3-05 · Splits, Allocation settings and setup step 8

**Spec:** §5.2, §6.7, §3 step 8  
**Blocked by:** P2-12

**Goal.** SplitSetting schema, `splitsFor(ym, type)`, "Apply from", the Allocation settings page and setup step 8 presets.

**Tests to write first (red):**

- [ ] T13: splits saved in 2025-07 changing weekly checking 30% → 25% → Jan–Jun 2025 use 30%, Jul onward 25%
- [ ] Each type's four percentages must total 100; the remainder shows live
- [ ] Presets Balanced / Build savings / Reinvest more match §3

**Also done when:**

- [ ] Matches `Settings.dc.html`


#### P3-06 · Money moves math

**Spec:** §5.4  
**Blocked by:** P3-04, P3-05

**Goal.** Domain: new, available, moved, carry-out per week and bucket, with the rounding rule.

**Tests to write first (red):**

- [ ] T4: November week 3 available = savings $71.76, checking $50.93, reinvest weekly $14.20, reinvest monthly $140.25 (total $277.14)
- [ ] T7: moving $13.85 of $14.20 carries $0.35 into week 4
- [ ] Rounding leftover cent goes to the bucket with the largest share
- [ ] Moving more than available is rejected


#### P3-07 · Reinvest buy suggestions

**Spec:** §5.5  
**Blocked by:** P3-01

**Goal.** Domain: variety, then volume, then upgrade.

**Tests to write first (red):**

- [ ] T5: reinvest weekly $14.20 → "Buy 1 YMAX = $13.85 · $0.35 stays"
- [ ] T6: reinvest monthly $140.25 → "Buy 1 JEPQ, 1 BTCI, 1 EGGY, 4 CONY = $134.07 · $6.18 stays (4 of 4 tickers · 7 shares)"
- [ ] No affordable ticker → "Not enough for a share; carries over"; zero-price holdings ignored


#### P3-08 · Recording money moves

**Spec:** §5.4  
**Blocked by:** P3-06, P3-07

**Goal.** MoneyMove schema and procedures: check off (moved = available), "Moved a different amount", uncheck, and "Use" from a suggestion, each in one transaction.

**Tests to write first (red):**

- [ ] T16: "Use" sets the move amount and leaves `Holding.shares` unchanged
- [ ] Unchecking deletes the moved amount
- [ ] Unique `(ym, week, bucket)` per household


#### P3-09 · Investment income page and sidebar money-moves card

**Spec:** §6.6, §5.4  
**Blocked by:** P3-08

**Goal.** Tabs (Options, Weekly & daily, Monthly), money moves week cards with carry-in and carry-out, prices panel with "updated n days ago", and the sidebar "This week's money moves" card.

**Tests to write first (red):**

- [ ] Sidebar card shows "{done} of 4 done · ${total} ready to move" for the current week
- [ ] Current week's card starts open

**Also done when:**

- [ ] Matches `Income.dc.html`


#### P3-10 · Checking moves in money in, and bills covered

**Spec:** §5.6, §5.7  
**Blocked by:** P3-08

**Goal.** Money in now includes actual checking moves; the bills-covered ladder and planned projection.

**Tests to write first (red):**

- [ ] T8: Nov checking moved $358.05 → money in $7,389.43; money out $5,639.57; kept $1,749.86; 76%; Within means
- [ ] T9: $358.05 covers 6 of 12 bills fully; Phone partial $89.05 of $95; 13% of $2,750
- [ ] T10: planned checking share for November = $396.57
- [ ] T11: March 2026 moved to checking $357.00 → money in $6,557; kept −$923; Over (114%)


#### P3-11 · Quick Add: dividend, options, account balance, buy/sell

**Spec:** §5.14  
**Blocked by:** P3-09, P2-10

**Goal.** The remaining four Quick Add types.

**Tests to write first (red):**

- [ ] Each type saves the same record as its page form and reports where it landed


#### P3-12 · Dev seed script (part 2) and release v0.3.0

**Spec:** §10  
**Blocked by:** P3-10, P3-11

**Goal.** Seed holdings, November investment income, October carry-in and splits; release `v0.3.0` and start the side-by-side month for money moves.

**Tests to write first (red):**

- [ ] Seeded data reproduces T4–T10 through the real API


### Phase 4 — Dashboard, accounts and months → `v0.4.0`

The dashboard with This week, the Accounts page with forecast and reconcile, the Start-a-new-month flow, locking and Unlock.


#### P4-01 · Year totals domain

**Spec:** §5.6, §6.1  
**Blocked by:** P3-12

**Goal.** Year aggregates: totals, verdict banner text, savings rate, month-by-month table rows, changes vs previous month.

**Tests to write first (red):**

- [ ] Verdict text matches the §5.6 template for a seeded year
- [ ] Year totals equal the sum of the months


#### P4-02 · Dashboard page

**Spec:** §6.1  
**Blocked by:** P4-01

**Goal.** Header with year switcher, verdict banner, year tiles, month view, money in vs out chart, bills paid by investments, investment income by type, where it went, month-by-month table.

**Tests to write first (red):**

- [ ] Clicking a month in the chart selects it in the month view
- [ ] Next year shows its empty state; charts have text equivalents

**Also done when:**

- [ ] Matches `Main.dc.html` at 1440 and 390


#### P4-03 · Accounts page and Update balance reconcile

**Spec:** §5.8, §6.5  
**Blocked by:** P3-12

**Goal.** Account tiles, Update balance with the expected-vs-entered gap and its two choices, add account.

**Tests to write first (red):**

- [ ] A −$14.80 gap offers logging a one-time bill or accepting the new balance
- [ ] Expected balance = last snapshot + recorded flows since

**Also done when:**

- [ ] Matches `Accounts.dc.html`


#### P4-04 · Checking forecast

**Spec:** §5.8  
**Blocked by:** P4-03

**Goal.** Domain forecast to month end + 2 weeks, lowest point vs cushion, late-paycheck what-if; chart on Accounts and the forecast line on the dashboard.

**Tests to write first (red):**

- [ ] Lowest point and the "above / below your cushion" text are correct for a seeded case
- [ ] The late-paycheck toggle shifts only the next payday by 7 days


#### P4-05 · This week: dueSoon()

**Spec:** §5.13  
**Blocked by:** P4-02, P4-04

**Goal.** Pure `dueSoon(household, today)` and the This week panel with Mark paid, Mark received, Open and Enter balance actions.

**Tests to write first (red):**

- [ ] With today Wed Nov 18, 2026 and the seed, the list contains the Nov 20 paycheck and the bills due Nov 18–25
- [ ] A card 3+ days past its usual statement date with no statement appears as missing
- [ ] Checking or savings not updated for more than 7 days appears as "Balances out of date"
- [ ] Empty list shows "Nothing due this week"


#### P4-06 · Start a new month flow

**Spec:** §5.11, §6.8  
**Blocked by:** P4-02

**Goal.** The 4-step flow: wrap up, what carries over, preview, start. Start closes this month and calls `openMonth` for the next, writing CarryIn. Removes the temporary "Open {month}" button.

**Tests to write first (red):**

- [ ] T24: Start December closes and locks November; CarryIn(Dec) equals November's week-4 carry-out per bucket; December bills and paychecks (Dec 4, Dec 18) are generated
- [ ] Wrap-up choices (mark paid, move to next month, drop) apply in the same transaction

**Also done when:**

- [ ] Matches `StartMonth.dc.html`


#### P4-07 · Closed months, Unlock and carry recalculation

**Spec:** §5.11  
**Blocked by:** P4-06

**Goal.** Closed months are read-only everywhere; Unlock on Bills reopens one month; carry-ins recalculate when an unlocked month is edited and locked again.

**Tests to write first (red):**

- [ ] Every write procedure rejects changes to a closed month
- [ ] Editing an unlocked month and re-locking updates the next month's CarryIn


#### P4-08 · Future month preview

**Spec:** §5.11  
**Blocked by:** P4-06

**Goal.** A not-started month shows "Not started" and a preview from recurring bills and schedules, without creating rows.

**Tests to write first (red):**

- [ ] Previewing a future month writes nothing to the database


### Phase 5 — Year in review → `v0.5.0`

Year in review with projections, and the in-browser PDF.


#### P5-01 · Year in review domain and projections

**Spec:** §5.12  
**Blocked by:** P4-07

**Goal.** Pure functions for every Year in review section, with projected future months using a constant 3-month window.

**Tests to write first (red):**

- [ ] T22: 2026 with December projected → 11 of 12 within means; kept $13,034; money in $81,773; investment income $21,818
- [ ] T23: 2025 → August Over (−$200); 11 of 12 within means; kept $9,293
- [ ] Highlights pick the best and toughest months correctly


#### P5-02 · Year in review page

**Spec:** §5.12, §6.11  
**Blocked by:** P5-01

**Goal.** All sections from §5.12 with projected months dashed and marked "projected".

**Tests to write first (red):**

- [ ] Clicking a month in the kept chart shows its details
- [ ] Current year shows as a preview

**Also done when:**

- [ ] Matches `YearEnd.dc.html`


#### P5-03 · Download PDF in the browser

**Spec:** §5.12  
**Blocked by:** P5-02

**Goal.** A tested PDF content model and `@react-pdf/renderer` output with the app's fonts and colors; the current year is watermarked "Preview".

**Tests to write first (red):**

- [ ] Content model for 2025 contains every section with the T23 numbers
- [ ] Playwright: clicking Download PDF produces a file whose text includes the year and "Preview" for the current year


### Phase 6 — Phone polish and empty states → `v1.0.0`

The phone-only flows, bottom sheets, remaining empty states and the accessibility audit.


#### P6-01 · Phone Home

**Spec:** §6.15 (1)  
**Blocked by:** P5-03

**Goal.** Month verdict with in / out / kept and spent bar, forecast line, This week with inline actions.

**Tests to write first (red):**

- [ ] At 390px, Home shows the verdict and This week actions work

**Also done when:**

- [ ] Matches `Phone.dc.html`


#### P6-02 · Phone paycheck "It landed" sheet

**Spec:** §6.15 (2)  
**Blocked by:** P6-01

**Goal.** Bottom sheet with large amount, date and Mark received; afterwards the new money-in total, difference from expected, and Undo.

**Tests to write first (red):**

- [ ] Undo restores the expected paycheck exactly


#### P6-03 · Phone Log income

**Spec:** §6.15 (3)  
**Blocked by:** P6-01

**Goal.** Type tabs, ticker chips, Mon–Fri grid, large amount field, "Same as Tue" chips, live split preview; options flow to strike and expiration.

**Tests to write first (red):**

- [ ] "Same as Tue" copies Tuesday's amount into the chosen day
- [ ] Live split preview uses `splitsFor` for the entry's month


#### P6-04 · Phone Money moves

**Spec:** §6.15 (4)  
**Blocked by:** P6-01

**Goal.** Amount left to move with progress bar, 4 checkable moves with suggestions and "Moved a different amount".

**Tests to write first (red):**

- [ ] Checking a move on phone records the same MoneyMove as desktop


#### P6-05 · Bottom-sheet forms

**Spec:** §6.15  
**Blocked by:** P6-01

**Goal.** Every form opens as a bottom sheet on phone with numeric keyboards.

**Tests to write first (red):**

- [ ] Every money input has `inputmode="decimal"`


#### P6-06 · Empty-state previews, section states, first-month checklist

**Spec:** §6.14  
**Blocked by:** P6-01

**Goal.** Faded dashed previews with $0.00, every section state, and the dashboard's "Your first month" checklist.

**Tests to write first (red):**

- [ ] No page shows a blank number or an endless spinner with an empty household
- [ ] Checklist items tick off as each first action happens

**Also done when:**

- [ ] Matches `EmptyStates.dc.html`


#### P6-07 · Accessibility audit and PWA polish

**Spec:** §7 Accessibility, §8  
**Blocked by:** P6-02, P6-03, P6-04, P6-05, P6-06

**Goal.** axe checks in Playwright on every page at both widths, contrast and touch-target fixes, install prompt and icons.

**Tests to write first (red):**

- [ ] axe reports no serious or critical issues on any page
- [ ] Touch targets are at least 44px

**Also done when:**

- [ ] Release `v1.0.0`

---

## 9. Definition of done (every ticket)

- [ ] The ticket's **tests to write first** exist, were committed failing (`test:` commit), and now pass.
- [ ] Coverage gates and dependency rules pass; Stryker passes if `packages/domain` changed.
- [ ] New repository functions are in the isolation suite; new write procedures are in the T21 view-only table; new tables are in the JSON export.
- [ ] Screens: work at 1440px and 390px, have their main empty state, and were compared side by side with the `design/` artboard (screenshots in the PR).
- [ ] Infra: CDK assertion tests pass, and the ticket's console checklist is done.
- [ ] No amounts in logs; no `Date` in `domain`; money in cents.
- [ ] PR merged; dev deploy, DSQL conformance and Playwright smoke green.

---

## 10. Working with this plan in Claude Code (VS Code)

### 10.1 One-time setup on your PC (Windows)

1. **Install the tools:**
   - Git for Windows (Claude Code on Windows uses its Bash)
   - Node.js 24 LTS, then `corepack enable` (turns on pnpm)
   - Docker Desktop, with the WSL 2 backend (needed for the Postgres test containers)
   - AWS CLI v2
   - GitHub CLI, then `gh auth login`
   - VS Code
2. **Install the Claude Code extension:** in VS Code press `Ctrl+Shift+X`, search **Claude Code** (publisher Anthropic), click Install, then open it from the Spark icon and sign in with your Claude account. For `claude` in the integrated terminal as well, install the standalone CLI.
3. **Recommended extensions:** ESLint, Prettier, Vitest, Playwright Test for VS Code, GitHub Pull Requests, Docker.
4. **Open the repo folder itself:** `File → Open Folder… → C:\dev\WithinMeans\withinmeans`. Open the repo, not its parent, so Claude Code loads the repo's `CLAUDE.md`, `.claude/settings.json` and the `/work-ticket` skill.
5. **Start each conversation in plan mode:** VS Code settings (`Ctrl+,`) → Extensions → Claude Code → *Initial Permission Mode* → `plan`. Every new ticket then starts with a plan you approve before any file changes.
6. **Install the repo's Claude Code tooling once:** in a terminal at the repo root run `node scripts/install-tooling.mjs`. It moves `.claude/settings.json`, the `/work-ticket` skill and the PR template from `setup/` into place. Then commit everything (`git add -A && git commit -m "docs: development plan, rules and tooling" && git push`).
7. **Create the GitHub issues once:** in a terminal at the repo root run `node scripts/create-issues.mjs`. It uses your `gh` login to create the phase labels, the 7 milestones and the 69 issues, then links each *Blocked by* to real issue numbers. Safe to re-run: it skips tickets that already exist.
8. **Turn on the run-on-save test view:** in the Testing sidebar, run Vitest in watch mode. You'll see red turn green as Claude works.

### 10.2 The ticket loop

One ticket = one conversation = one branch = one PR. Fresh conversations keep Claude focused and stop old context from leaking in.

1. **Open a new conversation:** the `+` in the Claude panel, or Command Palette → *Claude Code: Open in New Tab*.
2. **Start the ticket:** type `/work-ticket P2-06` (the ticket ID; the GitHub issue number works too). The skill tells Claude to:
   - read the issue, the spec sections it cites, the `design/` artboard and `CLAUDE.md`;
   - make a branch named after the ticket (e.g. `p2-06-bills-page`);
   - write a plan for you.
3. **Review the plan.** It opens as a Markdown document; add inline comments where something's wrong, then approve. This is the cheapest moment to steer.
4. **Red.** Claude writes the ticket's tests first, runs them, shows them failing and commits them as `test: …`. **Read the test names against the ticket.** This is your most important review: if the tests are right, the code will be right.
5. **Green.** Claude implements until the tests pass and the coverage gates hold, then commits `feat: …`, and refactors if useful.
6. **Look at screens yourself.** For UI tickets, ask Claude to start the dev server (`pnpm dev`). Open the page and the matching `design/*.dc.html` side by side at full width, then narrow the window to phone width.
7. **Open the PR.** Say "create a PR for this ticket". Claude uses `gh` and fills in the template, and CI runs. Merge with **Rebase and merge** so the `test:` → `feat:` commits stay visible on `main`.
8. **After merge,** watch the dev deploy in GitHub Actions. For infra tickets, do the console checklist and ask Claude to explain anything you see there.

### 10.3 Useful features

| Feature | How | Use it for |
|---|---|---|
| @-mentions | Type `@` then a file name, e.g. `@docs/SPEC.md`, `@design/Bills.dc.html` | Pointing Claude at the exact spec section or artboard |
| Selection reference | Select code, press `Alt+K` | "Why does this line round this way?" |
| Terminal output | `@terminal:<name>` | Feeding it a failing test run or a CDK error without copy-paste |
| Plan mode | `/plan` or the mode indicator at the bottom of the prompt box | Any change bigger than a one-liner |
| Checkpoints | Hover a message → **Rewind code to here** | Undoing a wrong turn without losing the conversation |
| Fork | Hover a message → **Fork conversation from here** | Trying an alternative approach |
| Resume | Sessions list in the Spark icon in the Activity Bar | Picking a ticket back up the next day |
| Focus switch | `Ctrl+Esc` | Jump between the editor and the Claude prompt |

### 10.4 Permission modes: how much to let it do

- **Phase 0:** start in plan mode, then **Manual** (Claude asks before each edit and command) so you see every file and command while you learn the layout.
- **Phase 1 onward:** **Edit automatically** is fine for file edits. Commands are still governed by `.claude/settings.json`.
- **Never** use bypass mode on this repo.

`.claude/settings.json` (already in the repo) pre-approves the safe commands: `pnpm test`, `coverage`, `lint`, `typecheck`, `cdk synth` and `cdk diff`, read-only `git`, and `gh issue view/list` and `gh pr view/checks`. Everything else asks you first. It **denies**:

- reading `.env*`;
- `cdk deploy` or `cdk destroy` against prod, and anything with `--stage prod`;
- `git push --force`;
- `aws` delete, remove and terminate commands.

Prod is deployed only by the tag workflow.

### 10.5 AWS work through Claude

- Claude can run `cdk synth` and `cdk diff` against dev with your `withinmeans` AWS profile, and `cdk deploy` to dev **after you approve the command**.
- Never paste AWS keys or Cognito passwords into the chat. Sign in with `aws login` or SSO in the terminal yourself.
- For learning, ask: *"Explain what this stack creates, what each resource costs, and where I find it in the console."* Then do the console checklist.

### 10.6 When things go wrong

- **A bug:** "Write a failing test that reproduces this, then fix it." Never fix first.
- **Going in circles:** stop (`Esc`), rewind to the last good checkpoint, and restart the step with a sharper prompt or a fresh conversation.
- **A DSQL-only failure** (passes on Postgres, fails in conformance): add the case to the migration linter or the repository suite first, so Postgres catches it next time.
- **The spec is wrong or unclear:** don't let Claude guess. Decide, update the spec and the ticket, then continue.

### 10.7 Prompts worth reusing

- `/work-ticket <ticket ID or issue number>`: the whole loop above.
- "What's the next unblocked ticket?" Claude checks open issues and their *Blocked by* lines with `gh`.
- "Review this branch against the ticket and `CLAUDE.md` before I open the PR."
- "Show me the coverage report for `packages/domain` and any surviving Stryker mutants."
