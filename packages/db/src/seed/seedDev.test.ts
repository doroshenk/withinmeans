import { kept, moneyIn, moneyOut, type MonthCashflow } from '@withinmeans/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { HouseholdContext } from '../context.js';
import { accounts } from '../repos/accounts.js';
import { bills } from '../repos/bills.js';
import { categories } from '../repos/categories.js';
import { creditCards } from '../repos/creditCards.js';
import { identity } from '../repos/identity.js';
import { memberships } from '../repos/memberships.js';
import { months } from '../repos/months.js';
import { otherIncome } from '../repos/otherIncome.js';
import { paychecks } from '../repos/paychecks.js';
import { recurringBills } from '../repos/recurringBills.js';
import { setupProgress } from '../repos/setupProgress.js';
import { signUp } from '../repos/signUp.js';
import { clearAll, seedHousehold, snapshotHousehold } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { SEED_HOUSEHOLD_ID, seedDev, type SeedOptions } from './seedDev.js';

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

const NOW = new Date('2026-11-18T12:00:00Z');
const run = (options: Partial<SeedOptions> = {}) => seedDev(t.db, { now: NOW, ...options });

/** The seeded household as one of its members sees it. */
const ctx: HouseholdContext = {
  householdId: SEED_HOUSEHOLD_ID,
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'owner',
};

async function november(): Promise<MonthCashflow> {
  const [pay, income, monthBills] = await Promise.all([
    paychecks.listForMonth(t.db, ctx, '2026-11'),
    otherIncome.listForMonth(t.db, ctx, '2026-11'),
    bills.listForMonth(t.db, ctx, '2026-11'),
  ]);
  return {
    paychecks: pay.map((p) => ({
      expectedCents: Number(p.expected_cents),
      receivedCents: p.received_cents === null ? null : Number(p.received_cents),
    })),
    otherIncome: income.map((i) => ({ amountCents: Number(i.amount_cents) })),
    bills: monthBills.map((b) => ({
      estimateCents: Number(b.estimate_cents),
      actualCents: b.actual_cents === null ? null : Number(b.actual_cents),
    })),
    cards: [],
  };
}

const people = async () => (await memberships.list(t.db, ctx)).map((m) => [m.name, m.role]).sort();

describe('P2-11 the dev seed (spec §10)', () => {
  it('T2: seeded November reproduces $7,031.38 through the real repositories', async () => {
    await run();

    const month = await november();

    expect(moneyIn(month)).toBe(703_138);
    expect(moneyOut(month)).toBe(275_000);
    expect(kept(month)).toBe(428_138);
  });

  it('creates "Our household" with John and a partner', async () => {
    await run();

    const household = await t.db
      .selectFrom('households')
      .selectAll()
      .where('id', '=', SEED_HOUSEHOLD_ID)
      .executeTakeFirstOrThrow();
    expect(household).toMatchObject({
      name: 'Our household',
      mode: 'duo',
      timezone: 'America/New_York',
      first_month: '2026-11',
    });
    expect(await people()).toEqual([
      ['John', 'owner'],
      ['Sam', 'full'],
    ]);
    expect((await months.list(t.db, ctx)).map((m) => [m.ym, m.status])).toEqual([
      ['2026-11', 'open'],
    ]);
  });

  it('uses only made-up email addresses', async () => {
    await run();

    const users = await t.db.selectFrom('users').select('email').execute();

    expect(users.every((u) => u.email.endsWith('@example.test'))).toBe(true);
  });

  it('adds the 12 recurring bills, $2,750 a month, each with a category', async () => {
    await run();

    const rows = await recurringBills.list(t.db, ctx);
    const names = new Map((await categories.list(t.db, ctx)).map((c) => [c.id, c.name]));

    expect(
      rows
        .map((r) => [r.name, Number(r.estimate_cents), r.due_day, names.get(r.category_id)])
        .sort((a, b) => Number(a[1]) - Number(b[1]) || String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['CD contribution · 1', 2_000, 20, 'Savings'],
      ['CD contribution · 2', 2_000, 20, 'Savings'],
      ['Streaming', 3_600, 28, 'Subscriptions'],
      ['Lawn supplies', 4_500, 21, 'Home'],
      ['Water & sewer', 6_800, 18, 'Utilities'],
      ['Internet', 8_000, 9, 'Utilities'],
      ['Phone', 9_500, 11, 'Utilities'],
      ['HOA dues', 11_000, 25, 'Housing'],
      ['Pool service', 12_000, 3, 'Home'],
      ['Car insurance', 14_200, 13, 'Insurance'],
      ['Electric', 16_400, 5, 'Utilities'],
      ['Mortgage', 185_000, 1, 'Housing'],
    ]);
    expect(await bills.listForMonth(t.db, ctx, '2026-11')).toHaveLength(12);
  });

  it('marks Nov 6 received at $3,272.18 and leaves Nov 20 expected', async () => {
    await run();

    const pay = await paychecks.listForMonth(t.db, ctx, '2026-11');

    expect(pay.map((p) => [p.expected_date, Number(p.expected_cents), p.received_date])).toEqual([
      ['2026-11-06', 322_500, '2026-11-06'],
      ['2026-11-20', 322_500, null],
    ]);
    expect(Number(pay[0]?.received_cents)).toBe(327_218);
  });

  it('adds three one-time income entries, $534.20', async () => {
    await run();

    const income = await otherIncome.listForMonth(t.db, ctx, '2026-11');

    expect(income.map((i) => [i.date, i.type, Number(i.amount_cents)])).toEqual([
      ['2026-11-15', 'refund', 6_420],
      ['2026-11-12', 'sale', 12_000],
      ['2026-11-03', 'side_work', 35_000],
    ]);
    expect(income.every((i) => i.account_id !== null)).toBe(true);
  });

  it('sets up accounts and leaves setup finished', async () => {
    await run();

    const listed = await accounts.list(t.db, ctx);
    expect(listed.map((a) => [a.name, a.type, a.is_primary_checking]).sort()).toEqual([
      ['Cash', 'cash', false],
      ['Everyday checking', 'checking', true],
      ['High-yield savings', 'savings', false],
    ]);
    const steps = await setupProgress.list(t.db, ctx);
    expect(steps.map((s) => [s.step, s.status])).toEqual([
      [1, 'done'],
      [2, 'done'],
      [3, 'done'],
      [4, 'done'],
      [5, 'done'],
      [6, 'skipped'],
      [9, 'done'],
    ]);
  });
});

describe('P2-11 running it again', () => {
  it('refuses, and changes nothing', async () => {
    await run();
    const rows = (await recurringBills.list(t.db, ctx)).map((r) => r.id).sort();

    await expect(run()).rejects.toThrow(/--reset/);

    expect((await recurringBills.list(t.db, ctx)).map((r) => r.id).sort()).toEqual(rows);
  });

  it('--reset rebuilds the seeded household from nothing', async () => {
    await run();
    await creditCards.create(t.db, ctx, { nickname: 'Extra', dueDay: 1, usualPlan: 'full' });

    await run({ reset: true });

    expect(await creditCards.list(t.db, ctx)).toEqual([]);
    expect(await recurringBills.list(t.db, ctx)).toHaveLength(12);
    expect(await people()).toHaveLength(2);
    expect(moneyIn(await november())).toBe(703_138);
  });

  it('never touches another household', async () => {
    const other = await seedHousehold(t.db, 'B');
    const before = await snapshotHousehold(t.db, other);

    await run();
    await run({ reset: true });

    expect(await snapshotHousehold(t.db, other)).toEqual(before);
  });
});

describe('P2-11 signing in to the seeded household', () => {
  const OWNER = 'owner@dev.example.test';
  const signedUp = () =>
    signUp.createHousehold(t.db, {
      mode: 'solo',
      householdName: 'Trying it out',
      userName: 'Jo',
      email: OWNER,
      cognitoSub: 'sub-real',
      timezone: 'America/New_York',
      firstMonth: '2026-11',
    });
  const membership = async () => (await identity.findByCognitoSub(t.db, 'sub-real'))?.membership;

  it('refuses an email with no dev login, before changing anything', async () => {
    await run();

    await expect(run({ reset: true, ownerEmail: 'nobody@example.test' })).rejects.toThrow(
      /sign up/i,
    );

    expect(await people()).toHaveLength(2);
  });

  it('asks before moving a login out of its own household', async () => {
    await signedUp();

    await expect(run({ ownerEmail: OWNER })).rejects.toThrow(/--leave-household/);

    expect((await membership())?.householdName).toBe('Trying it out');
    expect(await people()).toEqual([]);
  });

  it('makes that login the owner, in place of the made-up John', async () => {
    const own = await signedUp();

    await run({ ownerEmail: ' Owner@Dev.Example.Test ', leaveHousehold: true });

    expect(await membership()).toMatchObject({ householdId: SEED_HOUSEHOLD_ID, role: 'owner' });
    expect(await people()).toEqual([
      ['Jo', 'owner'],
      ['Sam', 'full'],
    ]);
    // Their old household stays, without them.
    const old = await t.db
      .selectFrom('households')
      .select('id')
      .where('id', '=', own.householdId)
      .execute();
    expect(old).toHaveLength(1);
  });

  it('--reset keeps the real logins that are in the household', async () => {
    await signedUp();
    await run({ ownerEmail: OWNER, leaveHousehold: true });

    await run({ reset: true });

    expect(await membership()).toMatchObject({ householdId: SEED_HOUSEHOLD_ID, role: 'owner' });
    expect(await people()).toEqual([
      ['Jo', 'owner'],
      ['Sam', 'full'],
    ]);
  });

  it('a second login can take over, and the first keeps full access', async () => {
    await signedUp();
    await run({ ownerEmail: OWNER, leaveHousehold: true });
    await signUp.createHousehold(t.db, {
      mode: 'solo',
      householdName: 'Second',
      userName: 'Kit',
      email: 'kit@dev.example.test',
      cognitoSub: 'sub-kit',
      timezone: 'America/New_York',
      firstMonth: '2026-11',
    });

    await run({ reset: true, ownerEmail: 'kit@dev.example.test', leaveHousehold: true });

    expect(await people()).toEqual([
      ['Jo', 'full'],
      ['Kit', 'owner'],
      ['Sam', 'full'],
    ]);
  });
});
