import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db.js';
import { migrate } from '../migrate.js';
import { createTestDb, type TestDb } from './harness.js';

// The real `migrate`, which a test can make fail once.
vi.mock('../migrate.js', async (original) => {
  const actual = await original<typeof import('../migrate.js')>();
  return { ...actual, migrate: vi.fn(actual.migrate) };
});

let t: TestDb;
const empty = mkdtempSync(join(tmpdir(), 'no-migrations-'));
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
  rmSync(empty, { recursive: true, force: true });
});

/** The database's executor, failing the first statement matching `pattern` as DSQL would. */
function conflictingOnce(db: Database, pattern: RegExp) {
  const seen = { conflicts: 0 };
  const executor = db.getExecutor();
  const wrapped = new Proxy(executor, {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value !== 'function') return value;
      if (prop !== 'executeQuery') return (value as () => unknown).bind(target);
      return async (compiled: { sql: string }, ...rest: unknown[]) => {
        if (pattern.test(compiled.sql) && seen.conflicts === 0) {
          seen.conflicts += 1;
          throw Object.assign(new Error('schema has been updated by another transaction'), {
            code: 'OC001',
          });
        }
        return (value as (...a: unknown[]) => unknown).apply(target, [compiled, ...rest]);
      };
    },
  });
  return { executor: wrapped, seen };
}

const schemas = async (): Promise<string[]> =>
  (
    await sql<{ schema_name: string }>`SELECT schema_name FROM information_schema.schemata`.execute(
      t.db,
    )
  ).rows
    .map((r) => r.schema_name)
    .sort();

describe('P2-13: test setup and teardown survive other files changing schemas', () => {
  it('P2-13: destroy retries a conflict while listing its tables, and leaves nothing', async () => {
    const own = await createTestDb();
    const { executor, seen } = conflictingOnce(own.db, /information_schema\.tables/);
    vi.spyOn(own.db, 'getExecutor').mockReturnValue(executor);

    await own.destroy();

    expect(seen.conflicts).toBe(1);
    expect(await schemas()).not.toContain(own.schema);
  });

  it('P2-13: migrate retries a conflict while reading which migrations ran', async () => {
    const { executor, seen } = conflictingOnce(t.db, /SELECT name, checksum/);
    const db = new Proxy(t.db, {
      get(target, prop) {
        if (prop === 'getExecutor') return () => executor;
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
      },
    }) as Database;

    await expect(migrate(db, pathToFileURL(empty + sep))).resolves.toEqual([]);

    expect(seen.conflicts).toBe(1);
  });

  it('P2-13: a setup that fails drops the schema it made (DSQL allows only 10)', async () => {
    const before = await schemas();
    vi.mocked(migrate).mockRejectedValueOnce(new Error('migration failed'));

    await expect(createTestDb()).rejects.toThrow('migration failed');

    expect(await schemas()).toEqual(before);
  });
});
