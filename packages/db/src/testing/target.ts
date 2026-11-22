export type TestTarget =
  { kind: 'dsql'; endpoint: string } | { kind: 'url'; url: string } | { kind: 'container' };

/** Where the repository suite runs: the real DSQL cluster, a given Postgres URL, or Docker. */
export function testTarget(env: Record<string, string | undefined>): TestTarget {
  if (env['DSQL_ENDPOINT']) return { kind: 'dsql', endpoint: env['DSQL_ENDPOINT'] };
  if (env['TEST_DATABASE_URL']) return { kind: 'url', url: env['TEST_DATABASE_URL'] };
  return { kind: 'container' };
}
