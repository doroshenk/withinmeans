import { openMonth } from '@withinmeans/db';
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
const OWNER = { householdId: H1, userId: U_OWNER, role: 'owner' as const };
const NOW = new Date('2026-11-18T12:00:00Z');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.db
    .insertInto('households')
    .values([
      // Tracking began in September; "today" is Nov 18.
      { id: H1, name: 'One', mode: 'duo', timezone: 'America/New_York', first_month: '2026-09' },
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
  for (const ym of ['2026-09', '2026-10', '2026-11']) await openMonth(t.db, OWNER, ym, NOW);
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

const monthsOf = async (recurringId: string) =>
  (
    await t.db
      .selectFrom('bills')
      .select(['ym', 'estimate_cents'])
      .where('recurring_bill_id', '=', recurringId)
      .orderBy('ym')
      .execute()
  ).map((b) => [b.ym, b.estimate_cents]);

let rentId = '';
let housingId = '';
let utilitiesId = '';

const rent = () => ({
  name: 'Rent',
  estimateCents: 150_000,
  dueDay: 1,
  categoryId: housingId,
  autopay: true,
});

describe('P2-08 recurring bills API', () => {
  it('a bill added now starts this month: past months get no new bill', async () => {
    const owner = await caller('sub-owner');
    await owner.seedDefaultCategories({ preset: 'default' });
    [housingId = '', utilitiesId = ''] = (await owner.categories()).map((c) => c.id);

    rentId = (await owner.addRecurringBill(rent())).id;

    expect(await monthsOf(rentId)).toEqual([['2026-11', 150_000]]);
  });

  it('returns today, the bills, the categories in use and take-home', async () => {
    const view = await (await caller('sub-view')).recurringBills();

    expect(view).toEqual({
      today: '2026-11-18',
      takeHomeCents: null,
      usedCategoryIds: [housingId],
      bills: [{ id: rentId, ...rent(), startYm: '2026-11', endYm: null }],
    });
  });

  it("shows another household nothing of this one's", async () => {
    const other = await (await caller('sub-other')).recurringBills();

    expect(other.bills).toEqual([]);
    expect(other.usedCategoryIds).toEqual([]);
  });

  it('an edit changes the bill and this month’s unpaid bill', async () => {
    const owner = await caller('sub-owner');

    await owner.updateRecurringBill({ id: rentId, ...rent(), estimateCents: 160_000 });

    expect((await owner.recurringBills()).bills[0]?.estimateCents).toBe(160_000);
    expect(await monthsOf(rentId)).toEqual([['2026-11', 160_000]]);
  });

  it('Ending a bill keeps its history and stops it from future openMonth runs; restarting brings it back', async () => {
    const owner = await caller('sub-owner');

    await owner.endRecurringBill({ id: rentId });
    await openMonth(t.db, OWNER, '2026-12', NOW);

    expect(await monthsOf(rentId)).toEqual([['2026-11', 160_000]]);
    expect((await owner.recurringBills()).bills[0]?.endYm).toBe('2026-11');

    await owner.restartRecurringBill({ id: rentId });
    await openMonth(t.db, OWNER, '2027-01', NOW);

    expect((await monthsOf(rentId)).map(([ym]) => ym)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect((await owner.recurringBills()).bills[0]?.endYm).toBeNull();
  });

  it("another household's bill looks missing", async () => {
    const other = await caller('sub-other');

    const attempts = [
      other.endRecurringBill({ id: rentId }),
      other.restartRecurringBill({ id: rentId }),
      other.updateRecurringBill({ id: rentId, ...rent() }),
    ];

    await Promise.all(
      attempts.map((attempt) => expect(attempt).rejects.toMatchObject({ code: 'NOT_FOUND' })),
    );
  });

  it('Category delete moves its bills to the chosen category and says so', async () => {
    const owner = await caller('sub-owner');
    const savings = (await owner.categories()).find((c) => c.name === 'Savings');

    const result = await owner.deleteCategory({ id: housingId, moveToId: savings?.id ?? '' });

    expect(result).toMatchObject({ movedToName: 'Savings', movedCount: 1 });
    expect((await owner.recurringBills()).bills[0]?.categoryId).toBe(savings?.id);
  });

  it('a destination that is the deleted category is BAD_REQUEST', async () => {
    const owner = await caller('sub-owner');

    await expect(
      owner.deleteCategory({ id: utilitiesId, moveToId: utilitiesId }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
