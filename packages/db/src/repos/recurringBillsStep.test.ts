import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Forbidden, NotFound } from '../context.js';
import { clearAll, seedHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { recurringBills } from './recurringBills.js';

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

describe('P1-12 removing a recurring bill in setup', () => {
  it('deletes the bill', async () => {
    await recurringBills.remove(t.db, A.ctx(), A.recurringBillId, '2026-11');

    expect(await recurringBills.list(t.db, A.ctx())).toEqual([]);
  });

  it('another household cannot remove it (it looks missing)', async () => {
    await expect(
      recurringBills.remove(t.db, A.ctx(), B.recurringBillId, '2026-11'),
    ).rejects.toBeInstanceOf(NotFound);
    expect(await recurringBills.list(t.db, B.ctx())).toHaveLength(1);
  });

  it('view-only members cannot remove', async () => {
    await expect(
      recurringBills.remove(t.db, A.ctx('view'), A.recurringBillId, '2026-11'),
    ).rejects.toBeInstanceOf(Forbidden);
  });
});
