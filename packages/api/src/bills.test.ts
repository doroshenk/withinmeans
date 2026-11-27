import { createTestDb, type TestDb } from '@withinmeans/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createContextFactory } from './context.js';
import { appRouter } from './router.js';
import {
  captureLogger,
  fakeIdentityProvider,
  fakeInviteDeps,
  fakeVerifier,
  testClock,
} from './testing.js';

const H1 = '11111111-1111-4111-8111-111111111111';
const H2 = '22222222-2222-4222-8222-222222222222';
const U_OWNER = '33333333-3333-4333-8333-333333333333';
const U_VIEW = '44444444-4444-4444-8444-444444444444';
const U_OTHER = '55555555-5555-4555-8555-555555555555';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
});
beforeEach(async () => {
  for (const table of [
    'bills',
    'paychecks',
    'pay_schedules',
    'other_income',
    'recurring_bills',
    'categories',
    'balance_snapshots',
    'accounts',
    'months',
    'memberships',
    'users',
    'households',
  ] as const) {
    await t.db.deleteFrom(table).execute();
  }
  await t.db
    .insertInto('households')
    .values([
      { id: H1, name: 'One', mode: 'duo', timezone: 'America/New_York', first_month: '2026-11' },
      { id: H2, name: 'Two', mode: 'solo', timezone: 'America/New_York', first_month: '2026-11' },
    ])
    .execute();
  await t.db
    .insertInto('users')
    .values([
      { id: U_OWNER, email: 'owner@example.test', name: 'Olive', cognito_sub: 'sub-owner' },
      { id: U_VIEW, email: 'view@example.test', name: 'Vic', cognito_sub: 'sub-view' },
      { id: U_OTHER, email: 'other@example.test', name: 'Otto', cognito_sub: 'sub-other' },
    ])
    .execute();
  await t.db
    .insertInto('memberships')
    .values([
      { household_id: H1, user_id: U_OWNER, role: 'owner' },
      { household_id: H1, user_id: U_VIEW, role: 'view' },
      { household_id: H2, user_id: U_OTHER, role: 'owner' },
    ])
    .execute();
});

async function caller(sub: string) {
  const { logger } = captureLogger();
  const ctx = await createContextFactory({
    db: t.db,
    verifier: fakeVerifier,
    logger,
    identityProvider: fakeIdentityProvider(),
    clock: testClock,
    invites: fakeInviteDeps(),
  })(`Bearer good:${sub}`);
  return appRouter.createCaller(ctx);
}

/** An owner with one category, a recurring water bill and a biweekly paycheck. */
async function setUp() {
  const owner = await caller('sub-owner');
  const category = await owner.createCategory({ name: 'Utilities', colorIndex: 1 });
  await owner.addRecurringBill({
    name: 'Water & sewer',
    estimateCents: 6_800,
    dueDay: 18,
    categoryId: category.id,
    autopay: true,
  });
  await owner.addPaySchedule({
    name: 'Main job',
    frequency: 'biweekly',
    anchorDate: '2026-11-06',
    usualCents: 322_500,
  });
  return { owner, categoryId: category.id };
}

describe('P2-06 the Bills page query', () => {
  it('previews a month that is not started from the recurring bills and schedules', async () => {
    const { owner, categoryId } = await setUp();

    const page = await owner.billsPage({});

    expect(page).toMatchObject({
      today: '2026-11-18',
      ym: '2026-11',
      status: 'not-started',
      canOpen: true,
      categories: [{ id: categoryId, name: 'Utilities', colorIndex: 1 }],
    });
    expect(page.bills).toEqual([
      {
        id: null,
        name: 'Water & sewer',
        categoryId,
        dueDate: '2026-11-18',
        estimateCents: 6_800,
        actualCents: null,
        paid: false,
        kind: 'recurring',
        autopay: true,
      },
    ]);
    expect(page.paychecks.map((p) => [p.id, p.expectedDate])).toEqual([
      [null, '2026-11-06'],
      [null, '2026-11-20'],
    ]);
  });

  it('shows one-time bills already added to a month not started, with the preview', async () => {
    const { owner, categoryId } = await setUp();
    await owner.addBill({
      name: 'Tires',
      amountCents: 6_000,
      dueDate: '2026-12-03',
      categoryId,
      paid: false,
    });

    const page = await owner.billsPage({ ym: '2026-12' });

    expect(page.bills.map((b) => [b.name, b.id === null])).toEqual([
      ['Tires', false],
      ['Water & sewer', true],
    ]);
  });

  it('"Open {month}" calls openMonth and the month is then open', async () => {
    const { owner } = await setUp();

    await expect(owner.openMonth({ ym: '2026-11' })).resolves.toEqual({ created: true });

    const page = await owner.billsPage({ ym: '2026-11' });
    expect(page.status).toBe('open');
    expect(page.canOpen).toBe(false);
    expect(page.bills).toHaveLength(1);
    expect(page.bills[0]?.id).toEqual(expect.any(String));
    expect(page.paychecks.every((p) => p.id !== null)).toBe(true);
    await expect(owner.openMonth({ ym: '2026-11' })).resolves.toEqual({ created: false });
    expect((await owner.billsPage({ ym: '2026-11' })).bills).toHaveLength(1);
  });

  it.each(['2026-10', '2027-01'])('refuses to open %s', async (ym) => {
    const { owner } = await setUp();

    expect((await owner.billsPage({ ym })).canOpen).toBe(false);
    await expect(owner.openMonth({ ym })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await owner.billsPage({ ym })).status).toBe('not-started');
  });

  it("includes the month's one-time income", async () => {
    const { owner } = await setUp();
    await owner.addAccount({ name: 'Checking', type: 'checking', balanceCents: 0 });
    await owner.addOtherIncome({
      date: '2026-11-12',
      source: 'Sale',
      type: 'sale',
      amountCents: 12_000,
    });

    const page = await owner.billsPage({});

    expect(page.otherIncome).toEqual([
      { id: expect.any(String), type: 'sale', amountCents: 12_000 },
    ]);
  });

  it('shows a view-only member the page, and another household none of it', async () => {
    const { owner } = await setUp();
    await owner.openMonth({ ym: '2026-11' });

    expect((await (await caller('sub-view')).billsPage({})).bills).toHaveLength(1);
    const other = await (await caller('sub-other')).billsPage({});
    expect(other.bills).toEqual([]);
    expect(other.categories).toEqual([]);
  });
});

describe('P2-06 changing bills', () => {
  const water = async (api: Awaited<ReturnType<typeof caller>>) =>
    (await api.billsPage({ ym: '2026-11' })).bills[0];

  it('Paid toggle sets actual_cents and paid_at', async () => {
    const { owner } = await setUp();
    await owner.openMonth({ ym: '2026-11' });
    const id = (await water(owner))?.id ?? '';

    await owner.setBillPaid({ id, paid: true });

    const saved = await t.db
      .selectFrom('bills')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(saved.actual_cents).toBe(6_800);
    expect(saved.paid_at).toEqual(new Date('2026-11-18T12:00:00Z'));
    expect(await water(owner)).toMatchObject({ paid: true, actualCents: 6_800 });

    await owner.setBillPaid({ id, paid: false });
    expect(await water(owner)).toMatchObject({ paid: false, actualCents: null });
  });

  it('adds, edits and removes a bill', async () => {
    const { owner, categoryId } = await setUp();
    await owner.openMonth({ ym: '2026-11' });

    const { id } = await owner.addBill({
      name: 'Tires',
      amountCents: 6_000,
      dueDate: '2026-11-24',
      categoryId,
      paid: true,
    });
    await owner.updateBill({
      id,
      name: 'New tires',
      amountCents: 6_500,
      dueDate: '2026-11-25',
      categoryId,
    });
    const edited = (await owner.billsPage({ ym: '2026-11' })).bills.find((b) => b.id === id);
    expect(edited).toMatchObject({
      name: 'New tires',
      actualCents: 6_500,
      estimateCents: 6_500,
      paid: true,
      kind: 'one_time',
    });

    await owner.removeBill({ id });
    expect((await owner.billsPage({ ym: '2026-11' })).bills).toHaveLength(1);
  });

  it("rejects another household's bill", async () => {
    const { owner } = await setUp();
    await owner.openMonth({ ym: '2026-11' });
    const id = (await water(owner))?.id ?? '';
    const other = await caller('sub-other');

    await expect(other.setBillPaid({ id, paid: true })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(other.removeBill({ id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects changes to a closed month', async () => {
    const { owner } = await setUp();
    await owner.openMonth({ ym: '2026-11' });
    const id = (await water(owner))?.id ?? '';
    await t.db.updateTable('months').set({ status: 'closed' }).execute();

    await expect(owner.setBillPaid({ id, paid: true })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await owner.billsPage({ ym: '2026-11' })).status).toBe('closed');
  });
});
