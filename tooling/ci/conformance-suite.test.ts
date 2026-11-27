import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const db = fileURLToPath(new URL('../../packages/db', import.meta.url));

/** The `conformance` script: one or more vitest runs, one after another. */
function runs(): string[][] {
  const pkg = JSON.parse(readFileSync(`${db}/package.json`, 'utf8')) as {
    scripts: Record<string, string>;
  };
  return (pkg.scripts['conformance'] ?? '').split('&&').map((c) => c.trim().split(/\s+/));
}

const testFiles = (): string[] =>
  readdirSync(`${db}/src`, { recursive: true, encoding: 'utf8' })
    .map((f) => `src/${f.replaceAll('\\', '/')}`)
    .filter((f) => f.endsWith('.test.ts'));

describe('P2-13: the DSQL conformance run', () => {
  it('P2-13: runs test files in parallel, at most four at once', () => {
    const [parallel] = runs();
    const workers = parallel?.find((a) => a.startsWith('--maxWorkers='))?.split('=')[1];

    expect(parallel).not.toContain('--no-file-parallelism');
    // Aurora DSQL allows 10 schemas, and each file holds one or two.
    expect(Number(workers)).toBeGreaterThan(1);
    expect(Number(workers)).toBeLessThanOrEqual(4);
  });

  it('P2-13: runs the tests of src/testing on their own, after the parallel files', () => {
    const [parallel, alone, ...rest] = runs();

    expect(rest).toEqual([]);
    expect(parallel).toContain('--exclude="src/testing/**"');
    expect(alone).toContain('--no-file-parallelism');
    expect(alone).toContain('src/testing');
  });

  it('P2-13: covers every test file: nothing is left out of both runs', () => {
    // The first run takes everything but src/testing, and the second takes src/testing.
    for (const args of runs()) {
      expect(args.slice(0, 2)).toEqual(['vitest', 'run']);
      expect(args.filter((a) => a.startsWith('--exclude'))).toEqual(
        args.includes('src/testing') ? [] : ['--exclude="src/testing/**"'],
      );
      expect(args.filter((a) => a === '-t' || a.startsWith('--testNamePattern'))).toEqual([]);
    }
  });

  it('P2-13: a test that sweeps schemas or makes more than one lives in src/testing', () => {
    // The sweep drops every other test schema, so it must never run beside another file.
    const outside = testFiles().filter((f) => !f.startsWith('src/testing/'));
    expect(outside.length).toBeGreaterThan(10);
    for (const file of outside) {
      const text = readFileSync(`${db}/${file}`, 'utf8');
      expect(text, file).not.toContain('sweepTestSchemas');
      expect(text.match(/createTestDb\(\)/g)?.length ?? 0, file).toBeLessThanOrEqual(1);
    }
  });
});
