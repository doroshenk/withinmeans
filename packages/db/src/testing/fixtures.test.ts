import type { KyselyPlugin } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../db.js';
import { clearAll, HOUSEHOLD_TABLES, seedHousehold, snapshotHousehold } from './fixtures.js';
import { createTestDb, type TestDb } from './harness.js';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
});
beforeEach(async () => {
  await clearAll(t.db);
});

/**
 * The same database, counting how many statements are waiting for an answer at once. With
 * `failFirst`, the first statement to be answered fails.
 */
function watched(db: Database, { failFirst = false } = {}) {
  const seen = { now: 0, peak: 0, total: 0 };
  let fail = failFirst;
  const plugin: KyselyPlugin = {
    transformQuery({ node }) {
      seen.total += 1;
      seen.now += 1;
      seen.peak = Math.max(seen.peak, seen.now);
      return node;
    },
    async transformResult({ result }) {
      seen.now -= 1;
      if (fail) {
        fail = false;
        throw new Error('boom');
      }
      return result;
    },
  };
  return { db: db.withPlugin(plugin), seen };
}

// Each statement is a round trip to Aurora DSQL, so waiting for them one at a time is what made
// the conformance run slow.
describe('P2-13: the test reset and seed send their statements concurrently', () => {
  it('P2-13: clearAll deletes from every table at once', async () => {
    const { db, seen } = watched(t.db);

    await clearAll(db);

    expect(seen.total).toBe(HOUSEHOLD_TABLES.length + 2);
    expect(seen.peak).toBe(seen.total);
  });

  it('P2-13: seedHousehold inserts at once, all but the two rows of one table', async () => {
    const { db, seen } = watched(t.db);

    await seedHousehold(db, 'A');

    // The second pay schedule waits for the first: `created_at` orders them.
    expect(seen.peak).toBe(seen.total - 1);
  });

  it('P2-13: seedHousehold still creates the running schedule before the stopped one', async () => {
    const a = await seedHousehold(t.db, 'A');

    const rows = await t.db
      .selectFrom('pay_schedules')
      .select('id')
      .where('household_id', '=', a.householdId)
      .orderBy('created_at')
      .execute();

    expect(rows.map((r) => r.id)).toEqual([a.payScheduleId, a.stoppedScheduleId]);
  });

  it('P2-13: snapshotHousehold reads every table at once, in the same order each time', async () => {
    const a = await seedHousehold(t.db, 'A');
    const first = await snapshotHousehold(t.db, a);
    const { db, seen } = watched(t.db);

    const again = await snapshotHousehold(db, a);

    expect(seen.peak).toBe(seen.total);
    expect(again).toEqual(first);
    expect(again[0]).toContain('A-secret household');
    expect(again[1]).toContain('A-secret user');
  });

  it('P2-13: a failed statement is reported once the others have finished', async () => {
    const { db, seen } = watched(t.db, { failFirst: true });

    await expect(clearAll(db)).rejects.toThrow('boom');

    // Nothing is still running to change rows under the next test.
    expect(seen.now).toBe(0);
    expect(seen.total).toBe(HOUSEHOLD_TABLES.length + 2);
  });
});
