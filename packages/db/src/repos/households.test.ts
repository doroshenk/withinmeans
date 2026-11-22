import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Forbidden, type HouseholdContext } from '../context.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { households } from './households.js';

let t: TestDb;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ctx = (householdId: string, role: HouseholdContext['role'] = 'owner'): HouseholdContext => ({
  householdId,
  userId: '33333333-3333-4333-8333-333333333333',
  role,
});

beforeAll(async () => {
  t = await createTestDb();
  await t.db
    .insertInto('households')
    .values([
      {
        id: A,
        name: 'A',
        mode: 'solo',
        timezone: 'America/New_York',
        cushion_cents: 0,
        first_month: '2026-11',
      },
      {
        id: B,
        name: 'B',
        mode: 'duo',
        timezone: 'America/Chicago',
        cushion_cents: 0,
        first_month: '2026-11',
      },
    ])
    .execute();
});
afterAll(async () => {
  await t.destroy();
});

describe('households.getMine', () => {
  it('returns only the signed-in household', async () => {
    expect((await households.getMine(t.db, ctx(A)))?.name).toBe('A');
    expect((await households.getMine(t.db, ctx(B)))?.name).toBe('B');
  });
  it('returns nothing for a household that does not exist', async () => {
    const none = await households.getMine(t.db, ctx('99999999-9999-4999-8999-999999999999'));
    expect(none).toBeUndefined();
  });
});

describe('isolation: household A cannot touch household B', () => {
  it("cannot read B's row", async () => {
    const mine = await households.getMine(t.db, ctx(A));
    expect(mine?.id).toBe(A);
    expect(mine?.name).not.toBe('B');
  });
  it("cannot update B's row", async () => {
    await households.rename(t.db, ctx(A), 'A renamed');
    const b = await households.getMine(t.db, ctx(B));
    expect(b?.name).toBe('B');
  });
  it("cannot delete B's row", async () => {
    await households.remove(t.db, ctx(A));
    expect((await households.getMine(t.db, ctx(B)))?.name).toBe('B');
  });
});

describe('households writes reject the view role', () => {
  it('rename throws Forbidden and changes nothing', async () => {
    await expect(households.rename(t.db, ctx(B, 'view'), 'nope')).rejects.toBeInstanceOf(Forbidden);
    expect((await households.getMine(t.db, ctx(B)))?.name).toBe('B');
  });
  it('remove throws Forbidden', async () => {
    await expect(households.remove(t.db, ctx(B, 'view'))).rejects.toBeInstanceOf(Forbidden);
  });
});
