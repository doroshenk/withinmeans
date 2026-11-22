export type TestTarget =
  { kind: 'dsql'; endpoint: string } | { kind: 'url'; url: string } | { kind: 'container' };
export function testTarget(_env: Record<string, string | undefined>): TestTarget {
  throw new Error('not implemented');
}
