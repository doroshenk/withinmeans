import type { Stack } from 'aws-cdk-lib';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './build-app.js';

describe('P0-05: buildApp', () => {
  afterEach(() => {
    delete process.env.CDK_DEFAULT_ACCOUNT;
  });

  it('P0-05: defines CiStack in us-east-2 with the signed-in account', () => {
    const stack = buildApp('111111111111', undefined, { bundle: false }).node.findChild(
      'CiStack',
    ) as Stack;
    expect(stack.account).toBe('111111111111');
    expect(stack.region).toBe('us-east-2');
  });

  it('P0-05: the real app trusts GitHub immutable subjects (owner and repo IDs)', () => {
    const assembly = buildApp(undefined, undefined, { bundle: false }).synth();
    const ci = assembly.stacks.find((s) => s.stackName === 'CiStack');
    const json = JSON.stringify(ci?.template);
    expect(json).toContain('repo:doroshenk@26264461/withinmeans@1464146358:ref:refs/heads/main');
    expect(json).toContain('repo:doroshenk@26264461/withinmeans@1464146358:ref:refs/tags/v*');
    expect(json).not.toContain('repo:doroshenk/withinmeans:');
  });

  it('P0-05: still synthesizes without an account (CI has no AWS credentials)', () => {
    const app = buildApp(undefined, undefined, { bundle: false });
    const assembly = app.synth();
    const ci = assembly.stacks.find((s) => s.stackName === 'CiStack');
    expect(JSON.stringify(ci?.template)).toContain('AWS::AccountId');
  });

  it('P0-05: the entry file builds the app from CDK_DEFAULT_ACCOUNT', async () => {
    process.env.CDK_DEFAULT_ACCOUNT = '111111111111';
    await expect(import('./app.js')).resolves.toBeDefined();
  });
});

describe('P0-07: buildApp data stacks', () => {
  const names = (stage?: 'dev' | 'prod'): string[] =>
    buildApp('111111111111', stage, { bundle: false })
      .synth()
      .stacks.map((s) => s.stackName)
      .sort();

  it('P0-07/P0-10: builds every stack per stage plus the CiStack', () => {
    expect(names()).toEqual([
      'ApiStack-dev',
      'ApiStack-prod',
      'AuthStack-dev',
      'AuthStack-prod',
      'CiStack',
      'DataStack-dev',
      'DataStack-prod',
      'WebStack-dev',
      'WebStack-prod',
    ]);
  });

  it('P0-07: the stage selector builds only that stage (cdk --context stage=dev)', () => {
    expect(names('dev')).toEqual([
      'ApiStack-dev',
      'AuthStack-dev',
      'CiStack',
      'DataStack-dev',
      'WebStack-dev',
    ]);
    expect(names('prod')).toEqual([
      'ApiStack-prod',
      'AuthStack-prod',
      'CiStack',
      'DataStack-prod',
      'WebStack-prod',
    ]);
  });

  it('P0-13: both stages let the GitHub deploy role connect to their own database (prod migrates from the tag workflow)', () => {
    const assembly = buildApp('111111111111', undefined, { bundle: false }).synth();
    const json = (name: string): string =>
      JSON.stringify(assembly.stacks.find((s) => s.stackName === name)?.template);
    for (const stack of ['DataStack-dev', 'DataStack-prod']) {
      expect(json(stack)).toContain('dsql:DbConnectAdmin');
      expect(json(stack)).toContain('withinmeans-github-deploy');
    }
  });

  it('P0-07: the entry file reads --context stage from CDK_CONTEXT_JSON', async () => {
    const { stageFromContext } = await import('./app.js');
    expect(stageFromContext('{"stage":"dev"}')).toBe('dev');
    expect(stageFromContext('{"stage":"prod"}')).toBe('prod');
    expect(stageFromContext(undefined)).toBeUndefined();
    expect(stageFromContext('{}')).toBeUndefined();
    expect(() => stageFromContext('{"stage":"staging"}')).toThrow(/stage/);
  });

  it('P0-13: uploads the built web app only when its folder is given', () => {
    const has = (webDist?: string): boolean =>
      buildApp('111111111111', 'dev', {
        bundle: false,
        ...(webDist === undefined ? {} : { webDist }),
      })
        .synth()
        .stacks.some((s) => JSON.stringify(s.template).includes('Custom::CDKBucketDeployment'));
    expect(has()).toBe(false);
    expect(has(fileURLToPath(new URL('.', import.meta.url)))).toBe(true);
  });
});
