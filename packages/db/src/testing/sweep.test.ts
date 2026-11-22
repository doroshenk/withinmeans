import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { runDdl } from '../ddl.js';
import { createTestDb, type TestDb } from './harness.js';
import { sweepTestSchemas } from './sweep.js';

const made: TestDb[] = [];
afterAll(async () => {
  await Promise.all(made.map((t) => t.destroy()));
});

const schemas = async (t: TestDb): Promise<string[]> =>
  (
    await sql<{ schema_name: string }>`SELECT schema_name FROM information_schema.schemata`.execute(
      t.db,
    )
  ).rows.map((r) => r.schema_name);

describe('P0-07: sweeping leftover test schemas (DSQL allows only 10 schemas)', () => {
  it('P0-07: drops leftover t_<32 hex> schemas with their tables, and nothing else', async () => {
    const host = await createTestDb();
    made.push(host);
    const leftover = `t_${'a'.repeat(32)}`;
    const keep = 'keep_me';
    await runDdl(host.db, `CREATE SCHEMA ${leftover}`);
    await runDdl(host.db, `CREATE TABLE ${leftover}.x (id int)`);
    await runDdl(host.db, `CREATE TABLE ${leftover}.y (id int)`);
    await runDdl(host.db, `CREATE SCHEMA ${keep}`);
    try {
      const dropped = await sweepTestSchemas(host.db, [host.schema]);
      expect(dropped).toContain(leftover);
      const left = await schemas(host);
      expect(left).not.toContain(leftover);
      expect(left).toContain(keep); // not a test schema name
      expect(left).toContain(host.schema); // listed in `keep`, so a live schema is never swept
    } finally {
      await runDdl(host.db, `DROP SCHEMA ${keep}`);
    }
  });

  it('P0-07: returns nothing when there is nothing to sweep', async () => {
    const host = await createTestDb();
    made.push(host);
    expect(await sweepTestSchemas(host.db, [host.schema])).toEqual([]);
  });
});
