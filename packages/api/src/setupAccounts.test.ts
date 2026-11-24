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

describe('P1-10 setup accounts API', () => {
  it('starts empty, with a $0 cushion', async () => {
    const owner = await caller('sub-owner');
    expect(await owner.setupAccounts()).toEqual({ accounts: [], cushionCents: 0 });
  });

  it('saving step 2 as done with no accounts is a CONFLICT; with one it works', async () => {
    const owner = await caller('sub-owner');
    await expect(owner.saveSetupStep({ step: 2, status: 'done' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Add at least one account.',
    });

    await owner.addAccount({ name: 'Joint', type: 'checking', balanceCents: 123_456 });
    expect(await owner.saveSetupStep({ step: 2, status: 'done' })).toEqual({
      step: 2,
      status: 'done',
    });
  });

  it('adds accounts: the balance is the first snapshot, dated today in the household zone', async () => {
    const owner = await caller('sub-owner');
    const { id } = await owner.addAccount({
      name: 'Rainy day',
      type: 'savings',
      balanceCents: 500,
    });

    const view = await owner.setupAccounts();
    expect(view.accounts.map((a) => [a.name, a.type, a.balanceCents, a.isPrimaryChecking])).toEqual(
      [
        ['Joint', 'checking', 123_456, true],
        ['Rainy day', 'savings', 500, false],
      ],
    );
    const snap = await t.db
      .selectFrom('balance_snapshots')
      .select('date')
      .where('account_id', '=', id)
      .executeTakeFirstOrThrow();
    expect(String(snap.date)).toContain('2026-11-18');
  });

  it('the cushion is saved and read back; negative is BAD_REQUEST', async () => {
    const owner = await caller('sub-owner');
    await owner.setCushion({ cushionCents: 100_000 });
    expect((await owner.setupAccounts()).cushionCents).toBe(100_000);
    await expect(owner.setCushion({ cushionCents: -5 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('removing the primary checking account promotes the next one', async () => {
    const owner = await caller('sub-owner');
    await owner.addAccount({ name: 'Spending', type: 'checking', balanceCents: 1_000 });
    const before = (await owner.setupAccounts()).accounts;
    const joint = before.find((a) => a.name === 'Joint');

    await owner.removeAccount({ id: joint?.id ?? '' });

    const after = (await owner.setupAccounts()).accounts;
    expect(after.map((a) => [a.name, a.isPrimaryChecking])).toEqual([
      ['Rainy day', false],
      ['Spending', true],
    ]);
  });

  it('another household sees none of it, and cannot remove it', async () => {
    const other = await caller('sub-other');
    expect(await other.setupAccounts()).toEqual({ accounts: [], cushionCents: 0 });
    const theirs = (await (await caller('sub-owner')).setupAccounts()).accounts[0];
    await expect(other.removeAccount({ id: theirs?.id ?? '' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('a view-only member can read, not change', async () => {
    const view = await caller('sub-view');
    expect((await view.setupAccounts()).accounts.length).toBeGreaterThan(0);
    await expect(
      view.addAccount({ name: 'X', type: 'cash', balanceCents: 0 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
