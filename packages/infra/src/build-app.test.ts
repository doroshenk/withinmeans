import type { Stack } from 'aws-cdk-lib';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './build-app.js';

describe('P0-05: buildApp', () => {
  afterEach(() => {
    delete process.env.CDK_DEFAULT_ACCOUNT;
  });

  it('P0-05: defines CiStack in us-east-2 with the signed-in account', () => {
    const stack = buildApp('111111111111').node.findChild('CiStack') as Stack;
    expect(stack.account).toBe('111111111111');
    expect(stack.region).toBe('us-east-2');
  });

  it('P0-05: the real app trusts GitHub immutable subjects (owner and repo IDs)', () => {
    const assembly = buildApp().synth();
    const json = JSON.stringify(assembly.stacks[0]?.template);
    expect(json).toContain('repo:doroshenk@26264461/withinmeans@1464146358:ref:refs/heads/main');
    expect(json).toContain('repo:doroshenk@26264461/withinmeans@1464146358:ref:refs/tags/v*');
    expect(json).not.toContain('repo:doroshenk/withinmeans:');
  });

  it('P0-05: still synthesizes without an account (CI has no AWS credentials)', () => {
    const app = buildApp();
    const assembly = app.synth();
    expect(assembly.stacks.map((s) => s.stackName)).toEqual(['CiStack']);
    expect(JSON.stringify(assembly.stacks[0]?.template)).toContain('AWS::AccountId');
  });

  it('P0-05: the entry file builds the app from CDK_DEFAULT_ACCOUNT', async () => {
    process.env.CDK_DEFAULT_ACCOUNT = '111111111111';
    await expect(import('./app.js')).resolves.toBeDefined();
  });
});
