import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../db.js';
import { createTestDb, runTestDdl, type TestDb } from './harness.js';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
});

/** A db whose first `failures` statements fail the way DSQL does when schema changes collide. */
function conflicting(db: Database, failures: number, code = 'OC001') {
  let left = failures;
  const attempts = { count: 0 };
  const executor = db.getExecutor();
  const wrapped = new Proxy(executor, {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value !== 'function') return value;
      if (prop !== 'executeQuery') return (value as () => unknown).bind(target);
      return async (...args: unknown[]) => {
        attempts.count += 1;
        if (left > 0) {
          left -= 1;
          throw Object.assign(new Error('schema has been updated by another transaction'), {
            code,
          });
        }
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
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

// Four files creating and dropping schemas at once collide far more often than one migration run
// does, and a dropped retry leaves a schema behind (DSQL allows only 10).
describe('P2-13: test schema changes outlast conflicts with other test files', () => {
  it('P2-13: keeps trying past the 12 tries that a migration gets', async () => {
    const { db, attempts } = conflicting(t.db, 30);

    await runTestDdl(db, 'CREATE TABLE patient (id uuid PRIMARY KEY)');

    expect(attempts.count).toBe(31);
    expect((await sql`SELECT * FROM patient`.execute(t.db)).rows).toEqual([]);
  }, 60_000);

  it('P2-13: any other error fails at once', async () => {
    const { db, attempts } = conflicting(t.db, 1, '42601');

    await expect(runTestDdl(db, 'CREATE TABLE never (id uuid PRIMARY KEY)')).rejects.toThrow();

    expect(attempts.count).toBe(1);
  });
});
