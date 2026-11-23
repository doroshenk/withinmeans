import { fixedClock } from '@withinmeans/domain';
import { createTestDb, type TestDb } from '@withinmeans/db/testing';
import type { Database } from '@withinmeans/db';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createContextFactory } from './context.js';
import { appRouter } from './router.js';
import {
  captureLogger,
  fakeIdentityProvider,
  fakeVerifier,
  testClock,
  type FakeIdentityProvider,
} from './testing.js';

let t: TestDb;
let provider: FakeIdentityProvider;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
});
beforeEach(async () => {
  await t.db.deleteFrom('memberships').execute();
  await t.db.deleteFrom('users').execute();
  await t.db.deleteFrom('households').execute();
  provider = fakeIdentityProvider();
});

async function caller(
  authorization?: string,
  over: { db?: Database; clock?: typeof testClock } = {},
) {
  const { logger } = captureLogger();
  const ctx = await createContextFactory({
    db: over.db ?? t.db,
    verifier: fakeVerifier,
    logger,
    identityProvider: provider,
    clock: over.clock ?? testClock,
  })(authorization);
  return appRouter.createCaller(ctx);
}

const solo = {
  mode: 'solo' as const,
  name: 'Sam',
  email: 'sam@example.test',
  password: 'abcd1234',
  timeZone: 'America/Chicago',
};

describe('P1-02: signUp', () => {
  it('P1-02: solo sign-up creates a solo household with one owner membership', async () => {
    expect(await (await caller()).signUp(solo)).toEqual({ status: 'created' });

    const [h] = await t.db.selectFrom('households').selectAll().execute();
    expect(h).toMatchObject({ mode: 'solo', timezone: 'America/Chicago', first_month: '2026-11' });
    const members = await t.db.selectFrom('memberships').selectAll().execute();
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe('owner');
    expect(provider.logins.get('sam@example.test')?.password).toBe('abcd1234');
  });

  it('P1-02: the new owner then sees their household via me', async () => {
    await (await caller()).signUp(solo);

    const me = await (await caller('Bearer good:sub:sam@example.test')).me();

    expect(me.user).toEqual({ name: 'Sam', email: 'sam@example.test' });
    expect(me.household?.role).toBe('owner');
  });

  it('P1-02: partner sign-up requires a household name', async () => {
    await expect((await caller()).signUp({ ...solo, mode: 'partner' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(await t.db.selectFrom('households').selectAll().execute()).toHaveLength(0);
    expect(provider.logins.size).toBe(0);

    await (await caller()).signUp({ ...solo, mode: 'partner', householdName: 'The Examples' });
    const [h] = await t.db.selectFrom('households').selectAll().execute();
    expect(h).toMatchObject({ mode: 'duo', name: 'The Examples' });
  });

  it('P1-02: a password under 8 characters is rejected and creates nothing', async () => {
    await expect((await caller()).signUp({ ...solo, password: 'abc1234' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(provider.logins.size).toBe(0);
  });

  it('P1-02: the first month is this month in the household time zone', async () => {
    // 12:00Z on Nov 30 is already Dec 1 in Auckland.
    const clock = fixedClock(Temporal.Instant.from('2026-11-30T12:00:00Z'));
    await (await caller(undefined, { clock })).signUp({ ...solo, timeZone: 'Pacific/Auckland' });
    const [h] = await t.db.selectFrom('households').select('first_month').execute();
    expect(h?.first_month).toBe('2026-12');
  });

  it('P1-02: a solo household is named after the user', async () => {
    await (await caller()).signUp(solo);
    const [h] = await t.db.selectFrom('households').select('name').execute();
    expect(h?.name).toBe("Sam's household");
  });

  it('P1-02: an email that already has an account gets the same answer and changes nothing', async () => {
    await (await caller()).signUp(solo);

    const again = await (await caller()).signUp({ ...solo, name: 'Someone else' });

    expect(again).toEqual({ status: 'created' });
    expect(await t.db.selectFrom('households').selectAll().execute()).toHaveLength(1);
    const [u] = await t.db.selectFrom('users').select('name').execute();
    expect(u?.name).toBe('Sam');
  });

  it('P1-02: if the email is taken in our database the new login is removed again', async () => {
    await t.db
      .insertInto('users')
      .values({ email: 'sam@example.test', name: 'Old', cognito_sub: 'sub-old' })
      .execute();

    const answer = await (await caller()).signUp(solo);

    expect(answer).toEqual({ status: 'created' });
    expect(provider.deleted).toEqual(['sam@example.test']);
    expect(provider.logins.size).toBe(0);
    expect(await t.db.selectFrom('households').selectAll().execute()).toHaveLength(0);
  });

  it('P1-02: an unexpected database failure removes the login and surfaces as an error', async () => {
    const down = {
      transaction() {
        throw new Error('db down');
      },
    } as unknown as Database;

    await expect((await caller(undefined, { db: down })).signUp(solo)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(provider.deleted).toEqual(['sam@example.test']);
  });
});
