import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
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

  it('rolls a failing migration back entirely', async () => {
    const dir = dirWith({
      '0005_half.sql': 'CREATE TABLE e (id uuid PRIMARY KEY); CREATE TABLE e (id uuid);',
    });
    await expect(migrate(t.db, dir)).rejects.toThrow();
    const tables = await t.db.introspection.getTables();
    expect(tables.some((x) => x.name === 'e')).toBe(false);
  });
});
