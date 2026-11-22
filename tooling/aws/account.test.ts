import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const expectedAccount = process.env.WITHINMEANS_AWS_ACCOUNT_ID;

// Needs real AWS credentials, so CI cannot run it. It runs when the owner
// sets WITHINMEANS_AWS_ACCOUNT_ID (the 12-digit account ID) on their machine.
describe.runIf(expectedAccount !== undefined)('P0-04: AWS admin profile', () => {
  it('P0-04: sts get-caller-identity with profile withinmeans returns the expected account', () => {
    const result = spawnSync(
      'aws',
      ['sts', 'get-caller-identity', '--profile', 'withinmeans', '--output', 'json'],
      { encoding: 'utf8', shell: process.platform === 'win32', timeout: 20_000 },
    );
    expect(result.status, result.stderr).toBe(0);
    const identity = JSON.parse(result.stdout) as { Account: string; Arn: string };
    expect(identity.Account).toBe(expectedAccount);
    expect(identity.Arn, 'daily work must not use root').not.toMatch(/:root$/);
  });
});

describe('P0-04: docs/runbooks/aws-account.md', () => {
  const path = `${root}/docs/runbooks/aws-account.md`;
  const text = () => {
    expect(existsSync(path), 'docs/runbooks/aws-account.md must exist').toBe(true);
    return readFileSync(path, 'utf8');
  };

  it('P0-04: records the Free plan credit expiry date as YYYY-MM-DD', () => {
    expect(text()).toMatch(/Free plan credit expiry:\s*\d{4}-\d{2}-\d{2}/);
  });

  it('P0-04: covers each console step', () => {
    const body = text();
    for (const topic of ['Root MFA', 'Admin user', 'Budget', 'cdk bootstrap', 'CDKToolkit']) {
      expect(body, `runbook must mention ${topic}`).toContain(topic);
    }
  });

  it('P0-04: names the profile, the $1 budget, us-east-2 and the Free Tier page', () => {
    const body = text();
    expect(body).toContain('`withinmeans`');
    expect(body).toContain('$1');
    expect(body).toContain('Free Tier');
    expect(body).toMatch(/cdk bootstrap aws:\/\/<account>\/us-east-2/);
    expect(body).not.toContain('us-east-1 once');
  });

  it('P0-04: contains no account ID or email address (the repo is public)', () => {
    const body = text();
    expect(body).not.toMatch(/\b\d{12}\b/);
    expect(body).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });
});
