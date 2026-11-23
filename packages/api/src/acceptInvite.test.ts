import type { Database } from '@withinmeans/db';
import { createTestDb, type TestDb } from '@withinmeans/db/testing';
import { fixedClock } from '@withinmeans/domain';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createContextFactory } from './context.js';
import { appRouter } from './router.js';
import {
  captureLogger,
  fakeIdentityProvider,
  fakeInviteDeps,
  fakeVerifier,
  testClock,
  type FakeIdentityProvider,
} from './testing.js';

let t: TestDb;
let provider: FakeIdentityProvider;
let invites: ReturnType<typeof fakeInviteDeps>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
});
beforeEach(async () => {
  await t.db.deleteFrom('invites').execute();
  await t.db.deleteFrom('memberships').execute();
  await t.db.deleteFrom('users').execute();
  await t.db.deleteFrom('households').execute();
  provider = fakeIdentityProvider();
  invites = fakeInviteDeps();
});

async function caller(
  authorization?: string,
  over: { clock?: typeof testClock; db?: Database } = {},
) {
  const { logger } = captureLogger();
  const ctx = await createContextFactory({
    db: over.db ?? t.db,
    verifier: fakeVerifier,
    logger,
    identityProvider: provider,
    clock: over.clock ?? testClock,
    invites,
  })(authorization);
  return appRouter.createCaller(ctx);
}

const SAM = 'Bearer good:sub:sam@example.test';
const PAT = 'Bearer good:sub:pat@example.test';
const TOKEN = 'token-1';
const accept = { token: TOKEN, name: 'Pat', email: 'pat@example.test', password: 'abcd1234' };

/** Sam signs up with a partner household and invites Pat (view only, with a note). */
async function invitePat(role: 'full' | 'view' = 'view') {
  await (
    await caller()
  ).signUp({
    mode: 'partner',
    householdName: 'The Examples',
    name: 'Sam',
    email: 'sam@example.test',
    password: 'abcd1234',
    timeZone: 'America/Chicago',
  });
  await (
    await caller(SAM)
  ).invitePartner({ name: 'Pat', email: 'pat@example.test', role, note: 'Welcome!' });
}

const nextWeek = fixedClock(Temporal.Instant.from('2026-11-26T12:00:00Z'));

describe('P1-04: inviteDetails', () => {
  it('P1-04: shows who invited, the household, the note and the access level', async () => {
    await invitePat();

    expect(await (await caller()).inviteDetails({ token: TOKEN })).toEqual({
      inviterName: 'Sam',
      householdName: 'The Examples',
      inviteeName: 'Pat',
      email: 'pat@example.test',
      role: 'view',
      note: 'Welcome!',
    });
  });

  it('P1-04: an unknown token is "expired or already used"', async () => {
    await invitePat();
    await expect((await caller()).inviteDetails({ token: 'nope' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'This invite link has expired or was already used.',
    });
  });
});

describe('P1-04: acceptInvite', () => {
  it('P1-04: expired token shows an error and creates nothing', async () => {
    await invitePat();

    const later = await caller(undefined, { clock: nextWeek });
    await expect(later.inviteDetails({ token: TOKEN })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(later.acceptInvite(accept)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'This invite link has expired or was already used.',
    });

    expect(provider.logins.has('pat@example.test')).toBe(false);
    expect(await t.db.selectFrom('users').selectAll().execute()).toHaveLength(1);
    expect(await t.db.selectFrom('memberships').selectAll().execute()).toHaveLength(1);
  });

  it('P1-04: a used token shows an error and creates nothing more', async () => {
    await invitePat();
    await (await caller()).acceptInvite(accept);

    const again = { ...accept, email: 'other@example.test' };
    await expect((await caller()).acceptInvite(again)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect((await caller()).inviteDetails({ token: TOKEN })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    expect(provider.logins.has('other@example.test')).toBe(false);
    expect(await t.db.selectFrom('memberships').selectAll().execute()).toHaveLength(2);
  });

  it('P1-04: creates exactly one Membership with the invite role and sets accepted_at', async () => {
    await invitePat('view');

    expect(await (await caller()).acceptInvite(accept)).toEqual({ status: 'joined' });

    const members = await t.db.selectFrom('memberships').select('role').execute();
    expect(members.map((m) => m.role).sort()).toEqual(['owner', 'view']);
    const [invite] = await t.db.selectFrom('invites').select('accepted_at').execute();
    expect(invite?.accepted_at).toEqual(new Date('2026-11-18T12:00:00Z'));
    expect(provider.logins.get('pat@example.test')?.password).toBe('abcd1234');
  });

  it('P1-04: the partner may use a different email from the one invited', async () => {
    await invitePat();

    await (await caller()).acceptInvite({ ...accept, email: 'Pat.Own@example.test' });

    expect(provider.logins.has('pat.own@example.test')).toBe(true);
    const me = await (await caller('Bearer good:sub:pat.own@example.test')).me();
    expect(me.user?.email).toBe('pat.own@example.test');
  });

  it('P1-04: the partner then sees the same household via me', async () => {
    await invitePat('full');
    await (await caller()).acceptInvite(accept);

    const sam = await (await caller(SAM)).me();
    const pat = await (await caller(PAT)).me();

    expect(pat.user).toEqual({ name: 'Pat', email: 'pat@example.test' });
    expect(pat.household).toEqual({ name: 'The Examples', role: 'full' });
    expect(pat.household?.name).toBe(sam.household?.name);
  });

  it('P1-04: a view-only partner joins as view and cannot write', async () => {
    await invitePat('view');
    await (await caller()).acceptInvite(accept);

    expect((await (await caller(PAT)).me()).household?.role).toBe('view');
    await expect(
      (await caller(PAT)).invitePartner({
        name: 'X',
        email: 'x@example.test',
        role: 'view',
        note: '',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('P1-04: a password under 8 characters is rejected and creates nothing', async () => {
    await invitePat();
    await expect(
      (await caller()).acceptInvite({ ...accept, password: 'abc1234' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(provider.logins.has('pat@example.test')).toBe(false);
    expect((await (await caller()).inviteDetails({ token: TOKEN })).inviteeName).toBe('Pat');
  });

  it('P1-04: an email that already has a login gets a generic error and the invite stays open', async () => {
    await invitePat();
    provider.logins.set('pat@example.test', { sub: 'sub:someone-else', password: 'theirs1234' });

    await expect((await caller()).acceptInvite(accept)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining("couldn't create that login") as string,
    });

    // The other person's login is untouched.
    expect(provider.deleted).toEqual([]);
    expect(provider.logins.get('pat@example.test')?.password).toBe('theirs1234');
    expect((await (await caller()).inviteDetails({ token: TOKEN })).inviteeName).toBe('Pat');
  });

  it('P1-04: if our database already has the email, the new login is removed and the error is the same', async () => {
    await invitePat();

    // Sam's email is taken in our database, but Cognito (this fake) has no login for it.
    provider.logins.delete('sam@example.test');
    await expect(
      (await caller()).acceptInvite({ ...accept, email: 'sam@example.test' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining("couldn't create that login") as string,
    });

    expect(provider.deleted).toEqual(['sam@example.test']);
    expect(await t.db.selectFrom('memberships').selectAll().execute()).toHaveLength(1);
    expect((await (await caller()).inviteDetails({ token: TOKEN })).inviteeName).toBe('Pat');
  });

  it('P1-04: an unexpected database failure removes the login and surfaces as an error', async () => {
    await invitePat();
    const real = await caller();
    // Reads work (the invite is found) but the write transaction fails.
    const down = new Proxy(t.db, {
      get(target, prop) {
        if (prop === 'transaction') {
          return () => {
            throw new Error('db down');
          };
        }
        const value: unknown = Reflect.get(target, prop, target);
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
      },
    });

    await expect(
      (await caller(undefined, { db: down })).acceptInvite(accept),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });

    expect(provider.deleted).toEqual(['pat@example.test']);
    expect(await real.inviteDetails({ token: TOKEN })).toBeDefined();
  });
});
