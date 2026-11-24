import { createTestDb, type TestDb } from '@withinmeans/db/testing';
import { fixedClock, type Clock } from '@withinmeans/domain';
import { Temporal } from 'temporal-polyfill';
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
const H3 = '66666666-6666-4666-8666-666666666666';
const U_OWNER = '33333333-3333-4333-8333-333333333333';
const U_VIEW = '44444444-4444-4444-8444-444444444444';
const U_OTHER = '55555555-5555-4555-8555-555555555555';
const U_WEST = '77777777-7777-4777-8777-777777777777';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.db
    .insertInto('households')
    .values([
      { id: H1, name: 'One', mode: 'duo', timezone: 'America/New_York', first_month: '2026-11' },
      { id: H2, name: 'Two', mode: 'solo', timezone: 'America/New_York', first_month: '2026-11' },
      {
        id: H3,
        name: 'West',
        mode: 'solo',
        timezone: 'America/Los_Angeles',
        first_month: '2026-11',
      },
    ])
    .execute();
  await t.db
    .insertInto('users')
    .values([
      { id: U_OWNER, email: 'owner@example.test', name: 'Olive', cognito_sub: 'sub-owner' },
      { id: U_VIEW, email: 'view@example.test', name: 'Vic', cognito_sub: 'sub-view' },
      { id: U_OTHER, email: 'other@example.test', name: 'Otto', cognito_sub: 'sub-other' },
      { id: U_WEST, email: 'west@example.test', name: 'Wes', cognito_sub: 'sub-west' },
    ])
    .execute();
  await t.db
    .insertInto('memberships')
    .values([
      { household_id: H1, user_id: U_OWNER, role: 'owner' },
      { household_id: H1, user_id: U_VIEW, role: 'view' },
      { household_id: H2, user_id: U_OTHER, role: 'owner' },
      { household_id: H3, user_id: U_WEST, role: 'owner' },
    ])
    .execute();
});
afterAll(async () => {
  await t.destroy();
});

async function caller(sub: string, clock: Clock = testClock) {
  const { logger } = captureLogger();
  const ctx = await createContextFactory({
    db: t.db,
    verifier: fakeVerifier,
    logger,
    identityProvider: fakeIdentityProvider(),
    clock,
    invites: fakeInviteDeps(),
  })(`Bearer good:${sub}`);
  return appRouter.createCaller(ctx);
}

const monthsOf = async (householdId: string) =>
  (await t.db.selectFrom('months').select('ym').where('household_id', '=', householdId).execute())
    .map((r) => r.ym)
    .sort();
const firstMonthOf = async (householdId: string) =>
  (
    await t.db
      .selectFrom('households')
      .select('first_month')
      .where('id', '=', householdId)
      .executeTakeFirstOrThrow()
  ).first_month;

describe('P1-09 first month API (spec §3 step 1)', () => {
  it('offers this month and next month, and says nothing is open yet', async () => {
    const owner = await caller('sub-owner');

    expect(await owner.firstMonthOptions()).toEqual({
      thisMonth: '2026-11',
      nextMonth: '2026-12',
      firstMonth: '2026-11',
      opened: false,
    });
  });

  it('a view-only member can read the options', async () => {
    expect(await (await caller('sub-view')).firstMonthOptions()).toMatchObject({
      thisMonth: '2026-11',
    });
  });

  it('"This month" sets first_month to the current household month and opens it', async () => {
    const other = await caller('sub-other');

    expect(await other.startFirstMonth({ choice: 'this' })).toEqual({ firstMonth: '2026-11' });
    expect(await firstMonthOf(H2)).toBe('2026-11');
    expect(await monthsOf(H2)).toEqual(['2026-11']);
    expect(await other.firstMonthOptions()).toMatchObject({ firstMonth: '2026-11', opened: true });
  });

  it('calling it twice with the same choice opens one Month', async () => {
    const other = await caller('sub-other');
    await other.startFirstMonth({ choice: 'this' });
    await other.startFirstMonth({ choice: 'this' });

    expect(await monthsOf(H2)).toEqual(['2026-11']);
  });

  it('"Next month" sets first_month to the following month and opens it', async () => {
    const owner = await caller('sub-owner');

    expect(await owner.startFirstMonth({ choice: 'next' })).toEqual({ firstMonth: '2026-12' });
    expect(await firstMonthOf(H1)).toBe('2026-12');
    expect(await monthsOf(H1)).toEqual(['2026-12']);
  });

  it('choosing a different month once one is open is a CONFLICT and changes nothing', async () => {
    const owner = await caller('sub-owner');

    await expect(owner.startFirstMonth({ choice: 'this' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(await firstMonthOf(H1)).toBe('2026-12');
    expect(await monthsOf(H1)).toEqual(['2026-12']);
  });

  it("uses the household's time zone for the current month, not UTC", async () => {
    // 2026-12-01 03:00 UTC is still Nov 30 in Los Angeles.
    const clock = fixedClock(Temporal.Instant.from('2026-12-01T03:00:00Z'));
    const west = await caller('sub-west', clock);

    expect(await west.firstMonthOptions()).toMatchObject({
      thisMonth: '2026-11',
      nextMonth: '2026-12',
    });
    expect(await west.startFirstMonth({ choice: 'this' })).toEqual({ firstMonth: '2026-11' });
  });

  it('a view-only member cannot choose, and nothing is opened', async () => {
    const view = await caller('sub-view');

    await expect(view.startFirstMonth({ choice: 'this' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await monthsOf(H1)).toEqual(['2026-12']);
  });

  it('rejects any choice other than this or next', async () => {
    const owner = await caller('sub-owner');

    await expect(
      owner.startFirstMonth({ choice: 'last' } as unknown as { choice: 'this' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it("one household's choice never touches another's", async () => {
    expect(await monthsOf(H3)).toEqual(['2026-11']);
    expect(await firstMonthOf(H3)).toBe('2026-11');
  });
});
