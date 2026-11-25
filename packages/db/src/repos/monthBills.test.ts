import { readFileSync } from 'node:fs';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../db.js';
import { MIGRATIONS_DIR } from '../migrate.js';
import { splitStatements } from '../sqlStatements.js';
import { clearAll, seedHousehold, snapshotHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { categories } from './categories.js';
import { households } from './households.js';
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
    startYm: '2026-01',
    ...over,
  });

const open = (ym: string) => openMonth(t.db, A.ctx(), ym, NOW);

const billsOf = (s: Seeded) =>
  t.db
    .selectFrom('bills')
    .selectAll()
    .where('household_id', '=', s.householdId)
    .orderBy('ym')
    .orderBy('name')
    .execute();

const summary = async () => (await billsOf(A)).map((b) => `${b.ym} ${b.name}`);

const close = (ym: string) =>
  t.db
    .updateTable('months')
    .set({ status: 'closed', closed_at: NOW })
    .where('household_id', '=', A.householdId)
    .where('ym', '=', ym)
    .execute();

const endYmOf = async (id: string) =>
  (await recurringBills.list(t.db, A.ctx())).find((r) => r.id === id)?.end_ym;

/** `db` whose first insert into `bills` inside a transaction throws an error with `code`. */
function failingOnce(db: Database, code: string) {
  let failures = 0;
  const bound = (target: object, prop: string | symbol): unknown => {
    const value = Reflect.get(target, prop) as unknown;
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value;
  };
  const wrapTrx = <T extends object>(trx: T): T =>
    new Proxy(trx, {
      get(target, prop) {
        if (prop !== 'insertInto') return bound(target, prop);
        return (table: string) => {
          if (table === 'bills' && failures === 0) {
            failures += 1;
            throw Object.assign(new Error('injected'), { code });
          }
          return (bound(target, prop) as (t: string) => unknown)(table);
        };
      },
    });
  const proxy = new Proxy(db, {
    get(target, prop) {
      if (prop !== 'transaction') return bound(target, prop);
      return () => ({
        execute: <T>(fn: (trx: never) => Promise<T>) =>
          target.transaction().execute((trx) => fn(wrapTrx(trx) as never)),
      });
    },
  });
  return { db: proxy, failures: () => failures };
}

describe('P2-01 openMonth creates the bills (spec §5.11)', () => {
  it('creates one unpaid Bill per recurring bill, at its estimate and due date', async () => {
    const rent = await add();
    await add({ name: 'Electric', estimateCents: 12_050, dueDay: 28 });

    await open('2026-11');

    const rows = await billsOf(A);
    expect(rows.map((b) => [b.name, b.due_date, b.estimate_cents])).toEqual([
      ['Electric', '2026-11-28', 12_050],
      ['Rent', '2026-11-01', 150_000],
    ]);
    expect(rows[1]).toMatchObject({
      ym: '2026-11',
      recurring_bill_id: rent.id,
      category_id: A.categoryId,
      kind: 'recurring',
      actual_cents: null,
      paid_at: null,
    });
  });

  it('skips recurring bills with start_ym > ym or end_ym < ym', async () => {
    await add({ name: 'Active' });
    await add({ name: 'Starts this month', startYm: '2026-11' });
    await add({ name: 'Ends this month', endYm: '2026-11' });
    await add({ name: 'Not started', startYm: '2026-12' });
    await add({ name: 'Ended', endYm: '2026-10' });

    await open('2026-11');

    expect(await summary()).toEqual([
      '2026-11 Active',
      '2026-11 Ends this month',
      '2026-11 Starts this month',
    ]);
  });

  it('running openMonth twice creates no duplicate bills', async () => {
    await add();
    await open('2026-11');
    const first = await billsOf(A);

    await open('2026-11');

    expect(first).toHaveLength(1);
    expect(await billsOf(A)).toEqual(first);
  });

  it('two calls at the same moment create each bill once', async () => {
    await add();

    await Promise.all([open('2026-11'), open('2026-11')]);

    expect(await summary()).toEqual(['2026-11 Rent']);
  });

  it('opening again does not bring back a bill that was taken out of the month', async () => {
    await add();
    await open('2026-11');
    await t.db.deleteFrom('bills').where('household_id', '=', A.householdId).execute();

    await open('2026-11');

    expect(await billsOf(A)).toEqual([]);
  });

  it("uses only this household's recurring bills", async () => {
    await add();
    const before = await snapshotHousehold(t.db, B);

    await open('2026-10');

    expect(await summary()).toEqual(['2026-10 Rent']);
    expect(await snapshotHousehold(t.db, B)).toEqual(before);
  });

  it('startFirstMonth creates the bills too', async () => {
    await add();

    await households.startFirstMonth(t.db, A.ctx(), '2026-11', NOW);

    expect(await summary()).toEqual(['2026-11 Rent']);
  });

  it('retries the whole transaction after a conflict: one Month, one set of bills', async () => {
    await add();
    const flaky = failingOnce(t.db, '40001');

    const result = await openMonth(flaky.db, A.ctx(), '2026-11', NOW);

    expect(flaky.failures()).toBe(1);
    expect(result.created).toBe(true);
    expect(await summary()).toEqual(['2026-11 Rent']);
  });

  it('opens nothing if the bills cannot be written', async () => {
    await add();
    const broken = failingOnce(t.db, 'XX000');

    await expect(openMonth(broken.db, A.ctx(), '2026-11', NOW)).rejects.toThrow('injected');

    const opened = await t.db
      .selectFrom('months')
      .selectAll()
      .where('household_id', '=', A.householdId)
      .execute();
    expect(opened).toEqual([]);
  });
});

describe('P2-01 recurring bill changes and open months', () => {
  it('a new recurring bill gets a Bill in each open month it is active in', async () => {
    await open('2026-10');
    await open('2026-11');
    await open('2026-12');
    await open('2027-01');
    await close('2026-12');

    await add({ startYm: '2026-11' });

    expect(await summary()).toEqual(['2026-11 Rent', '2027-01 Rent']);
  });

  it('ending a recurring bill never deletes past months’ Bills', async () => {
    const rent = await add();
    await open('2026-10');
    await open('2026-11');

    await recurringBills.end(t.db, A.ctx(), rent.id, '2026-10');
    await open('2026-12');

    expect(await summary()).toEqual(['2026-10 Rent', '2026-11 Rent']);
  });

  it('removing a bill with no history deletes it and its Bills', async () => {
    const rent = await add({ startYm: '2026-11' });
    await open('2026-11');
    await open('2026-12');

    await recurringBills.remove(t.db, A.ctx(), rent.id, '2026-11');

    expect(await billsOf(A)).toEqual([]);
    expect(await recurringBills.list(t.db, A.ctx())).toEqual([]);
  });

  it('removing a bill with past months keeps those Bills and ends it instead', async () => {
    const rent = await add();
    await open('2026-09');
    await open('2026-10');
    await open('2026-11');

    await recurringBills.remove(t.db, A.ctx(), rent.id, '2026-11');

    expect(await summary()).toEqual(['2026-09 Rent', '2026-10 Rent']);
    expect(await endYmOf(rent.id)).toBe('2026-10');
  });

  it.each([
    ['paid', { paid_at: NOW }],
    ['given an actual amount', { actual_cents: 149_000 }],
  ])('removing a bill keeps a Bill of this month that was %s', async (_how, change) => {
    const rent = await add();
    await open('2026-11');
    await t.db.updateTable('bills').set(change).where('household_id', '=', A.householdId).execute();
    await open('2026-12');

    await recurringBills.remove(t.db, A.ctx(), rent.id, '2026-11');

    expect(await summary()).toEqual(['2026-11 Rent']);
    expect(await endYmOf(rent.id)).toBe('2026-11');
  });

  it('removing a bill leaves a closed month alone', async () => {
    const rent = await add();
    await open('2026-11');
    await close('2026-11');

    await recurringBills.remove(t.db, A.ctx(), rent.id, '2026-11');

    expect(await summary()).toEqual(['2026-11 Rent']);
    expect(await endYmOf(rent.id)).toBe('2026-11');
  });

  it('removing needs a real current month', async () => {
    const rent = await add();

    await expect(recurringBills.remove(t.db, A.ctx(), rent.id, 'Nov')).rejects.toThrow(
      /current month/,
    );
  });

  it('deleting a category moves its Bills too, one-time ones included', async () => {
    await add();
    await open('2026-11');
    await t.db
      .insertInto('bills')
      .values({
        household_id: A.householdId,
        ym: '2026-11',
        recurring_bill_id: null,
        name: 'Plumber',
        category_id: A.categoryId,
        due_date: '2026-11-20',
        estimate_cents: null,
        actual_cents: 20_000,
        paid_at: null,
        kind: 'one_time',
      })
      .execute();
    const spare = await categories.create(t.db, A.ctx(), { name: 'Spare', colorIndex: 1 });

    const result = await categories.remove(t.db, A.ctx(), A.categoryId);

    expect((await billsOf(A)).map((b) => b.category_id)).toEqual([spare.id, spare.id]);
    // The recurring bill and the one-time bill; the recurring bill's own row is not counted again.
    expect(result.movedCount).toBe(2);
  });
});

describe('P2-01 backfill migration (months opened before bills existed)', () => {
  const backfill = async () => {
    const text = readFileSync(new URL('0005_backfill_bills.sql', MIGRATIONS_DIR), 'utf8');
    for (const statement of splitStatements(text)) await sql.raw(statement).execute(t.db);
  };

  it('creates the missing bills of open months only, once', async () => {
    // Rows are written directly, as v0.1.0 left them: no bills.
    const month = { household_id: A.householdId, started_at: NOW };
    await t.db
      .insertInto('months')
      .values([
        { ...month, ym: '2026-10', status: 'closed', closed_at: NOW },
        { ...month, ym: '2026-11', status: 'open', closed_at: null },
      ])
      .execute();
    const base = {
      household_id: A.householdId,
      estimate_cents: 4_000,
      due_day: 7,
      category_id: A.categoryId,
      account_id: null,
    };
    await t.db
      .insertInto('recurring_bills')
      .values([
        { ...base, name: 'Phone', start_ym: '2026-10', end_ym: null },
        { ...base, name: 'Later', start_ym: '2026-12', end_ym: null },
        { ...base, name: 'Gone', start_ym: '2026-01', end_ym: '2026-10' },
      ])
      .execute();
    const otherBefore = await billsOf(B);

    await backfill();
    await backfill();

    const rows = await billsOf(A);
    expect(rows.map((b) => [b.ym, b.name, b.due_date, b.estimate_cents, b.kind])).toEqual([
      ['2026-11', 'Phone', '2026-11-07', 4_000, 'recurring'],
    ]);
    // Household B already had its bill.
    expect(await billsOf(B)).toEqual(otherBefore);
  });
});
