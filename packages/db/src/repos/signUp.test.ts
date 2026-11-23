import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conflict } from '../context.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { signUp, type NewHousehold } from './signUp.js';

let t: TestDb;
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
});

const sam: NewHousehold = {
  mode: 'solo',
  householdName: "Sam's household",
  userName: 'Sam',
  email: 'sam@example.test',
  cognitoSub: 'sub-sam',
  timezone: 'America/Chicago',
  firstMonth: '2026-11',
};

describe('P1-02: signUp.createHousehold', () => {
  it('P1-02: solo sign-up creates a solo household with one owner membership', async () => {
    const { householdId, userId } = await signUp.createHousehold(t.db, sam);

    const households = await t.db.selectFrom('households').selectAll().execute();
    expect(households).toHaveLength(1);
    expect(households[0]).toMatchObject({
      id: householdId,
      name: "Sam's household",
      mode: 'solo',
      timezone: 'America/Chicago',
      first_month: '2026-11',
    });
    const members = await t.db.selectFrom('memberships').selectAll().execute();
    expect(members).toEqual([{ household_id: householdId, user_id: userId, role: 'owner' }]);
    const users = await t.db.selectFrom('users').selectAll().execute();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      id: userId,
      email: 'sam@example.test',
      cognito_sub: 'sub-sam',
    });
  });

  it('P1-02: partner mode creates a duo household (the partner joins by invite later)', async () => {
    await signUp.createHousehold(t.db, { ...sam, mode: 'partner', householdName: 'The Examples' });

    const [h] = await t.db.selectFrom('households').selectAll().execute();
    expect(h).toMatchObject({ mode: 'duo', name: 'The Examples' });
    expect(await t.db.selectFrom('memberships').selectAll().execute()).toHaveLength(1);
  });

  it('P1-02: all or nothing: a taken email leaves no household or membership behind', async () => {
    await signUp.createHousehold(t.db, sam);

    await expect(
      signUp.createHousehold(t.db, { ...sam, cognitoSub: 'sub-other', email: 'SAM@example.test' }),
    ).rejects.toBeInstanceOf(Conflict);

    expect(await t.db.selectFrom('households').selectAll().execute()).toHaveLength(1);
    expect(await t.db.selectFrom('memberships').selectAll().execute()).toHaveLength(1);
    expect(await t.db.selectFrom('users').selectAll().execute()).toHaveLength(1);
  });

  it('P1-02: stores the email lower-cased', async () => {
    await signUp.createHousehold(t.db, { ...sam, email: 'Sam@Example.TEST' });
    const [u] = await t.db.selectFrom('users').select('email').execute();
    expect(u?.email).toBe('sam@example.test');
  });
});
