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

/**
 * T21: a view-only member's writes are rejected by the API.
 *
 * Every later ticket that adds a write procedure adds a row to WRITE_PROCEDURES. The completeness
 * test below fails until it does.
 */
const WRITE_PROCEDURES = [
  'invitePartner',
  'resendInvite',
  'saveSetupStep',
  'startFirstMonth',
  'seedDefaultCategories',
  'createCategory',
  'renameCategory',
  'recolorCategory',
  'deleteCategory',
  'addAccount',
  'removeAccount',
  'setCushion',
  'addRecurringBill',
  'removeRecurringBill',
  'updateRecurringBill',
  'endRecurringBill',
  'restartRecurringBill',
  'addPaySchedule',
  'stopPaySchedule',
  'restartPaySchedule',
  'markPaycheckReceived',
  'removePaySchedule',
] as const;

/** Mutations that need no membership: anyone may call them (the token or the new login is the credential). */
const PUBLIC_MUTATIONS = ['signUp', 'acceptInvite'];

const H1 = '11111111-1111-4111-8111-111111111111';
const U_OWNER = '33333333-3333-4333-8333-333333333333';
const U_FULL = '44444444-4444-4444-8444-444444444444';
const U_VIEW = '55555555-5555-4555-8555-555555555555';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.db
    .insertInto('households')
    .values({
      id: H1,
      name: 'The Example House',
      mode: 'duo',
      timezone: 'America/New_York',
      first_month: '2026-11',
    })
    .execute();
  await t.db
    .insertInto('users')
    .values([
      { id: U_OWNER, email: 'owner@example.test', name: 'Olive', cognito_sub: 'sub-owner' },
      { id: U_FULL, email: 'full@example.test', name: 'Fern', cognito_sub: 'sub-full' },
      { id: U_VIEW, email: 'view@example.test', name: 'Vic', cognito_sub: 'sub-view' },
    ])
    .execute();
  await t.db
    .insertInto('memberships')
    .values([
      { household_id: H1, user_id: U_OWNER, role: 'owner' },
      { household_id: H1, user_id: U_FULL, role: 'full' },
      { household_id: H1, user_id: U_VIEW, role: 'view' },
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

/** Calls a procedure by name with deliberately empty input. */
async function call(sub: string, name: string): Promise<unknown> {
  const c = (await caller(sub)) as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  return c[name]?.({});
}

describe('T21: view-only members cannot write', () => {
  it.each(WRITE_PROCEDURES)(
    'T21: %s returns FORBIDDEN for a view-only member, before looking at the input',
    async (name) => {
      await expect(call('sub-view', name)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );

  it('T21: every member mutation is in the table above (add yours when you add a write procedure)', () => {
    const procedures = appRouter._def.procedures as unknown as Record<
      string,
      { _def: { type: string } }
    >;
    const mutations = Object.entries(procedures)
      .filter(([, p]) => p._def.type === 'mutation')
      .map(([name]) => name)
      .filter((name) => !PUBLIC_MUTATIONS.includes(name))
      .sort();
    expect(mutations).toEqual([...WRITE_PROCEDURES].sort());
  });

  it('T21: a view-only member can still read', async () => {
    expect(await (await caller('sub-view')).me()).toMatchObject({
      household: { role: 'view' },
    });
  });
});

describe('P1-06: owner and full members', () => {
  it.each(WRITE_PROCEDURES)(
    'P1-06: %s is not blocked for the owner or a full member',
    async (name) => {
      // Empty input is rejected as BAD_REQUEST: past the role check, stopped by validation.
      await expect(call('sub-owner', name)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(call('sub-full', name)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    },
  );
});
