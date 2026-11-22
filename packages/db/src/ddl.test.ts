import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from './db.js';
import { runDdl } from './ddl.js';
import { migrate } from './migrate.js';
import { createTestDb, type TestDb } from './testing/harness.js';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
});

/** A db whose first `failures` queries matching `pattern` fail the way DSQL does under DDL contention. */
function flaky(db: Database, pattern: RegExp, failures: number, code = 'OC001') {
  let left = failures;
  const attempts = { count: 0 };
  const executor = db.getExecutor();
  const wrapped = new Proxy(executor, {
    get(target, prop) {
      if (prop === 'executeQuery') {
        return async (compiled: { sql: string }, ...rest: unknown[]) => {
          if (pattern.test(compiled.sql)) {
            attempts.count += 1;
            if (left > 0) {
              left -= 1;
              throw Object.assign(new Error('schema has been updated by another transaction'), {
                code,
              });
            }
          }
          return (target.executeQuery as (...a: unknown[]) => unknown)(compiled, ...rest);
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  });
  const proxy = new Proxy(db, {
    get(target, prop) {
      if (prop === 'getExecutor') return () => wrapped;
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  }) as Database;
  return { db: proxy, attempts };
}

describe('P0-07: DDL under DSQL catalog conflicts', () => {
  it('P0-07: runDdl retries a DDL statement that fails with OC001, then succeeds', async () => {
    const { db, attempts } = flaky(t.db, /CREATE TABLE r1/, 2);
    await runDdl(db, 'CREATE TABLE r1 (id uuid PRIMARY KEY)');
    expect(attempts.count).toBe(3);
    expect((await sql`SELECT * FROM r1`.execute(t.db)).rows).toEqual([]);
  });

  it('P0-07: runDdl gives up after many conflicts', async () => {
    const { db, attempts } = flaky(t.db, /CREATE TABLE r2/, 1000);
    await expect(runDdl(db, 'CREATE TABLE r2 (id uuid)')).rejects.toMatchObject({ code: 'OC001' });
    expect(attempts.count).toBeGreaterThan(3);
    expect(attempts.count).toBeLessThan(1000);
  });

  it('P0-07: runDdl does not retry other errors', async () => {
    const { db, attempts } = flaky(t.db, /CREATE TABLE r3/, 5, '42P07');
    await expect(runDdl(db, 'CREATE TABLE r3 (id uuid)')).rejects.toMatchObject({ code: '42P07' });
    expect(attempts.count).toBe(1);
  });

  it('P0-07: migrate retries a DDL statement and the schema_migrations bootstrap on OC001', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    writeFileSync(join(dir, '0010_x.sql'), 'CREATE TABLE m1 (id uuid PRIMARY KEY);');
    const { db, attempts } = flaky(t.db, /CREATE TABLE (IF NOT EXISTS )?(m1|schema_migrations)/, 2);
    expect(await migrate(db, pathToFileURL(dir + '/'))).toEqual(['0010_x.sql']);
    expect(attempts.count).toBeGreaterThanOrEqual(3);
  });
});
