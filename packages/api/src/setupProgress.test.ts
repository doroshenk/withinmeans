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

describe('P1-08 setup progress API', () => {
  it('saves a step and reads it back, only for the caller’s household', async () => {
    const owner = await caller('sub-owner');
    await owner.saveSetupStep({ step: 1, status: 'done' });
    await owner.saveSetupStep({ step: 3, status: 'skipped' });
    expect((await owner.setupProgress()).map((r) => [r.step, r.status])).toEqual([
      [1, 'done'],
      [3, 'skipped'],
    ]);
    expect(await (await caller('sub-other')).setupProgress()).toEqual([]);
  });

  it('a view-only member can read progress but not save', async () => {
    const view = await caller('sub-view');
    expect((await view.setupProgress()).length).toBeGreaterThan(0);
    await expect(view.saveSetupStep({ step: 2, status: 'done' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects a step outside 1..9', async () => {
    const owner = await caller('sub-owner');
    await expect(owner.saveSetupStep({ step: 10, status: 'done' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('progress needs a household', async () => {
    const { logger } = captureLogger();
    const ctx = await createContextFactory({
      db: t.db,
      verifier: fakeVerifier,
      logger,
      identityProvider: fakeIdentityProvider(),
      clock: testClock,
      invites: fakeInviteDeps(),
    })(undefined);
    await expect(appRouter.createCaller(ctx).setupProgress()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
