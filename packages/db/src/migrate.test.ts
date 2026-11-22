import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrate.js';
import { createTestDb, type TestDb } from './testing/harness.js';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
});

function dirWith(files: Record<string, string>): URL {
  const dir = mkdtempSync(join(tmpdir(), 'mig with space-'));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return pathToFileURL(dir + '/');
}

describe('migrate', () => {
  it('applies the real migrations once and is idempotent', async () => {
    // createTestDb already ran them; a second run applies nothing.
    expect(await migrate(t.db)).toEqual([]);
  });

  it('applies new files in name order and records them', async () => {
    const dir = dirWith({
      '0002_b.sql': 'CREATE TABLE b (id uuid PRIMARY KEY);',
      '0001_a.sql': 'CREATE TABLE a (id uuid PRIMARY KEY);',
      'notes.txt': 'ignored',
    });
    // 0001_core.sql is not in this directory; only the two new files run.
    expect(await migrate(t.db, dir)).toEqual(['0001_a.sql', '0002_b.sql']);
  });

  it('refuses a migration edited after it was applied', async () => {
    const name = '0003_c.sql';
    await migrate(t.db, dirWith({ [name]: 'CREATE TABLE c (id uuid PRIMARY KEY);' }));
    await expect(
      migrate(t.db, dirWith({ [name]: 'CREATE TABLE c (id uuid PRIMARY KEY, x int);' })),
    ).rejects.toThrow(/edited after it was applied/);
  });

  it('refuses a migration the DSQL linter rejects, and applies none of it', async () => {
    const dir = dirWith({ '0004_bad.sql': 'CREATE TABLE d (id SERIAL PRIMARY KEY);' });
    await expect(migrate(t.db, dir)).rejects.toThrow(/no-serial/);
    const tables = await t.db.introspection.getTables();
    expect(tables.some((x) => x.name === 'd')).toBe(false);
  });

  it('P0-07: DDL statements and the bookkeeping row each get their own transaction (DSQL)', async () => {
    // DSQL allows one DDL statement per transaction and no DDL mixed with DML, so the runner
    // must not wrap a DDL migration in one transaction. Each transaction has its own xmin.
    await migrate(
      t.db,
      dirWith({
        '0006_two.sql':
          'CREATE TABLE f1 (id uuid PRIMARY KEY); CREATE TABLE f2 (id uuid PRIMARY KEY);',
      }),
    );
    const { rows } = await sql<{ what: string; xid: string }>`
      SELECT c.relname AS what, c.xmin::text AS xid FROM pg_class c
        WHERE c.relname IN ('f1', 'f2') AND c.relnamespace = to_regnamespace(current_schema())
      UNION ALL
      SELECT 'record', m.xmin::text FROM schema_migrations m WHERE m.name = '0006_two.sql'`.execute(
      t.db,
    );
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.xid)).size).toBe(3);
  });

  it('P0-07: a failing DDL migration is not recorded, and can be fixed and re-run', async () => {
    const name = '0005_half.sql';
    await expect(
      migrate(
        t.db,
        dirWith({ [name]: 'CREATE TABLE e (id uuid PRIMARY KEY); CREATE TABLE e (id uuid);' }),
      ),
    ).rejects.toThrow();
    const recorded = await sql`SELECT 1 FROM schema_migrations WHERE name = ${name}`.execute(t.db);
    expect(recorded.rows).toHaveLength(0);
    // DDL cannot be rolled back as one unit on DSQL, so migrations are written to be re-runnable.
    const fixed = dirWith({
      [name]:
        'CREATE TABLE IF NOT EXISTS e (id uuid PRIMARY KEY); CREATE TABLE IF NOT EXISTS e2 (id uuid);',
    });
    expect(await migrate(t.db, fixed)).toEqual([name]);
  });

  it('P0-07: a DML-only migration still applies atomically with its bookkeeping row', async () => {
    await migrate(t.db, dirWith({ '0007_t.sql': 'CREATE TABLE g (id int PRIMARY KEY);' }));
    const dir = dirWith({ '0008_dml.sql': 'INSERT INTO g VALUES (1); INSERT INTO g VALUES (1);' });
    await expect(migrate(t.db, dir)).rejects.toThrow();
    expect((await sql`SELECT * FROM g`.execute(t.db)).rows).toHaveLength(0);
    const ok = dirWith({ '0008_dml.sql': 'INSERT INTO g VALUES (1); INSERT INTO g VALUES (2);' });
    expect(await migrate(t.db, ok)).toEqual(['0008_dml.sql']);
    expect((await sql`SELECT * FROM g`.execute(t.db)).rows).toHaveLength(2);
  });
});
