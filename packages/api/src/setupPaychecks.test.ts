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
const U_OWNER = '33333333-3333-4333-8333-333333333333';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.db
    .insertInto('households')
    .values({
      id: H1,
      name: 'One',
      mode: 'solo',
      timezone: 'America/New_York',
      first_month: '2026-11',
    })
    .execute();
  await t.db
    .insertInto('users')
    .values({ id: U_OWNER, email: 'owner@example.test', name: 'Olive', cognito_sub: 'sub-owner' })
    .execute();
  await t.db
    .insertInto('memberships')
    .values({ household_id: H1, user_id: U_OWNER, role: 'owner' })
    .execute();
});
afterAll(async () => {
  await t.destroy();
});

async function owner() {
  const { logger } = captureLogger();
  const ctx = await createContextFactory({
    db: t.db,
    verifier: fakeVerifier,
    logger,
    identityProvider: fakeIdentityProvider(),
    clock: testClock,
    invites: fakeInviteDeps(),
  })('Bearer good:sub-owner');
  return appRouter.createCaller(ctx);
}

const takeHome = async () => {
  const api = await owner();
  const [setup, page] = await Promise.all([api.setupBills(), api.recurringBills()]);
  return [setup.takeHomeCents, page.takeHomeCents];
};

describe('P2-09 setup step 3 API', () => {
  it('lists today and the schedules, gives take-home to both bill views, and removes', async () => {
    const api = await owner();
    expect(await api.setupPaychecks()).toEqual({ today: '2026-11-18', schedules: [] });
    expect(await takeHome()).toEqual([null, null]);

    const { id } = await api.addPaySchedule({
      name: 'Main job',
      frequency: 'biweekly',
      anchorDate: '2026-11-06',
      usualCents: 322_500,
    });

    expect((await api.setupPaychecks()).schedules).toMatchObject([
      { id, name: 'Main job', usualCents: 322_500, endedOn: null },
    ]);
    expect(await takeHome()).toEqual([645_000, 645_000]);

    await api.stopPaySchedule({ id });
    expect(await takeHome()).toEqual([null, null]);

    await api.removePaySchedule({ id });
    expect((await api.setupPaychecks()).schedules).toEqual([]);
  });

  it('removing a schedule that is not there is NOT_FOUND', async () => {
    const api = await owner();
    await expect(
      api.removePaySchedule({ id: '99999999-9999-4999-8999-999999999999' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
