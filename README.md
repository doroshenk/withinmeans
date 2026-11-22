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

```bash
# one-time, with your AWS profile signed in (dev only; never deploy prod from a laptop)
pnpm --filter @withinmeans/infra cdk deploy DataStack-dev CiStack --context stage=dev
pnpm migrate --stage dev    # reads the endpoint from the stack output, applies new migrations
```

`pnpm migrate --stage prod` is refused: prod migrates only from the tag workflow.

**Conformance run.** After each merge to `main`, `.github/workflows/conformance.yml` runs the repository suite on the real dev cluster (each test file in its own throwaway schema, dropped afterwards). To run it from your laptop: `DSQL_ENDPOINT=<host from the stack output> pnpm --filter @withinmeans/db conformance`.

## Layout

`packages/domain` (pure rules), `db`, `api`, `web`, `infra`. `tooling/` holds tests for the repo's own rules (dependency-cruiser).
