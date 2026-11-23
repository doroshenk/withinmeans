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
} from './testing.js';

let t: TestDb;
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
  invites = fakeInviteDeps();
});

const provider = fakeIdentityProvider();
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
const signUp = (mode: 'solo' | 'partner' = 'partner') =>
  caller().then((c) =>
    c.signUp({
      mode,
      name: 'Sam',
      email: 'sam@example.test',
      password: 'abcd1234',
      timeZone: 'America/Chicago',
      ...(mode === 'partner' ? { householdName: 'The Examples' } : {}),
    } as never),
  );
const pat = { name: 'Pat', email: 'pat@example.test', role: 'view' as const, note: 'Welcome!' };

/** A second member of Sam's household, added directly (P1-04 builds the real accept flow). */
async function addMember(role: 'full' | 'view', email = 'pat@example.test') {
  const h = await t.db.selectFrom('households').select('id').executeTakeFirstOrThrow();
  const u = await t.db
    .insertInto('users')
    .values({ email, name: 'Pat', cognito_sub: `sub:${email}` })
    .returning('id')
    .executeTakeFirstOrThrow();
  await t.db
    .insertInto('memberships')
    .values({ household_id: h.id, user_id: u.id, role })
    .execute();
}

describe('P1-03: invitePartner', () => {
  it('P1-03: stores the invite for 7 days and returns pending status without the token', async () => {
    await signUp();

    const result = await (await caller(SAM)).invitePartner(pat);

    expect(result).toMatchObject({
      name: 'Pat',
      email: 'pat@example.test',
      status: 'pending',
      daysLeft: 7,
    });
    expect(JSON.stringify(result)).not.toContain('token-1');
    const [row] = await t.db.selectFrom('invites').selectAll().execute();
    expect(row).toMatchObject({
      name: 'Pat',
      email: 'pat@example.test',
      role: 'view',
      note: 'Welcome!',
      token: 'token-1',
      accepted_at: null,
    });
    expect(row?.expires_at.toISOString()).toBe('2026-11-25T12:00:00.000Z');
    expect(result.id).toBe(row?.id);
  });

  it('P1-03: the email sender gets the accept URL and who and what, and never an amount', async () => {
    await signUp();

    await (await caller(SAM)).invitePartner(pat);

    expect(invites.emailSender.sent).toHaveLength(1);
    const [sent] = invites.emailSender.sent;
    expect(sent).toMatchObject({
      to: 'pat@example.test',
      inviteeName: 'Pat',
      inviterName: 'Sam',
      householdName: 'The Examples',
      role: 'view',
      note: 'Welcome!',
      acceptUrl: 'https://app.test/accept?token=token-1',
    });
    expect(sent?.expiresAt.toString()).toBe('2026-11-25T12:00:00Z');
    expect(JSON.stringify(sent)).not.toMatch(/cents|amount|balance/i);
  });

  it('T19: an invite to the user\'s own email is rejected with "Use your partner\'s own email…" and nothing is stored or sent', async () => {
    await signUp();

    await expect(
      (await caller(SAM)).invitePartner({ ...pat, email: ' Sam@Example.test ' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/^Use your partner's own email/) as unknown,
    });

    expect(await t.db.selectFrom('invites').selectAll().execute()).toHaveLength(0);
    expect(invites.emailSender.sent).toHaveLength(0);
  });

  it('P1-03: bad input (an unknown access level, no name) is rejected before anything happens', async () => {
    await signUp();
    await expect(
      (await caller(SAM)).invitePartner({ ...pat, role: 'owner' } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect((await caller(SAM)).invitePartner({ ...pat, name: ' ' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(invites.emailSender.sent).toHaveLength(0);
  });

  it('T20: a solo household cannot invite a partner', async () => {
    await signUp('solo');
    await expect((await caller(SAM)).invitePartner(pat)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await t.db.selectFrom('invites').selectAll().execute()).toHaveLength(0);
    expect(invites.emailSender.sent).toHaveLength(0);
  });

  it('P1-03: a view-only member cannot invite anyone', async () => {
    await signUp();
    await addMember('view');
    await expect(
      (await caller('Bearer good:sub:pat@example.test')).invitePartner({
        ...pat,
        email: 'someone@example.test',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(invites.emailSender.sent).toHaveLength(0);
  });

  it('P1-03: a household that already has two members cannot invite a third', async () => {
    await signUp();
    await addMember('full');
    await expect(
      (await caller(SAM)).invitePartner({ ...pat, email: 'third@example.test' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(invites.emailSender.sent).toHaveLength(0);
  });

  it('P1-03: while an invite is pending a new one is refused: use Resend', async () => {
    await signUp();
    await (await caller(SAM)).invitePartner(pat);
    await expect(
      (await caller(SAM)).invitePartner({ ...pat, email: 'other@example.test' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('Resend') as unknown,
    });
    expect(await t.db.selectFrom('invites').selectAll().execute()).toHaveLength(1);
  });

  it('P1-03: if the email cannot be sent the invite is removed, so the user can try again', async () => {
    await signUp();
    invites.emailSender.failWith = new Error('SES is down');

    await expect((await caller(SAM)).invitePartner(pat)).rejects.toThrow('SES is down');

    expect(await t.db.selectFrom('invites').selectAll().execute()).toHaveLength(0);
    delete invites.emailSender.failWith;
    await expect((await caller(SAM)).invitePartner(pat)).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('P1-03: needs a signed-in user with a household', async () => {
    await expect((await caller()).invitePartner(pat)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await t.db
      .insertInto('users')
      .values({ email: 'lone@example.test', name: 'Lone', cognito_sub: 'sub:lone' })
      .execute();
    await expect((await caller('Bearer good:sub:lone')).invitePartner(pat)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('P1-03: resendInvite', () => {
  it('P1-03: Resend issues a new token and a fresh 7 days, and the old token stops working', async () => {
    await signUp();
    const first = await (await caller(SAM)).invitePartner(pat);
    const threeDaysLater = fixedClock(Temporal.Instant.from('2026-11-21T12:00:00Z'));

    const again = await (
      await caller(SAM, { clock: threeDaysLater })
    ).resendInvite({
      inviteId: first.id,
    });

    expect(again).toMatchObject({ id: first.id, status: 'pending', daysLeft: 7 });
    const [row] = await t.db.selectFrom('invites').selectAll().execute();
    expect(row?.token).toBe('token-2');
    expect(row?.expires_at.toISOString()).toBe('2026-11-28T12:00:00.000Z');
    const stale = await t.db
      .selectFrom('invites')
      .select('id')
      .where('token', '=', 'token-1')
      .execute();
    expect(stale).toEqual([]);
    expect(invites.emailSender.sent.map((e) => e.acceptUrl)).toEqual([
      'https://app.test/accept?token=token-1',
      'https://app.test/accept?token=token-2',
    ]);
  });

  it('P1-03: an accepted invite or an unknown id is not found', async () => {
    await signUp();
    const first = await (await caller(SAM)).invitePartner(pat);
    await t.db
      .updateTable('invites')
      .set({ accepted_at: new Date('2026-11-19T00:00:00Z') })
      .execute();
    await expect((await caller(SAM)).resendInvite({ inviteId: first.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      (await caller(SAM)).resendInvite({ inviteId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('P1-03: a view-only member cannot resend', async () => {
    await signUp();
    const first = await (await caller(SAM)).invitePartner(pat);
    await addMember('view', 'viewer@example.test');
    await expect(
      (await caller('Bearer good:sub:viewer@example.test')).resendInvite({ inviteId: first.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('P1-03: an expired invite can still be resent (that is what Resend is for)', async () => {
    await signUp();
    const first = await (await caller(SAM)).invitePartner(pat);
    const later = fixedClock(Temporal.Instant.from('2026-12-30T12:00:00Z'));
    await expect(
      (await caller(SAM, { clock: later })).resendInvite({ inviteId: first.id }),
    ).resolves.toMatchObject({ daysLeft: 7 });
  });
});
