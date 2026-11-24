import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conflict, Forbidden, NotFound } from '../context.js';
import { clearAll, seedHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { categories } from './categories.js';
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
  // Start each test from an empty category list: the seeded one would only get in the way.
  await t.db.deleteFrom('recurring_bills').where('household_id', '=', A.householdId).execute();
  await t.db.deleteFrom('categories').where('household_id', '=', A.householdId).execute();
});

const names = async () => (await categories.list(t.db, A.ctx())).map((c) => c.name);

async function bill(categoryId: string, name = 'Bill') {
  return recurringBills.create(t.db, A.ctx(), {
    name,
    estimateCents: 10_000,
    dueDay: 5,
    categoryId,
    autopay: false,
    startYm: '2026-11',
  });
}

describe('P1-11 seedDefaults', () => {
  it('creates the defaults in order, with the first color indexes', async () => {
    await categories.seedDefaults(t.db, A.ctx(), ['Housing', 'Utilities', 'Home']);

    const rows = await categories.list(t.db, A.ctx());
    expect(rows.map((c) => [c.name, c.color_index, c.sort])).toEqual([
      ['Housing', 0, 0],
      ['Utilities', 1, 1],
      ['Home', 2, 2],
    ]);
  });

  it('does nothing when the household already has categories (safe to call twice)', async () => {
    await categories.seedDefaults(t.db, A.ctx(), ['Housing']);
    await categories.seedDefaults(t.db, A.ctx(), ['Housing', 'Home']);

    expect(await names()).toEqual(['Housing']);
  });

  it('rejects a view-only member', async () => {
    await expect(categories.seedDefaults(t.db, A.ctx('view'), ['Housing'])).rejects.toBeInstanceOf(
      Forbidden,
    );
  });
});

describe('P1-11 listWithUsage', () => {
  it('counts the recurring bills in each category', async () => {
    const housing = await categories.create(t.db, A.ctx(), { name: 'Housing', colorIndex: 0 });
    await categories.create(t.db, A.ctx(), { name: 'Auto', colorIndex: 1 });
    await bill(housing.id, 'Rent');
    await bill(housing.id, 'HOA');

    const rows = await categories.listWithUsage(t.db, A.ctx());

    expect(rows.map((r) => [r.name, r.bill_count])).toEqual([
      ['Housing', 2],
      ['Auto', 0],
    ]);
  });

  it("shows only this household's categories", async () => {
    await categories.create(t.db, A.ctx(), { name: 'Housing', colorIndex: 0 });

    const rows = await categories.listWithUsage(t.db, A.ctx());

    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('B-secret');
    expect(B.householdId).not.toBe(A.householdId);
  });
});

describe('P1-11 renaming', () => {
  it('renames the category on every bill that uses it', async () => {
    const home = await categories.create(t.db, A.ctx(), { name: 'Home', colorIndex: 2 });
    const first = await bill(home.id, 'Lawn');
    const second = await bill(home.id, 'Repairs');

    await categories.rename(t.db, A.ctx(), home.id, 'House');

    const rows = await categories.listWithUsage(t.db, A.ctx());
    expect(rows.map((r) => [r.name, r.bill_count])).toEqual([['House', 2]]);
    const bills = await recurringBills.list(t.db, A.ctx());
    expect(
      bills.filter((b) => [first.id, second.id].includes(b.id)).map((b) => b.category_id),
    ).toEqual([home.id, home.id]);
  });

  it('rejects a duplicate name ignoring case', async () => {
    await categories.create(t.db, A.ctx(), { name: 'Home', colorIndex: 2 });
    const auto = await categories.create(t.db, A.ctx(), { name: 'Auto', colorIndex: 3 });

    await expect(categories.rename(t.db, A.ctx(), auto.id, 'hOmE')).rejects.toBeInstanceOf(
      Conflict,
    );
  });
});

describe('T18: deleting a category that bills use', () => {
  it('T18: deleting "Home" used by 1 bill moves the bill to the first remaining category', async () => {
    const housing = await categories.create(t.db, A.ctx(), { name: 'Housing', colorIndex: 0 });
    const home = await categories.create(t.db, A.ctx(), { name: 'Home', colorIndex: 2 });
    const lawn = await bill(home.id, 'Lawn');

    const result = await categories.remove(t.db, A.ctx(), home.id);

    expect(result).toEqual({ movedCount: 1, movedToId: housing.id, movedToName: 'Housing' });
    expect(await names()).toEqual(['Housing']);
    const moved = (await recurringBills.list(t.db, A.ctx())).find((b) => b.id === lawn.id);
    expect(moved?.category_id).toBe(housing.id);
  });

  it('the first remaining category is first in the list, even when the first one is deleted', async () => {
    const housing = await categories.create(t.db, A.ctx(), { name: 'Housing', colorIndex: 0 });
    const utilities = await categories.create(t.db, A.ctx(), {
      name: 'Utilities',
      colorIndex: 1,
    });
    await categories.create(t.db, A.ctx(), { name: 'Home', colorIndex: 2 });
    await bill(housing.id, 'Rent');

    const result = await categories.remove(t.db, A.ctx(), housing.id);

    expect(result.movedToId).toBe(utilities.id);
    expect(result.movedCount).toBe(1);
  });

  it('an unused category is just deleted, nothing moves', async () => {
    await categories.create(t.db, A.ctx(), { name: 'Housing', colorIndex: 0 });
    const pets = await categories.create(t.db, A.ctx(), { name: 'Pets', colorIndex: 1 });

    const result = await categories.remove(t.db, A.ctx(), pets.id);

    expect(result.movedCount).toBe(0);
    expect(await names()).toEqual(['Housing']);
  });

  it('at least one category is required: the last one cannot be deleted', async () => {
    const only = await categories.create(t.db, A.ctx(), { name: 'Housing', colorIndex: 0 });

    await expect(categories.remove(t.db, A.ctx(), only.id)).rejects.toBeInstanceOf(Conflict);
    expect(await names()).toEqual(['Housing']);
  });

  it("another household's category looks missing, and nothing changes", async () => {
    await categories.create(t.db, A.ctx(), { name: 'Housing', colorIndex: 0 });
    await categories.create(t.db, A.ctx(), { name: 'Pets', colorIndex: 1 });

    await expect(categories.remove(t.db, A.ctx(), B.categoryId)).rejects.toBeInstanceOf(NotFound);
    expect(await categories.list(t.db, B.ctx())).toHaveLength(1);
  });

  it('rejects a view-only member', async () => {
    const pets = await categories.create(t.db, A.ctx(), { name: 'Pets', colorIndex: 1 });

    await expect(categories.remove(t.db, A.ctx('view'), pets.id)).rejects.toBeInstanceOf(Forbidden);
  });
});
