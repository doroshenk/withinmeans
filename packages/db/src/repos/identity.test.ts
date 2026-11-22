import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { identity } from './identity.js';

let t: TestDb;
const H1 = '11111111-1111-4111-8111-111111111111';
const U_OWNER = '33333333-3333-4333-8333-333333333333';
const U_LONE = '44444444-4444-4444-8444-444444444444';

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

describe('identity.findByCognitoSub', () => {
  it('returns the user with their household name and role', async () => {
    expect(await identity.findByCognitoSub(t.db, 'sub-owner')).toEqual({
      user: { id: U_OWNER, email: 'owner@example.test', name: 'Olive' },
      membership: { householdId: H1, householdName: 'The Example House', role: 'owner' },
    });
  });
  it('returns the user with no membership when they have no household', async () => {
    expect(await identity.findByCognitoSub(t.db, 'sub-lone')).toEqual({
      user: { id: U_LONE, email: 'lone@example.test', name: 'Lone' },
    });
  });
  it('returns nothing for an unknown sub', async () => {
    expect(await identity.findByCognitoSub(t.db, 'sub-nobody')).toBeUndefined();
  });
});
