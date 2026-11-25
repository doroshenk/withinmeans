import { createTestDb, type TestDb } from '@withinmeans/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  await t.db
    .insertInto('households')
    .values([
      { id: H1, name: 'One', mode: 'duo', timezone: 'America/New_York', first_month: '2026-12' },
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
afterAll(async () => {
  await t.destroy();
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

describe('P1-12 recurring bills API (setup step 5)', () => {
  it('adds bills, lists them by due day with their category, and totals the estimates', async () => {
    const owner = await caller('sub-owner');
    await owner.seedDefaultCategories({ preset: 'default' });
    const [housing, utilities] = await owner.categories();

    await owner.addRecurringBill({
      name: ' Electric ',
      estimateCents: 12_050,
      dueDay: 20,
      categoryId: utilities?.id ?? '',
      autopay: false,
    });
    await owner.addRecurringBill({
      name: 'Rent',
      estimateCents: 150_000,
      dueDay: 1,
      categoryId: housing?.id ?? '',
      autopay: true,
    });

    const view = await owner.setupBills();
    expect(view.bills.map((b) => [b.name, b.dueDay, b.categoryName, b.autopay])).toEqual([
      ['Rent', 1, 'Housing', true],
      ['Electric', 20, 'Utilities', false],
    ]);
    expect(view.bills[0]).toMatchObject({ id: expect.any(String), estimateCents: 150_000 });
    expect(view.totalCents).toBe(162_050);
  });

  it('a new bill starts in the household first month', async () => {
    const rows = await t.db
      .selectFrom('recurring_bills')
      .select('start_ym')
      .where('household_id', '=', H1)
      .execute();
    expect(rows.map((r) => r.start_ym)).toEqual(['2026-12', '2026-12']);
  });

  it('take-home is null until paychecks exist (the share shows "—")', async () => {
    expect((await (await caller('sub-owner')).setupBills()).takeHomeCents).toBeNull();
  });

  it('rejects estimate 0 and due days outside 1–28 as BAD_REQUEST', async () => {
    const owner = await caller('sub-owner');
    const categoryId = (await owner.categories())[0]?.id ?? '';
    const bill = { name: 'Gym', estimateCents: 3_000, dueDay: 5, categoryId, autopay: false };

    await expect(owner.addRecurringBill({ ...bill, estimateCents: 0 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(owner.addRecurringBill({ ...bill, dueDay: 29 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(owner.addRecurringBill({ ...bill, dueDay: 0 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it("another household's data looks missing or empty", async () => {
    const owner = await caller('sub-owner');
    const other = await caller('sub-other');
    const mine = (await owner.setupBills()).bills[0];
    const theirCategory = await other.createCategory({ name: 'Housing', colorIndex: 0 });

    expect((await other.setupBills()).bills).toEqual([]);
    await expect(
      owner.addRecurringBill({
        name: 'Sneaky',
        estimateCents: 100,
        dueDay: 1,
        categoryId: theirCategory.id,
        autopay: false,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(other.removeRecurringBill({ id: mine?.id ?? '' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('removes a bill and the total drops', async () => {
    const owner = await caller('sub-owner');
    const electric = (await owner.setupBills()).bills.find((b) => b.name === 'Electric');

    await owner.removeRecurringBill({ id: electric?.id ?? '' });

    const view = await owner.setupBills();
    expect(view.bills.map((b) => b.name)).toEqual(['Rent']);
    expect(view.totalCents).toBe(150_000);
  });

  it('a view-only member can read, not change', async () => {
    const view = await caller('sub-view');
    const rent = (await view.setupBills()).bills[0];

    expect((await view.setupBills()).bills).toHaveLength(1);
    await expect(
      view.addRecurringBill({
        name: 'Gym',
        estimateCents: 3_000,
        dueDay: 5,
        categoryId: rent?.categoryId ?? '',
        autopay: false,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(view.removeRecurringBill({ id: rent?.id ?? '' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
