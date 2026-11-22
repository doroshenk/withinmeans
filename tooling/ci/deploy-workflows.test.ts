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
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}
interface Job {
  uses?: string;
  with?: Record<string, unknown>;
  secrets?: unknown;
  permissions?: Record<string, string>;
  steps?: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: unknown };
  jobs: Record<string, Job>;
}

const load = (file: string): Workflow => parse(read(`.github/workflows/${file}`)) as Workflow;
const steps = (file: string): Step[] =>
  Object.values(load(file).jobs).flatMap((j) => j.steps ?? []);
/** Index of the first step whose command (or action) contains `text`; fails if there is none. */
function at(file: string, text: string): number {
  const i = steps(file).findIndex((s) => `${s.run ?? ''}${s.uses ?? ''}`.includes(text));
  expect(i, `a step containing "${text}" in ${file}`).toBeGreaterThanOrEqual(0);
  return i;
}

describe('P0-13: deploy-dev.yml (merge to main deploys dev)', () => {
  const file = 'deploy-dev.yml';

  it('P0-13: runs on pushes to main only, never on pull requests or tags', () => {
    const on = load(file).on as { push?: { branches?: string[]; tags?: string[] } };
    expect(on).not.toHaveProperty('pull_request');
    expect(on.push?.branches).toEqual(['main']);
    expect(on.push?.tags).toBeUndefined();
  });

  it('P0-13: calls the shared deploy workflow for stage dev with the repo secrets', () => {
    const job = Object.values(load(file).jobs)[0];
    expect(job?.uses).toBe('./.github/workflows/deploy.yml');
    expect(job?.with).toMatchObject({ stage: 'dev' });
    expect(job?.secrets).toBe('inherit');
    expect(job?.permissions).toMatchObject({ 'id-token': 'write', contents: 'read' });
  });
});

describe('P0-13: deploy-prod.yml (a v* tag deploys prod)', () => {
  const file = 'deploy-prod.yml';

  it('P0-13: runs on v* tags only', () => {
    const on = load(file).on as { push?: { branches?: string[]; tags?: string[] } };
    expect(on).not.toHaveProperty('pull_request');
    expect(on.push?.tags).toEqual(['v*']);
    expect(on.push?.branches).toBeUndefined();
  });

  it('P0-13: calls the shared deploy workflow for stage prod with the repo secrets', () => {
    const jobs = Object.values(load(file).jobs);
    const caller = jobs.find((j) => j.uses !== undefined);
    expect(caller?.uses).toBe('./.github/workflows/deploy.yml');
    expect(caller?.with).toMatchObject({ stage: 'prod' });
    expect(caller?.secrets).toBe('inherit');
    expect(caller?.permissions).toMatchObject({ 'id-token': 'write', contents: 'read' });
  });

  it('P0-13: refuses a tag that is not on main, before anything is deployed', () => {
    const jobs = load(file).jobs;
    const guard = Object.entries(jobs).find(([, j]) => j.uses === undefined);
    expect(guard, 'a guard job').toBeDefined();
    const script = (guard?.[1].steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(script).toMatch(/merge-base --is-ancestor/);
    expect(script).toMatch(/origin\/main/);
    const caller = Object.values(jobs).find((j) => j.uses !== undefined) as
      (Job & { needs?: string | string[] }) | undefined;
    expect([caller?.needs ?? []].flat()).toContain(guard?.[0]);
  });
});

describe('P0-13: deploy.yml (shared by both stages)', () => {
  const file = 'deploy.yml';
  const text = (): string => read(`.github/workflows/${file}`);

  it('P0-13: is reusable and takes the stage as an input', () => {
    const on = load(file).on as { workflow_call?: { inputs?: { stage?: { required?: boolean } } } };
    expect(on.workflow_call?.inputs?.stage?.required).toBe(true);
  });

  it('P0-13: authenticates with OIDC only; no stored AWS keys', () => {
    expect(text()).toContain('id-token: write');
    expect(text()).toContain('aws-actions/configure-aws-credentials');
    expect(text()).toContain('vars.AWS_DEPLOY_ROLE_ARN');
    expect(text()).not.toMatch(/AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID/);
  });

  it('P0-13: runs one deploy per stage at a time and never cancels one midway', () => {
    const c = load(file).concurrency;
    expect(c?.group).toContain('inputs.stage');
    expect(c?.['cancel-in-progress']).toBe(false);
  });

  it('P0-13: deploys the stacks of the chosen stage only', () => {
    const deploys = steps(file).filter((s) => (s.run ?? '').includes('cdk deploy'));
    expect(deploys.length).toBeGreaterThanOrEqual(2);
    for (const d of deploys) {
      expect(d.run).toContain('--context stage=${{ inputs.stage }}');
      expect(d.run).toContain('--require-approval never');
    }
    expect(text()).not.toMatch(/DataStack-(dev|prod)\b/);
  });

  it('P0-13: builds the web app with the stage Cognito pool before the website stack uploads it', () => {
    const build = at(file, '@withinmeans/web build');
    const buildStep = steps(file)[build];
    expect(buildStep?.run).toMatch(/VITE_USER_POOL_ID/);
    expect(buildStep?.run).toMatch(/VITE_USER_POOL_CLIENT_ID/);
    expect(buildStep?.run).toContain('AuthStack-${{ inputs.stage }}');
    expect(at(file, 'WebStack-${{ inputs.stage }}')).toBeGreaterThan(build);
  });

  it('P0-13: takes an on-demand backup before migrations, for prod only', () => {
    const backup = steps(file)[at(file, 'scripts/backup-now.sh')];
    expect(backup?.run).toContain('backup-now.sh prod');
    expect(backup?.if).toContain("inputs.stage == 'prod'");
    expect(at(file, 'scripts/backup-now.sh')).toBeLessThan(at(file, 'pnpm migrate'));
  });

  it('P0-13: migrates the chosen stage after the deploy, then smoke-tests last', () => {
    const migrate = at(file, 'pnpm migrate');
    expect(steps(file)[migrate]?.run).toContain('pnpm migrate --stage ${{ inputs.stage }}');
    expect(migrate).toBeGreaterThan(at(file, 'cdk deploy'));
    expect(at(file, 'playwright test')).toBeGreaterThan(migrate);
  });

  it('P0-13: the dev smoke test signs in with the dev test user from secrets, at the dev address', () => {
    const smoke = steps(file).find(
      (s) => (s.run ?? '').includes('playwright test') && (s.if ?? '').includes("'dev'"),
    );
    expect(smoke, 'a dev-only smoke step').toBeDefined();
    expect(smoke?.env).toMatchObject({
      SMOKE_EMAIL: '${{ secrets.SMOKE_EMAIL }}',
      SMOKE_PASSWORD: '${{ secrets.SMOKE_PASSWORD }}',
    });
    expect(smoke?.env?.['SMOKE_BASE_URL']).toBe('https://dev.within.doroshenk.com');
    expect(smoke?.run).toContain('e2e/sign-in.spec.ts');
  });

  it('P0-13: the prod smoke test only checks that the site loads; no test user in prod', () => {
    const smoke = steps(file).find(
      (s) => (s.run ?? '').includes('playwright test') && (s.if ?? '').includes("'prod'"),
    );
    expect(smoke, 'a prod-only smoke step').toBeDefined();
    expect(smoke?.env?.['SMOKE_BASE_URL']).toBe('https://within.doroshenk.com');
    expect(smoke?.run).toContain('e2e/loads.spec.ts');
    expect(JSON.stringify(smoke)).not.toContain('SMOKE_PASSWORD');
  });
});

describe('P0-13: the Playwright smoke test files', () => {
  it('P0-13: Playwright smoke: sign in with a dev test user and see "Hello" (spec exists)', () => {
    const spec = read('e2e/sign-in.spec.ts');
    expect(spec).toContain('SMOKE_EMAIL');
    expect(spec).toContain('SMOKE_PASSWORD');
    expect(spec).toMatch(/Hello/);
    expect(spec).not.toMatch(/\.skip|\.only|fixme/);
  });

  it('P0-13: failed smoke runs never publish traces (they record the typed password) on a public repo', () => {
    expect(read('playwright.config.ts')).toMatch(/trace:\s*'off'/);
    expect(read('.github/workflows/deploy.yml')).not.toMatch(/upload-artifact|playwright-traces/);
  });

  it('P0-13: stops early when the stage certificate variable is empty (no fallback to the dev one)', () => {
    const check = steps('deploy.yml').findIndex(
      (s) => (s.run ?? '').includes('CERTIFICATE_ARN') && (s.run ?? '').includes('exit 1'),
    );
    expect(check, 'a step that fails on an empty CERTIFICATE_ARN').toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThan(at('deploy.yml', 'cdk deploy'));
  });

  it('P0-13: stops when the web build output is missing, before the website stack is deployed', () => {
    const check = steps('deploy.yml').findIndex((s) =>
      (s.run ?? '').includes('packages/web/dist/index.html'),
    );
    expect(check, 'a step that checks packages/web/dist/index.html').toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThan(at('deploy.yml', 'WebStack-${{ inputs.stage }}'));
  });
});
