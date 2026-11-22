import { describe, expect, it } from 'vitest';
import { testTarget } from './target.js';

describe('P0-07: conformance run target', () => {
  it('P0-07: DSQL_ENDPOINT points the repository suite at the real cluster', () => {
    expect(testTarget({ DSQL_ENDPOINT: 'abc.dsql.us-east-2.on.aws' })).toEqual({
      kind: 'dsql',
      endpoint: 'abc.dsql.us-east-2.on.aws',
    });
  });

  it('P0-07: DSQL_ENDPOINT wins over TEST_DATABASE_URL', () => {
    expect(testTarget({ DSQL_ENDPOINT: 'e', TEST_DATABASE_URL: 'postgres://x' }).kind).toBe('dsql');
  });

  it('P0-07: TEST_DATABASE_URL is used as before (CI service container)', () => {
    expect(testTarget({ TEST_DATABASE_URL: 'postgres://x' })).toEqual({
      kind: 'url',
      url: 'postgres://x',
    });
  });

  it('P0-07: default is a Testcontainers Postgres', () => {
    expect(testTarget({})).toEqual({ kind: 'container' });
    expect(testTarget({ DSQL_ENDPOINT: '' })).toEqual({ kind: 'container' });
  });
});
