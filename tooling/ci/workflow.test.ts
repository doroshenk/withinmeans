import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../..', import.meta.url));

function read(path: string): string {
  const full = `${root}/${path}`;
  expect(existsSync(full), `${path} must exist`).toBe(true);
  return readFileSync(full, 'utf8');
}

interface Step {
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}
interface Job {
  needs?: string | string[];
  if?: string;
  steps?: Step[];
  outputs?: Record<string, string>;
}
interface Workflow {
  on: Record<string, unknown>;
  concurrency?: { group?: string; 'cancel-in-progress'?: unknown };
  jobs: Record<string, Job>;
}

const workflow = (): Workflow => parse(read('.github/workflows/ci.yml')) as Workflow;
const runs = (job: Job | undefined): string[] =>
  (job?.steps ?? []).flatMap((s) => (s.run ? [s.run.trim()] : []));
const allRuns = (): string[] => Object.values(workflow().jobs).flatMap(runs);
function job(name: string): Job {
  const found = workflow().jobs[name];
  if (!found) expect.fail(`job "${name}" must exist in ci.yml`);
  return found;
}
const needs = (job: Job): string[] => [job.needs ?? []].flat();

describe('CI workflow (P0-03)', () => {
  it('runs on every pull request and on pushes to main', () => {
    const on = workflow().on;
    expect(on).toHaveProperty('pull_request');
    expect(on).toHaveProperty('push');
  });

  it('cancels superseded runs on the same PR', () => {
    const c = workflow().concurrency;
    expect(c?.group).toContain('github.ref');
    expect(c?.['cancel-in-progress']).toBeTruthy();
  });

  it('runs exactly the local scripts: lint, typecheck, test, coverage', () => {
    const r = allRuns();
    for (const cmd of ['pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm coverage']) {
      expect(r, cmd).toContain(cmd);
    }
  });

  it('installs from the lockfile, with pnpm and Node versions taken from the repo', () => {
    const text = read('.github/workflows/ci.yml');
    expect(allRuns()).toContain('pnpm install --frozen-lockfile');
    expect(text).toContain('pnpm/action-setup');
    expect(text).toContain('node-version-file: .nvmrc');
    expect(text).toMatch(/cache:\s*pnpm/);
    expect(text).not.toMatch(/^\s*version:\s*\d/m);
  });

  it('has a CDK synth job that tolerates an infra package with no synth script yet', () => {
    const synth = workflow().jobs['cdk-synth'];
    expect(runs(synth).join('\n')).toMatch(/pnpm --filter \S*infra --if-present synth/);
  });

  it('runs the Stryker mutation job only when packages/domain changes', () => {
    const mutation = job('mutation');
    expect(needs(mutation)).toContain('changes');
    expect(mutation.if ?? '').toContain('needs.changes.outputs.domain');
    expect(runs(mutation).join('\n')).toContain('mutation');
    expect(read('.github/workflows/ci.yml')).toContain('packages/domain/**');
  });

  it('has one always-running ci-gate job that is the single required check', () => {
    const gate = job('ci-gate');
    expect(gate.if ?? '').toContain('always()');
    const others = Object.keys(workflow().jobs).filter((j) => j !== 'ci-gate');
    expect(needs(gate).sort()).toEqual(others.sort());
    // a skipped mutation job counts as a pass; a failed or cancelled one does not
    const script = runs(gate).join('\n');
    expect(script).toContain('failure');
    expect(script).toContain('cancelled');
    expect(script).not.toContain('skipped');
  });
});

describe('T-CI1: domain coverage below 100% fails the check', () => {
  it('domain vitest config gates lines, statements, functions and branches at 100', () => {
    const cfg = read('packages/domain/vitest.config.ts');
    for (const k of ['lines', 'statements', 'functions', 'branches']) {
      expect(cfg).toMatch(new RegExp(`${k}:\\s*100`));
    }
  });

  it('CI runs pnpm coverage, which runs the domain gate', () => {
    expect(allRuns()).toContain('pnpm coverage');
    const pkg = JSON.parse(read('packages/domain/package.json')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['coverage']).toContain('--coverage');
  });
});

describe('T-CI2: Stryker fails below a 90% mutation score', () => {
  interface Stryker {
    testRunner?: string;
    mutate?: string[];
    thresholds?: { break?: number };
  }
  const config = (): Stryker => JSON.parse(read('packages/domain/stryker.config.json')) as Stryker;

  it('breaks the build below 90', () => {
    expect(config().thresholds?.break).toBeGreaterThanOrEqual(90);
  });

  it('uses the vitest runner and mutates domain source but not tests', () => {
    expect(config().testRunner).toBe('vitest');
    expect(config().mutate).toContain('src/**/*.ts');
    expect(config().mutate).toContain('!src/**/*.test.ts');
  });

  it('domain exposes a mutation script that runs stryker', () => {
    const pkg = JSON.parse(read('packages/domain/package.json')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['mutation'] ?? '(missing)').toContain('stryker run');
  });
});

describe('branch protection script', () => {
  it('requires a PR and the ci-gate check, and applies to admins', () => {
    const s = read('scripts/protect-main.sh');
    expect(s).toContain('branches/main/protection');
    expect(s).toContain('ci-gate');
    expect(s).toContain('required_pull_request_reviews');
    expect(s).toMatch(/enforce_admins['"]?\s*[:=]\s*true/);
  });
});
