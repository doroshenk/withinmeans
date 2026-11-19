import { describe, expect, it } from 'vitest';
import { violationsOf } from './helper';

describe('domain imports nothing from db, api, web, infra or AWS SDKs', () => {
  it.each(['db', 'api', 'web', 'infra'])(
    'fails when domain imports @withinmeans/%s',
    async (pkg) => {
      expect(await violationsOf('domain', `imports-${pkg}.ts`)).toContain('domain-is-pure');
    },
  );

  it('fails when domain imports an AWS SDK', async () => {
    expect(await violationsOf('domain', 'imports-aws-sdk.ts')).toContain('domain-is-pure');
  });

  it('allows domain code with no forbidden imports', async () => {
    expect(await violationsOf('domain', 'clean.ts')).toEqual([]);
  });

  it('still allows other packages to use an AWS SDK', async () => {
    expect(await violationsOf('infra', 'uses-aws-sdk.ts')).not.toContain('domain-is-pure');
  });
});
