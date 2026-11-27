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
    'card_statements',
    'credit_cards',
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

async function setUp() {
  const owner = await caller('sub-owner');
  const { id: cardId } = await owner.addCreditCard({
    nickname: 'Store card',
    dueDay: 2,
    usualPlan: 'min',
  });
  return { owner, cardId };
}

const november = (cardId: string) => ({
  cardId,
  ym: '2026-11',
  statementCents: 147_160,
  minimumCents: 3_500,
  plannedPaymentCents: 128_417,
});

describe('P2-07 credit cards API', () => {
  it('adds, lists and removes cards', async () => {
    const { owner, cardId } = await setUp();

    expect(await owner.creditCards()).toEqual([
      { id: cardId, nickname: 'Store card', dueDay: 2, usualPlan: 'min' },
    ]);
    await owner.removeCreditCard({ id: cardId });
    expect(await owner.creditCards()).toEqual([]);
  });

  it('rejects a card number as a nickname', async () => {
    const owner = await caller('sub-owner');

    await expect(
      owner.addCreditCard({ nickname: '4111 1111 1111 1111', dueDay: 2, usualPlan: 'full' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('Planned payment > statement is rejected; minimum > statement is rejected', async () => {
    const { owner, cardId } = await setUp();

    for (const over of [{ plannedPaymentCents: 147_161 }, { minimumCents: 147_161 }]) {
      await expect(owner.saveCardStatement({ ...november(cardId), ...over })).rejects.toMatchObject(
        { code: 'BAD_REQUEST' },
      );
    }
    expect((await owner.billsPage({ ym: '2026-11' })).cards[0]?.statement).toBeNull();
  });

  it('T17: statement $1,471.60 paid $1,284.17 → next month’s row carries $187.43', async () => {
    const { owner, cardId } = await setUp();
    await owner.saveCardStatement(november(cardId));
    await owner.markCardPaid({ cardId, ym: '2026-11', paidCents: 128_417 });

    const nov = (await owner.billsPage({ ym: '2026-11' })).cards;
    const dec = (await owner.billsPage({ ym: '2026-12' })).cards;

    expect(nov).toEqual([
      {
        cardId,
        nickname: 'Store card',
        dueDay: 2,
        dueDate: '2026-11-02',
        usualPlan: 'min',
        archived: false,
        statement: {
          statementCents: 147_160,
          minimumCents: 3_500,
          plannedPaymentCents: 128_417,
          paidCents: 128_417,
        },
        previousCents: null,
        carriedCents: 0,
      },
    ]);
    expect(dec[0]).toMatchObject({
      statement: null,
      previousCents: 147_160,
      carriedCents: 18_743,
    });

    await owner.unmarkCardPaid({ cardId, ym: '2026-11' });
    expect((await owner.billsPage({ ym: '2026-12' })).cards[0]?.carriedCents).toBe(147_160);
  });

  it('keeps a removed card in the months that have its statement', async () => {
    const { owner, cardId } = await setUp();
    await owner.saveCardStatement({ ...november(cardId), alreadyPaid: true });
    await owner.removeCreditCard({ id: cardId });

    const nov = (await owner.billsPage({ ym: '2026-11' })).cards;

    expect(nov).toMatchObject([{ archived: true, statement: { paidCents: 128_417 } }]);
    expect((await owner.billsPage({ ym: '2026-12' })).cards).toEqual([]);
  });

  it('rejects changes to a closed month', async () => {
    const { owner, cardId } = await setUp();
    await owner.startFirstMonth({ choice: 'this' });
    await t.db.updateTable('months').set({ status: 'closed' }).execute();

    await expect(owner.saveCardStatement(november(cardId))).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('keeps another household out', async () => {
    const { owner, cardId } = await setUp();
    await owner.saveCardStatement(november(cardId));
    const other = await caller('sub-other');

    expect(await other.creditCards()).toEqual([]);
    expect((await other.billsPage({ ym: '2026-11' })).cards).toEqual([]);
    await expect(other.saveCardStatement(november(cardId))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(other.removeCreditCard({ id: cardId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('shows a view-only member the cards', async () => {
    await setUp();

    expect(await (await caller('sub-view')).creditCards()).toHaveLength(1);
  });
});
