import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conflict, InvalidInput, NotFound } from '../context.js';
import { clearAll, seedHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { bills, type NewBill } from './bills.js';
import { openMonth } from './openMonth.js';

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

const NOW = new Date('2026-11-18T12:00:00Z');
const LATER = new Date('2026-11-19T12:00:00Z');

const input = (over: Partial<NewBill> = {}): NewBill => ({
  name: 'Tire rotation',
  amountCents: 6_000,
  dueDate: '2026-11-24',
  categoryId: A.categoryId,
  paid: false,
  ...over,
});

const row = (id: string) =>
  t.db.selectFrom('bills').selectAll().where('id', '=', id).executeTakeFirst();

/** The seeded recurring bill's row: November, estimate $500, unpaid. */
const seeded = () => row(A.billId);

const closeMonth = (ym: string) =>
  t.db
    .updateTable('months')
    .set({ status: 'closed', closed_at: new Date('2026-12-01T12:00:00Z') })
    .where('household_id', '=', A.householdId)
    .where('ym', '=', ym)
    .execute();

describe('P2-06 bills repository: the month list', () => {
  it("lists the month's bills by due date, with each recurring bill's autopay", async () => {
    await t.db
      .updateTable('recurring_bills')
      .set({ autopay: true })
      .where('id', '=', A.recurringBillId)
      .execute();
    await bills.create(t.db, A.ctx(), input());
    await bills.create(t.db, A.ctx(), input({ name: 'December', dueDate: '2026-12-01' }));

    const listed = await bills.listForMonth(t.db, A.ctx(), '2026-11');

    expect(listed.map((b) => [b.name, b.due_date, b.autopay])).toEqual([
      ['A-secret bill', '2026-11-01', true],
      ['Tire rotation', '2026-11-24', false],
    ]);
  });

  it('rejects a month that is not "YYYY-MM"', async () => {
    await expect(bills.listForMonth(t.db, A.ctx(), '2026-13')).rejects.toBeInstanceOf(InvalidInput);
  });
});

describe('P2-06 bills repository: one-time bills', () => {
  it('adds a bill still owed to the month of its date', async () => {
    const added = await bills.create(t.db, A.ctx(), input({ name: '  Tires ' }), NOW);

    expect(added).toMatchObject({
      name: 'Tires',
      ym: '2026-11',
      kind: 'one_time',
      recurring_bill_id: null,
      due_date: '2026-11-24',
      estimate_cents: 6_000,
      actual_cents: null,
      paid_at: null,
    });
  });

  it('adds a bill already paid with its amount and time', async () => {
    const added = await bills.create(t.db, A.ctx(), input({ paid: true }), NOW);

    expect(added).toMatchObject({ actual_cents: 6_000, paid_at: NOW });
  });

  it('goes into a month that is not started', async () => {
    const added = await bills.create(t.db, A.ctx(), input({ dueDate: '2027-01-05' }), NOW);

    expect(added.ym).toBe('2027-01');
  });

  it.each([
    [{ name: '  ' }, 'name'],
    [{ amountCents: 0 }, 'amount'],
    [{ amountCents: 1.5 }, 'cents'],
    [{ amountCents: 10_000_000_001 }, 'big'],
    [{ dueDate: '2026-11-31' }, 'date'],
    [{ dueDate: 'soon' }, 'date'],
  ])('rejects %o', async (over, _why) => {
    await expect(bills.create(t.db, A.ctx(), input(over), NOW)).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });

  it("rejects another household's category", async () => {
    await expect(
      bills.create(t.db, A.ctx(), input({ categoryId: B.categoryId }), NOW),
    ).rejects.toBeInstanceOf(NotFound);
  });
});

describe('P2-06 bills repository: paid and unpaid', () => {
  it('Paid toggle sets actual_cents and paid_at', async () => {
    await bills.setPaid(t.db, A.ctx(), A.billId, true, NOW);

    expect(await seeded()).toMatchObject({
      estimate_cents: 50_000,
      actual_cents: 50_000,
      paid_at: NOW,
    });
  });

  it('keeps an actual amount already entered', async () => {
    await bills.update(t.db, A.ctx(), A.billId, {
      name: 'Water',
      amountCents: 52_500,
      dueDate: '2026-11-01',
      categoryId: A.categoryId,
    });

    await bills.setPaid(t.db, A.ctx(), A.billId, true, NOW);
    await bills.setPaid(t.db, A.ctx(), A.billId, false, LATER);

    expect(await seeded()).toMatchObject({ actual_cents: 52_500, paid_at: null });
  });

  it('keeps the first time when marked paid twice', async () => {
    await bills.setPaid(t.db, A.ctx(), A.billId, true, NOW);
    await bills.setPaid(t.db, A.ctx(), A.billId, true, LATER);

    expect((await seeded())?.paid_at).toEqual(NOW);
  });

  it('goes back to the estimate when unmarked, so later estimate changes reach it', async () => {
    await bills.setPaid(t.db, A.ctx(), A.billId, true, NOW);
    await bills.setPaid(t.db, A.ctx(), A.billId, false, LATER);

    expect(await seeded()).toMatchObject({ actual_cents: null, paid_at: null });
  });
});

describe('P2-06 bills repository: edit and delete', () => {
  const edit = (over: Partial<Omit<NewBill, 'paid'>> = {}) => ({
    name: 'Water & sewer',
    amountCents: 52_500,
    dueDate: '2026-11-09',
    categoryId: A.categoryId,
    ...over,
  });

  it("on a recurring bill sets this month's actual amount and keeps the estimate", async () => {
    await bills.update(t.db, A.ctx(), A.billId, edit());

    expect(await seeded()).toMatchObject({
      name: 'Water & sewer',
      due_date: '2026-11-09',
      estimate_cents: 50_000,
      actual_cents: 52_500,
      paid_at: null,
    });
  });

  it('on an unpaid recurring bill, the estimate typed again means no actual amount', async () => {
    await bills.update(t.db, A.ctx(), A.billId, edit());
    await bills.update(t.db, A.ctx(), A.billId, edit({ amountCents: 50_000 }));

    expect((await seeded())?.actual_cents).toBeNull();
  });

  it('on a paid bill changes what was paid, even back to the estimate', async () => {
    await bills.setPaid(t.db, A.ctx(), A.billId, true, NOW);
    await bills.update(t.db, A.ctx(), A.billId, edit({ amountCents: 50_000 }));

    expect(await seeded()).toMatchObject({ actual_cents: 50_000, paid_at: NOW });
  });

  it('on a one-time bill changes its amount', async () => {
    const added = await bills.create(t.db, A.ctx(), input(), NOW);

    await bills.update(t.db, A.ctx(), added.id, edit({ amountCents: 7_500 }));

    expect(await row(added.id)).toMatchObject({ estimate_cents: 7_500, actual_cents: null });
    await bills.setPaid(t.db, A.ctx(), added.id, true, NOW);
    await bills.update(t.db, A.ctx(), added.id, edit({ amountCents: 8_000 }));
    expect(await row(added.id)).toMatchObject({ estimate_cents: 8_000, actual_cents: 8_000 });
  });

  it('does not let a one-time bill become $0', async () => {
    const added = await bills.create(t.db, A.ctx(), input(), NOW);

    await expect(
      bills.update(t.db, A.ctx(), added.id, edit({ amountCents: 0 })),
    ).rejects.toBeInstanceOf(InvalidInput);
    expect((await row(added.id))?.estimate_cents).toBe(6_000);
  });

  it('lets a recurring bill come to $0 in a month', async () => {
    await bills.update(t.db, A.ctx(), A.billId, edit({ amountCents: 0 }));

    expect((await seeded())?.actual_cents).toBe(0);
  });

  it('keeps a bill in its month', async () => {
    await expect(
      bills.update(t.db, A.ctx(), A.billId, edit({ dueDate: '2026-12-09' })),
    ).rejects.toBeInstanceOf(InvalidInput);
  });

  it.each([{ name: ' ' }, { amountCents: -1 }, { dueDate: 'soon' }])(
    'rejects an edit with %o',
    async (over) => {
      await expect(bills.update(t.db, A.ctx(), A.billId, edit(over))).rejects.toBeInstanceOf(
        InvalidInput,
      );
    },
  );

  it("rejects another household's category on an edit", async () => {
    await expect(
      bills.update(t.db, A.ctx(), A.billId, edit({ categoryId: B.categoryId })),
    ).rejects.toBeInstanceOf(NotFound);
  });

  it('removes a bill, which opening the month again does not bring back', async () => {
    await bills.remove(t.db, A.ctx(), A.billId);
    await openMonth(t.db, A.ctx(), '2026-11', NOW);

    expect(await bills.listForMonth(t.db, A.ctx(), '2026-11')).toEqual([]);
  });

  it('rejects an id that is not there', async () => {
    await expect(bills.remove(t.db, A.ctx(), B.billId)).rejects.toBeInstanceOf(NotFound);
  });
});

describe('P2-06 bills repository: a closed month is read-only (spec §5.11)', () => {
  it.each([
    ['create', () => bills.create(t.db, A.ctx(), input(), NOW)],
    [
      'update',
      () =>
        bills.update(t.db, A.ctx(), A.billId, {
          name: 'x',
          amountCents: 1,
          dueDate: '2026-11-01',
          categoryId: A.categoryId,
        }),
    ],
    ['setPaid', () => bills.setPaid(t.db, A.ctx(), A.billId, true, NOW)],
    ['remove', () => bills.remove(t.db, A.ctx(), A.billId)],
  ] as const)('rejects %s', async (_name, change) => {
    await closeMonth('2026-11');

    await expect(change()).rejects.toBeInstanceOf(Conflict);
    expect(await bills.listForMonth(t.db, A.ctx(), '2026-11')).toHaveLength(1);
    expect(await seeded()).toMatchObject({ paid_at: null, name: 'A-secret bill' });
  });
});
