import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearAll, seedHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { householdExport } from './householdExport.js';

/** Tables with no household of their own. Members' names and emails travel with `memberships`. */
const NOT_HOUSEHOLD_SCOPED = ['schema_migrations', 'users'];
/** Secrets that never leave the database. */
const OMITTED: Record<string, string[]> = { invites: ['token'] };

let t: TestDb;
let A: Seeded;
let B: Seeded;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
});
beforeEach(async () => {
  await clearAll(t.db);
  A = await seedHousehold(t.db, 'A');
  B = await seedHousehold(t.db, 'B');
});

/** The migrated schema: table name to column names. */
async function schemaTables(): Promise<Map<string, string[]>> {
  const result = await sql<{ table_name: string; column_name: string }>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = ${t.schema}`.execute(t.db);
  const tables = new Map<string, string[]>();
  for (const { table_name, column_name } of result.rows) {
    tables.set(table_name, [...(tables.get(table_name) ?? []), column_name]);
  }
  return tables;
}

describe('P1-14: household export', () => {
  it('includes every household-scoped table in the schema', async () => {
    const schema = await schemaTables();
    const scoped = [...schema.keys()].filter((name) => !NOT_HOUSEHOLD_SCOPED.includes(name));
    // A table without household_id must be argued for above, not silently left out.
    expect(
      scoped.filter((n) => n !== 'households' && !schema.get(n)?.includes('household_id')),
    ).toEqual([]);

    const tables = await householdExport.read(t.db, A.ctx());

    expect(Object.keys(tables).sort()).toEqual(scoped.sort());
  });

  it('includes every column of every table, except secrets', async () => {
    const schema = await schemaTables();

    const tables = await householdExport.read(t.db, A.ctx());

    for (const [name, rows] of Object.entries(tables)) {
      const wanted = (schema.get(name) ?? []).filter((c) => !OMITTED[name]?.includes(c));
      expect(rows.length, `${name} has a seeded row`).toBeGreaterThan(0);
      expect(Object.keys(rows[0] ?? {}), name).toEqual(expect.arrayContaining(wanted));
    }
  });

  it('names each member, and never carries invite tokens or Cognito ids', async () => {
    const tables = await householdExport.read(t.db, A.ctx());

    expect(tables['memberships']).toEqual([
      {
        household_id: A.householdId,
        user_id: A.userId,
        role: 'owner',
        name: 'A-secret user',
        email: 'a@example.test',
      },
    ]);
    const text = JSON.stringify(tables);
    expect(text).not.toContain(A.inviteToken);
    expect(text).not.toContain('sub-A');
  });

  it('keeps money in integer cents and business dates as plain dates', async () => {
    const tables = await householdExport.read(t.db, A.ctx());

    expect(tables['balance_snapshots']?.[0]).toMatchObject({
      balance_cents: 100_000,
      date: '2026-11-05',
    });
  });

  it("contains nothing from household B in household A's export", async () => {
    const text = JSON.stringify(await householdExport.read(t.db, A.ctx()));

    expect(text).toContain('A-secret');
    for (const leak of [
      'B-secret',
      B.householdId,
      B.userId,
      B.categoryId,
      B.accountId,
      B.snapshotId,
      B.recurringBillId,
      B.billId,
      B.payScheduleId,
      B.paycheckId,
      B.inviteId,
      'b@example.test',
    ]) {
      expect(text).not.toContain(leak);
    }
  });

  it('gives the nightly job one read-only context per household', async () => {
    const contexts = await householdExport.listContexts(t.db);

    expect(contexts.map((c) => c.householdId).sort()).toEqual(
      [A.householdId, B.householdId].sort(),
    );
    expect(contexts.every((c) => c.role === 'view')).toBe(true);
  });
});
