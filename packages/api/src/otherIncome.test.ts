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

describe('P2-04 one-time income API', () => {
  it('Other income counts in the month of its date', async () => {
    const owner = await caller('sub-owner');
    const checking = await owner.addAccount({
      name: 'Everyday checking',
      type: 'checking',
      balanceCents: 100_000,
    });
    const cash = await owner.addAccount({ name: 'Cash', type: 'cash', balanceCents: 0 });
    const { id } = await owner.addOtherIncome({
      date: '2026-11-12',
      source: 'Marketplace sale',
      type: 'sale',
      amountCents: 12_000,
      accountId: cash.id,
      note: 'Old bike',
    });
    await owner.addOtherIncome({
      date: '2026-10-31',
      source: 'Birthday',
      type: 'gift',
      amountCents: 5_000,
    });

    // No month asked for: the month it is today (Nov 18) in the household's time zone.
    expect(await owner.otherIncome({})).toEqual({
      today: '2026-11-18',
      ym: '2026-11',
      entries: [
        {
          id,
          date: '2026-11-12',
          source: 'Marketplace sale',
          type: 'sale',
          amountCents: 12_000,
          accountId: cash.id,
          accountName: 'Cash',
          note: 'Old bike',
        },
      ],
      recent: [
        { source: 'Marketplace sale', type: 'sale', accountId: cash.id },
        { source: 'Birthday', type: 'gift', accountId: checking.id },
      ],
      accounts: [
        { id: checking.id, name: 'Everyday checking', isPrimary: true },
        { id: cash.id, name: 'Cash', isPrimary: false },
      ],
    });
    expect((await owner.otherIncome({ ym: '2026-10' })).entries).toMatchObject([
      { source: 'Birthday', accountName: 'Everyday checking' },
    ]);
  });

  it('keeps the account name on an entry after the account is removed', async () => {
    const owner = await caller('sub-owner');
    const account = await owner.addAccount({ name: 'Old jar', type: 'cash', balanceCents: 0 });
    await owner.addOtherIncome({
      date: '2027-03-02',
      source: 'Jar',
      type: 'other',
      amountCents: 100,
      accountId: account.id,
    });

    await owner.removeAccount({ id: account.id });

    const page = await owner.otherIncome({ ym: '2027-03' });
    expect(page.entries).toMatchObject([{ accountName: 'Old jar' }]);
    expect(page.accounts.map((a) => a.name)).not.toContain('Old jar');
  });

  it('removes an entry', async () => {
    const owner = await caller('sub-owner');
    const { id } = await owner.addOtherIncome({
      date: '2027-04-01',
      source: 'Refund',
      type: 'refund',
      amountCents: 100,
    });

    await owner.removeOtherIncome({ id });

    expect((await owner.otherIncome({ ym: '2027-04' })).entries).toEqual([]);
  });

  it('refuses a closed month with a message', async () => {
    const owner = await caller('sub-owner');
    await t.db
      .insertInto('months')
      .values({
        household_id: H1,
        ym: '2026-09',
        status: 'closed',
        started_at: new Date('2026-09-01T12:00:00Z'),
        closed_at: new Date('2026-10-01T12:00:00Z'),
      })
      .execute();

    await expect(
      owner.addOtherIncome({
        date: '2026-09-15',
        source: 'Late',
        type: 'other',
        amountCents: 100,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'That month is closed' });
  });

  it('lets a view-only member read', async () => {
    const view = await caller('sub-view');

    expect((await view.otherIncome({})).entries.length).toBeGreaterThan(0);
  });

  it("shows another household nothing, and can't touch this one's rows", async () => {
    const owner = await caller('sub-owner');
    const other = await caller('sub-other');
    const mine = await owner.otherIncome({});

    expect(await other.otherIncome({})).toMatchObject({ entries: [], recent: [], accounts: [] });
    await expect(other.removeOtherIncome({ id: mine.entries[0]?.id ?? '' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      other.addOtherIncome({
        date: '2026-11-12',
        source: 'Sneaky',
        type: 'other',
        amountCents: 100,
        accountId: mine.accounts[0]?.id ?? '',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
