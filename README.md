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

Docker Desktop must be running once repository tests arrive (Testcontainers, from P0-07 onward).

## Layout

`packages/domain` (pure rules), `db`, `api`, `web`, `infra`. `tooling/` holds tests for the repo's own rules (dependency-cruiser).
