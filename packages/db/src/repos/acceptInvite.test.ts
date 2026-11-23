import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conflict, NotFound } from '../context.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { acceptInvite } from './acceptInvite.js';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
});

const NOW = new Date('2026-11-18T12:00:00Z');
const LATER = new Date('2026-11-26T12:00:00Z');
let householdId: string;
let inviteId: string;

beforeEach(async () => {
  await t.db.deleteFrom('invites').execute();
  await t.db.deleteFrom('memberships').execute();
  await t.db.deleteFrom('users').execute();
  await t.db.deleteFrom('households').execute();
  const h = await t.db
    .insertInto('households')
    .values({
      name: 'The Examples',
      mode: 'duo',
      timezone: 'America/Chicago',
      first_month: '2026-11',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  householdId = h.id;
  const sam = await t.db
    .insertInto('users')
    .values({ email: 'sam@example.test', name: 'Sam', cognito_sub: 'sub-sam' })
    .returning('id')
    .executeTakeFirstOrThrow();
  await t.db
    .insertInto('memberships')
    .values({ household_id: householdId, user_id: sam.id, role: 'owner' })
    .execute();
  const inv = await t.db
    .insertInto('invites')
    .values({
      household_id: householdId,
      name: 'Pat',
      email: 'pat@example.test',
      role: 'view',
      note: 'Welcome!',
      token: 'tok-1',
      expires_at: new Date('2026-11-25T12:00:00Z'),
      accepted_at: null,
      invited_by: sam.id,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  inviteId = inv.id;
});

const input = {
  token: 'tok-1',
  now: NOW,
  userName: 'Pat',
  email: 'Pat@Example.test',
  cognitoSub: 'sub-pat',
};

describe('P1-04: acceptInvite.preview', () => {
  it('P1-04: shows who invited, the household, the note and the access level', async () => {
    expect(await acceptInvite.preview(t.db, 'tok-1', NOW)).toEqual({
      inviterName: 'Sam',
      householdName: 'The Examples',
      inviteeName: 'Pat',
      email: 'pat@example.test',
      role: 'view',
      note: 'Welcome!',
    });
  });

  it('P1-04: an unknown, expired or used token shows nothing', async () => {
    expect(await acceptInvite.preview(t.db, 'nope', NOW)).toBeUndefined();
    expect(await acceptInvite.preview(t.db, 'tok-1', LATER)).toBeUndefined();
    await t.db.updateTable('invites').set({ accepted_at: NOW }).execute();
    expect(await acceptInvite.preview(t.db, 'tok-1', NOW)).toBeUndefined();
  });
});

describe('P1-04: acceptInvite.accept', () => {
  it('P1-04: creates exactly one Membership with the invite role and sets accepted_at', async () => {
    const result = await acceptInvite.accept(t.db, input);

    expect(result).toMatchObject({ householdId, role: 'view' });
    const members = await t.db
      .selectFrom('memberships')
      .selectAll()
      .where('role', '=', 'view')
      .execute();
    expect(members).toEqual([{ household_id: householdId, user_id: result.userId, role: 'view' }]);
    const user = await t.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', result.userId)
      .executeTakeFirstOrThrow();
    expect(user).toMatchObject({ name: 'Pat', email: 'pat@example.test', cognito_sub: 'sub-pat' });
    const invite = await t.db
      .selectFrom('invites')
      .selectAll()
      .where('id', '=', inviteId)
      .executeTakeFirstOrThrow();
    expect(invite.accepted_at).toEqual(NOW);
  });

  it('P1-04: an invite for full access gives a full Membership', async () => {
    await t.db.updateTable('invites').set({ role: 'full' }).execute();
    expect((await acceptInvite.accept(t.db, input)).role).toBe('full');
  });

  it('P1-04: the same token cannot be used twice', async () => {
    await acceptInvite.accept(t.db, input);
    await expect(
      acceptInvite.accept(t.db, { ...input, email: 'other@example.test', cognitoSub: 'sub-2' }),
    ).rejects.toBeInstanceOf(NotFound);
    expect(await t.db.selectFrom('memberships').selectAll().execute()).toHaveLength(2);
  });

  it('P1-04: an expired or unknown token creates nothing', async () => {
    await expect(acceptInvite.accept(t.db, { ...input, now: LATER })).rejects.toBeInstanceOf(
      NotFound,
    );
    await expect(acceptInvite.accept(t.db, { ...input, token: 'nope' })).rejects.toBeInstanceOf(
      NotFound,
    );
    expect(await t.db.selectFrom('users').selectAll().execute()).toHaveLength(1);
    expect(await t.db.selectFrom('memberships').selectAll().execute()).toHaveLength(1);
  });

  it('P1-04: a taken email is a Conflict, leaves the invite open and creates nothing', async () => {
    await expect(
      acceptInvite.accept(t.db, { ...input, email: 'SAM@example.test' }),
    ).rejects.toBeInstanceOf(Conflict);
    expect(await t.db.selectFrom('users').selectAll().execute()).toHaveLength(1);
    expect(await t.db.selectFrom('memberships').selectAll().execute()).toHaveLength(1);
    expect(await acceptInvite.preview(t.db, 'tok-1', NOW)).toBeDefined();
  });

  it('P1-04: a household that already has two members is a Conflict', async () => {
    const extra = await t.db
      .insertInto('users')
      .values({ email: 'kim@example.test', name: 'Kim', cognito_sub: 'sub-kim' })
      .returning('id')
      .executeTakeFirstOrThrow();
    await t.db
      .insertInto('memberships')
      .values({ household_id: householdId, user_id: extra.id, role: 'full' })
      .execute();

    await expect(acceptInvite.accept(t.db, input)).rejects.toBeInstanceOf(Conflict);
    expect(await t.db.selectFrom('memberships').selectAll().execute()).toHaveLength(2);
  });
});
