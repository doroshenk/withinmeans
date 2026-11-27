import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db.js';
import { runDdl } from '../ddl.js';
import { migrate, MIGRATIONS_DIR } from '../migrate.js';
import { createTestDb, runTestDdl, type TestDb } from './harness.js';

// The real `migrate`, with its calls recorded.
vi.mock('../migrate.js', async (original) => {
  const actual = await original<typeof import('../migrate.js')>();
  return { ...actual, migrate: vi.fn(actual.migrate) };
});

let t: TestDb;
const dirs: string[] = [];
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** A migrations folder holding one file. */
function folder(name: string, text: string): URL {
  const dir = mkdtempSync(join(tmpdir(), 'patient-'));
  dirs.push(dir);
  writeFileSync(join(dir, name), text);
  return pathToFileURL(dir + sep);
}

describe('P2-13: setting up a test schema outlasts conflicts too', () => {
  it('P2-13: createTestDb runs the migrations with the patient retry', () => {
    expect(migrate).toHaveBeenCalledWith(expect.anything(), MIGRATIONS_DIR, runTestDdl);
  });

  it('P2-13: migrate runs every schema change through the runner it is given', async () => {
    const run = vi.fn(runDdl);
    const dir = folder('9001_runner.sql', 'CREATE TABLE IF NOT EXISTS runner_a (id uuid);\n');

    await migrate(t.db, dir, run);

    const statements = run.mock.calls.map(([, statement]) => statement);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('schema_migrations');
    expect(statements[1]).toContain('runner_a');
  });

  it('P2-13: a conflict while recording a schema change is retried, not reported', async () => {
    let left = 1;
    const executor = t.db.getExecutor();
    const wrapped = new Proxy(executor, {
      get(target, prop) {
        const value = Reflect.get(target, prop) as unknown;
        if (typeof value !== 'function') return value;
        if (prop !== 'executeQuery') return (value as () => unknown).bind(target);
        return async (compiled: { sql: string }, ...rest: unknown[]) => {
          if (/INSERT INTO schema_migrations/.test(compiled.sql) && left > 0) {
            left -= 1;
            throw Object.assign(new Error('schema has been updated by another transaction'), {
              code: 'OC001',
            });
          }
          return (value as (...a: unknown[]) => unknown).apply(target, [compiled, ...rest]);
        };
      },
    });
    const db = new Proxy(t.db, {
      get(target, prop) {
        if (prop === 'getExecutor') return () => wrapped;
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
      },
    }) as Database;
    const dir = folder('9002_record.sql', 'CREATE TABLE IF NOT EXISTS runner_b (id uuid);\n');

    await expect(migrate(db, dir)).resolves.toEqual(['9002_record.sql']);

    expect(left).toBe(0);
    const recorded =
      await sql`SELECT 1 FROM schema_migrations WHERE name = '9002_record.sql'`.execute(t.db);
    expect(recorded.rows).toHaveLength(1);
  });
});
