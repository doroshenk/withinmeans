import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conflict, InvalidInput, NotFound } from '../context.js';
import { clearAll, seedHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { otherIncome, type NewOtherIncome } from './otherIncome.js';

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
  // These tests start with no income; the fixture's row is for the isolation and export suites.
  await t.db.deleteFrom('other_income').execute();
});

const input = (over: Partial<NewOtherIncome> = {}): NewOtherIncome => ({
  date: '2026-11-12',
  source: 'Marketplace sale',
  type: 'sale',
  amountCents: 12_000,
  ...over,
});

const sources = async (ym: string) =>
  (await otherIncome.listForMonth(t.db, A.ctx(), ym)).map((i) => i.source);

const closeMonth = (ym: string) =>
  t.db
    .updateTable('months')
    .set({ status: 'closed', closed_at: new Date('2026-12-01T12:00:00Z') })
    .where('household_id', '=', A.householdId)
    .where('ym', '=', ym)
    .execute();

describe('P2-04 other income repository', () => {
  it('Other income counts in the month of its date', async () => {
    for (const [date, source] of [
      ['2026-10-31', 'oct'],
      ['2026-11-01', 'first'],
      ['2026-11-30', 'last'],
      ['2026-12-01', 'dec'],
    ] as const) {
      await otherIncome.create(t.db, A.ctx(), input({ date, source }));
    }

    expect(await sources('2026-11')).toEqual(['last', 'first']);
    expect(await sources('2026-10')).toEqual(['oct']);
    // December is not open: the entry still belongs to it.
    expect(await sources('2026-12')).toEqual(['dec']);
  });

  it('stores what was entered, depositing into primary checking by default', async () => {
    await t.db
      .updateTable('accounts')
      .set({ is_primary_checking: true })
      .where('id', '=', A.accountId)
      .execute();

    const saved = await otherIncome.create(
      t.db,
      A.ctx(),
      input({ source: '  Marketplace sale  ', note: ' Old bike ' }),
    );

    expect(saved).toMatchObject({
      date: '2026-11-12',
      source: 'Marketplace sale',
      type: 'sale',
      note: 'Old bike',
      account_id: A.accountId,
    });
    expect(Number(saved.amount_cents)).toBe(12_000);
  });

  it('keeps no account when there is no checking account, and no note when it is blank', async () => {
    const saved = await otherIncome.create(t.db, A.ctx(), input({ note: '   ' }));

    expect(saved).toMatchObject({ account_id: null, note: null });
  });

  it("refuses another household's account", async () => {
    await expect(
      otherIncome.create(t.db, A.ctx(), input({ accountId: B.accountId })),
    ).rejects.toBeInstanceOf(NotFound);
    expect(await sources('2026-11')).toEqual([]);
  });

  it.each([
    { source: ' ' },
    { amountCents: 0 },
    { amountCents: -1 },
    { amountCents: 0.5 },
    { date: '11/12/2026' },
    { type: 'lottery' as 'other' },
  ])('refuses %o', async (over) => {
    await expect(otherIncome.create(t.db, A.ctx(), input(over))).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });

  it('lists the latest entries from any month, newest first', async () => {
    await otherIncome.create(t.db, A.ctx(), input({ date: '2026-09-01', source: 'older' }));
    await otherIncome.create(t.db, A.ctx(), input({ date: '2026-11-15', source: 'newer' }));

    const found = await otherIncome.listRecent(t.db, A.ctx());

    expect(found.map((i) => i.source)).toEqual(['newer', 'older']);
  });

  it('removes an entry', async () => {
    const saved = await otherIncome.create(t.db, A.ctx(), input());

    await otherIncome.remove(t.db, A.ctx(), saved.id);

    expect(await sources('2026-11')).toEqual([]);
  });

  it('Closed months are read-only: nothing is added or removed', async () => {
    const saved = await otherIncome.create(t.db, A.ctx(), input());
    await closeMonth('2026-11');

    await expect(otherIncome.create(t.db, A.ctx(), input())).rejects.toBeInstanceOf(Conflict);
    await expect(otherIncome.remove(t.db, A.ctx(), saved.id)).rejects.toBeInstanceOf(Conflict);
    expect(await sources('2026-11')).toEqual(['Marketplace sale']);
  });
});
