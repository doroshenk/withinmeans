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

## Layout

`packages/domain` (pure rules), `db`, `api`, `web`, `infra`. `tooling/` holds tests for the repo's own rules (dependency-cruiser).
