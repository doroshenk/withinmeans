import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness.js';

const made: TestDb[] = [];
afterAll(async () => {
  // One at a time: on DSQL, concurrent DROPs conflict on the catalog (OC001) until retries run out.
  for (const t of made) await t.destroy();
});

describe('test harness', () => {
  it('gives every caller its own migrated schema', async () => {
    const a = await createTestDb();
    const b = await createTestDb();
    made.push(a, b);
    expect(a.schema).not.toBe(b.schema);
    await a.db
      .insertInto('households')
      .values({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'x',
        mode: 'solo',
        timezone: 'UTC',
        cushion_cents: 0,
        first_month: '2026-11',
      })
      .execute();
    expect(await b.db.selectFrom('households').selectAll().execute()).toEqual([]);
  });

  it('P0-07: destroy removes the schema and every table in it (one DDL statement at a time)', async () => {
    const t = await createTestDb();
    const { schema } = t;
    const admin = await createTestDb();
    made.push(admin);
    await t.destroy();
    const left =
      await sql`SELECT 1 FROM information_schema.schemata WHERE schema_name = ${schema}`.execute(
        admin.db,
      );
    expect(left.rows).toHaveLength(0);
  });
});
