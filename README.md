# Within Means

Personal finance site (bills, paychecks, investment income) for one household. See `CLAUDE.md`, `docs/SPEC.md`, `docs/PLAN.md` and `docs/adr/`.

## Local setup

1. Install **Node 24** (`.nvmrc` pins it; with nvm: `nvm use`).
2. Install **pnpm 10**: `npm install -g pnpm@10` (or `corepack enable` from an admin shell).
3. `pnpm install`
4. Check everything works:

```bash
pnpm test        # unit and integration tests
pnpm lint        # ESLint + Prettier + dependency-cruiser
pnpm typecheck
pnpm coverage    # per-package coverage gates
```

**Docker Desktop must be running** to run the repository and isolation tests in `packages/db`: they start a Postgres 16 container with Testcontainers (the first run pulls the image). Set `TEST_DATABASE_URL` to use an existing Postgres instead (for example a CI service). Each test file gets its own freshly migrated schema.

## Database (Aurora DSQL)

Each stage (`dev`, `prod`) has its own DSQL cluster, created by the CDK `DataStack-<stage>`.

Sign in first, in a normal PowerShell window (`aws login` needs a real console; see `docs/runbooks/aws-account.md`): `aws login --profile withinmeans --region us-east-2`, then sign in as the IAM user `withinmeans-admin` with its password and MFA code. Check with `aws sts get-caller-identity --profile withinmeans`.

```powershell
# one-time (dev only; never deploy prod from a laptop). cdk is a bin, so use `exec`.
$env:AWS_PROFILE = "withinmeans"
pnpm --filter @withinmeans/infra exec cdk deploy DataStack-dev --context stage=dev
pnpm migrate --stage dev    # reads the endpoint from the stack output, applies new migrations
```

`pnpm migrate` connects as the DSQL `admin` user with an IAM token made from your own AWS credentials, so the signed-in profile needs `dsql:DbConnectAdmin` on the dev cluster and `cloudformation:DescribeStacks` on `DataStack-dev` (an administrator profile has both). Aurora DSQL allows one DDL statement per transaction, so the runner applies a DDL migration statement by statement and records it afterwards: write DDL migrations to be re-runnable (`CREATE TABLE IF NOT EXISTS`).

The merged `0001_core.sql` uses plain `CREATE TABLE` and can't be edited. If the very first `pnpm migrate --stage dev` fails part-way, drop the tables it created (in the Aurora DSQL query editor, one `DROP TABLE` at a time) and run it again.

`pnpm migrate --stage prod` is refused: prod migrates only from the tag workflow.

**Conformance run.** After each merge to `main`, `.github/workflows/conformance.yml` runs the repository suite on the real dev cluster (each test file in its own throwaway schema, dropped afterwards). To run it from your laptop: `DSQL_ENDPOINT=<host from the stack output> pnpm --filter @withinmeans/db conformance`.

## Layout

`packages/domain` (pure rules), `db`, `api`, `web`, `infra`. `tooling/` holds tests for the repo's own rules (dependency-cruiser).
