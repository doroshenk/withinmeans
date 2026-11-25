import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InvalidInput, NotFound } from '../context.js';
import { clearAll, seedHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { categories } from './categories.js';
import { openMonth } from './openMonth.js';
import { recurringBills, type NewRecurringBill } from './recurringBills.js';

let t: TestDb;
let A: Seeded;
let B: Seeded;

const NOW = new Date('2026-11-18T12:00:00Z');

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
  // Household A keeps its category and account, but has no recurring bills, months or bills.
  for (const table of ['bills', 'months', 'recurring_bills'] as const) {
    await t.db.deleteFrom(table).where('household_id', '=', A.householdId).execute();
  }
});

const add = (over: Partial<NewRecurringBill> = {}) =>
  recurringBills.create(t.db, A.ctx(), {
    name: 'Rent',
    estimateCents: 150_000,
    dueDay: 1,
    categoryId: A.categoryId,
    autopay: false,
    startYm: '2026-10',
    ...over,
  });

const open = async (...yms: string[]) => {
  for (const ym of yms) await openMonth(t.db, A.ctx(), ym, NOW);
};

const billsOfA = () =>
  t.db
    .selectFrom('bills')
    .selectAll()
    .where('household_id', '=', A.householdId)
    .orderBy('ym')
    .orderBy('name')
    .execute();

const months = async () => (await billsOfA()).map((b) => b.ym);

const find = async (id: string) =>
  (await recurringBills.list(t.db, A.ctx())).find((r) => r.id === id);

const pay = (ym: string) =>
  t.db
    .updateTable('bills')
    .set({ paid_at: NOW, actual_cents: 150_000 })
    .where('household_id', '=', A.householdId)
    .where('ym', '=', ym)
    .execute();

describe('P2-08 ending and restarting a recurring bill (spec §6.3)', () => {
  it('ending keeps its history and stops it from future openMonth runs', async () => {
    const rent = await add();
    await open('2026-10', '2026-11');

    await recurringBills.stop(t.db, A.ctx(), rent.id, '2026-11');
    await open('2026-12');

    expect(await months()).toEqual(['2026-10', '2026-11']);
    expect((await find(rent.id))?.end_ym).toBe('2026-11');
  });

  it('restarting brings it back: this month on, and future openMonth runs', async () => {
    const rent = await add();
    await open('2026-10');
    await recurringBills.stop(t.db, A.ctx(), rent.id, '2026-10');
    await open('2026-11', '2026-12');

    await recurringBills.restart(t.db, A.ctx(), rent.id, '2026-12');
    await open('2027-01');

    // November was started while the bill was ended, so it stays without it.
    expect(await months()).toEqual(['2026-10', '2026-12', '2027-01']);
    expect((await find(rent.id))?.end_ym).toBeNull();
  });

  it('ending and restarting in the same month leaves one bill in it', async () => {
    const rent = await add();
    await open('2026-11');

    await recurringBills.stop(t.db, A.ctx(), rent.id, '2026-11');
    await recurringBills.restart(t.db, A.ctx(), rent.id, '2026-11');

    expect(await months()).toEqual(['2026-11']);
  });

  it('ending before this month is started keeps it out of this month too', async () => {
    const rent = await add();
    await open('2026-10');

    await recurringBills.stop(t.db, A.ctx(), rent.id, '2026-11');
    await open('2026-11');

    expect(await months()).toEqual(['2026-10']);
  });

  it('ending takes the bill out of a month started ahead, unless it was already paid', async () => {
    const rent = await add();
    const gym = await add({ name: 'Gym' });
    await open('2026-11', '2026-12');
    await t.db
      .updateTable('bills')
      .set({ paid_at: NOW })
      .where('recurring_bill_id', '=', gym.id)
      .where('ym', '=', '2026-12')
      .execute();

    await recurringBills.stop(t.db, A.ctx(), rent.id, '2026-11');
    await recurringBills.stop(t.db, A.ctx(), gym.id, '2026-11');

    expect((await billsOfA()).map((b) => `${b.ym} ${b.name}`)).toEqual([
      '2026-11 Gym',
      '2026-11 Rent',
      '2026-12 Gym',
    ]);
  });

  it('ending an ended bill again keeps the first end', async () => {
    const rent = await add();
    await open('2026-10');
    await recurringBills.stop(t.db, A.ctx(), rent.id, '2026-10');
    await open('2026-11');

    await recurringBills.stop(t.db, A.ctx(), rent.id, '2026-11');

    expect((await find(rent.id))?.end_ym).toBe('2026-10');
  });

  it('restarting a bill that has not ended changes nothing', async () => {
    const rent = await add();
    await open('2026-11');
    await t.db.deleteFrom('bills').where('recurring_bill_id', '=', rent.id).execute();

    await recurringBills.restart(t.db, A.ctx(), rent.id, '2026-11');

    expect(await months()).toEqual([]);
  });

  it('needs a real current month', async () => {
    const rent = await add();

    await expect(recurringBills.stop(t.db, A.ctx(), rent.id, 'Nov')).rejects.toBeInstanceOf(
      InvalidInput,
    );
    await expect(recurringBills.restart(t.db, A.ctx(), rent.id, 'Nov')).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });
});

describe('P2-08 editing a recurring bill', () => {
  it('updates the unpaid bills from this month on, and no earlier ones', async () => {
    const rent = await add();
    await open('2026-10', '2026-11', '2026-12');
    const spare = await categories.create(t.db, A.ctx(), { name: 'Spare', colorIndex: 1 });

    await recurringBills.update(
      t.db,
      A.ctx(),
      rent.id,
      { name: 'Mortgage', estimateCents: 185_000, dueDay: 5, categoryId: spare.id },
      { fromYm: '2026-11' },
    );

    expect(
      (await billsOfA()).map((b) => [b.ym, b.name, b.estimate_cents, b.due_date, b.category_id]),
    ).toEqual([
      ['2026-10', 'Rent', 150_000, '2026-10-01', A.categoryId],
      ['2026-11', 'Mortgage', 185_000, '2026-11-05', spare.id],
      ['2026-12', 'Mortgage', 185_000, '2026-12-05', spare.id],
    ]);
  });

  it('leaves a bill with money recorded, and a closed month, as they are', async () => {
    const rent = await add();
    await open('2026-11', '2026-12');
    await pay('2026-11');
    await t.db
      .updateTable('months')
      .set({ status: 'closed' })
      .where('ym', '=', '2026-12')
      .execute();

    await recurringBills.update(
      t.db,
      A.ctx(),
      rent.id,
      { estimateCents: 185_000 },
      { fromYm: '2026-11' },
    );

    expect((await billsOfA()).map((b) => b.estimate_cents)).toEqual([150_000, 150_000]);
    expect((await find(rent.id))?.estimate_cents).toBe(185_000);
  });

  it('changing only autopay touches no month bill', async () => {
    const rent = await add();
    await open('2026-11');
    const before = await billsOfA();

    await recurringBills.update(t.db, A.ctx(), rent.id, { autopay: true }, { fromYm: '2026-11' });

    expect(await billsOfA()).toEqual(before);
    expect((await find(rent.id))?.autopay).toBe(true);
  });
});

describe('P2-08 deleting a category with a chosen destination (spec §4)', () => {
  const two = async () => ({
    first: await categories.create(t.db, A.ctx(), { name: 'First', colorIndex: 1 }),
    chosen: await categories.create(t.db, A.ctx(), { name: 'Chosen', colorIndex: 2 }),
  });

  it('Category delete moves its bills to the chosen category, not just the first', async () => {
    await add();
    await open('2026-11');
    const { chosen } = await two();

    const result = await categories.remove(t.db, A.ctx(), A.categoryId, chosen.id);

    expect(result).toMatchObject({ movedCount: 1, movedToId: chosen.id, movedToName: 'Chosen' });
    expect((await billsOfA()).map((b) => b.category_id)).toEqual([chosen.id]);
    expect((await recurringBills.list(t.db, A.ctx()))[0]?.category_id).toBe(chosen.id);
  });

  it('the destination cannot be the category being deleted', async () => {
    await two();

    await expect(
      categories.remove(t.db, A.ctx(), A.categoryId, A.categoryId),
    ).rejects.toBeInstanceOf(InvalidInput);
  });

  it("another household's category is not a destination", async () => {
    await add();
    await two();

    await expect(
      categories.remove(t.db, A.ctx(), A.categoryId, B.categoryId),
    ).rejects.toBeInstanceOf(NotFound);
    expect((await recurringBills.list(t.db, A.ctx()))[0]?.category_id).toBe(A.categoryId);
  });

  it('usedIds lists categories used by ended bills and month bills, not unused ones', async () => {
    const { first, chosen } = await two();
    const rent = await add();
    await recurringBills.stop(t.db, A.ctx(), rent.id, '2026-11');
    await t.db
      .insertInto('bills')
      .values({
        household_id: A.householdId,
        ym: '2026-11',
        recurring_bill_id: null,
        name: 'Plumber',
        category_id: first.id,
        due_date: '2026-11-20',
        estimate_cents: null,
        actual_cents: 20_000,
        paid_at: null,
        kind: 'one_time',
      })
      .execute();

    const used = await categories.usedIds(t.db, A.ctx());

    expect([...used].sort()).toEqual([A.categoryId, first.id].sort());
    expect(used).not.toContain(chosen.id);
  });
});
