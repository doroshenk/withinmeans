import { describe, expect, it } from 'vitest';
import { violationsOf } from './helper';

describe('only packages/db may import pg or the DSQL connector', () => {
  it.each(['domain', 'api', 'web', 'infra'])('fails when %s imports pg or the DSQL connector', async (pkg) => {
    expect(await violationsOf(pkg, 'uses-db-driver.ts')).toContain('only-db-imports-db-drivers');
  });

  it('allows db to import pg and the DSQL connector', async () => {
    expect(await violationsOf('db', 'uses-db-driver.ts')).not.toContain('only-db-imports-db-drivers');
  });
});
