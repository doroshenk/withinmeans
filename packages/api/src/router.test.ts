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

let t: TestDb;
const H1 = '11111111-1111-4111-8111-111111111111';
const U_OWNER = '33333333-3333-4333-8333-333333333333';
const U_LONE = '44444444-4444-4444-8444-444444444444';

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
      { id: U_LONE, email: 'lone@example.test', name: 'Lone', cognito_sub: 'sub-lone' },
    ])
    .execute();
  await t.db
    .insertInto('memberships')
    .values({ household_id: H1, user_id: U_OWNER, role: 'owner' })
    .execute();
});
afterAll(async () => {
  await t.destroy();
});

function factory() {
  const { logger } = captureLogger();
  return createContextFactory({
    db: t.db,
    verifier: fakeVerifier,
    logger,
    identityProvider: fakeIdentityProvider(),
    clock: testClock,
    invites: fakeInviteDeps(),
  });
}

async function callMe(authorization: string | undefined) {
  return appRouter.createCaller(await factory()(authorization)).me();
}

describe('P0-09: me', () => {
  it('P0-09: with no token → UNAUTHORIZED', async () => {
    await expect(callMe(undefined)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('P0-09: with a malformed header or a bad token → UNAUTHORIZED', async () => {
    await expect(callMe('Basic abc')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(callMe('Bearer forged')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(callMe('Bearer ')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('P0-09: valid token but no membership → the user with no household', async () => {
    expect(await callMe('Bearer good:sub-lone')).toEqual({
      user: { name: 'Lone', email: 'lone@example.test' },
      household: null,
    });
  });
  it('P0-09: valid token but no users row yet → no user and no household', async () => {
    expect(await callMe('Bearer good:sub-new')).toEqual({ user: null, household: null });
  });
  it("P0-09: returns the user's name and household name from the database", async () => {
    expect(await callMe('Bearer good:sub-owner')).toEqual({
      user: { name: 'Olive', email: 'owner@example.test' },
      household: { name: 'The Example House', role: 'owner' },
    });
  });
});

describe('P0-09: context', () => {
  it('builds HouseholdContext from the membership, not from the request', async () => {
    const make = factory();
    expect((await make('Bearer good:sub-owner')).household).toEqual({
      householdId: H1,
      userId: U_OWNER,
      role: 'owner',
    });
    expect((await make('Bearer good:sub-lone')).household).toBeUndefined();
    expect((await make(undefined)).auth).toBeUndefined();
  });
});
