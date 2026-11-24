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

describe('P1-11 categories API', () => {
  it('seeds the 7 defaults once, in order, and reads them back with usage', async () => {
    const owner = await caller('sub-owner');

    await owner.seedDefaultCategories({ preset: 'default' });
    await owner.seedDefaultCategories({ preset: 'default' });

    const rows = await owner.categories();
    expect(rows.map((r) => r.name)).toEqual([
      'Housing',
      'Utilities',
      'Home',
      'Insurance',
      'Savings',
      'Subscriptions',
      'Auto',
    ]);
    expect(rows.map((r) => r.billCount)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(rows[0]).toMatchObject({ id: expect.any(String), colorIndex: 0 });
  });

  it('another household sees none of it', async () => {
    expect(await (await caller('sub-other')).categories()).toEqual([]);
  });

  it('adds, renames and recolors; duplicates are a CONFLICT ignoring case', async () => {
    const owner = await caller('sub-owner');
    const pets = await owner.createCategory({ name: ' Pets ', colorIndex: 7 });
    await owner.renameCategory({ id: pets.id, name: 'Pets & vet' });
    await owner.recolorCategory({ id: pets.id, colorIndex: 8 });

    const row = (await owner.categories()).find((r) => r.id === pets.id);
    expect(row).toMatchObject({ name: 'Pets & vet', colorIndex: 8 });
    await expect(owner.createCategory({ name: 'HOUSING', colorIndex: 1 })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(owner.renameCategory({ id: pets.id, name: 'home' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('T18: deleting "Home" used by 1 bill moves it to the first category and says so', async () => {
    const owner = await caller('sub-owner');
    const rows = await owner.categories();
    const housing = rows.find((r) => r.name === 'Housing');
    const home = rows.find((r) => r.name === 'Home');
    await t.db
      .insertInto('recurring_bills')
      .values({
        household_id: H1,
        name: 'Lawn',
        estimate_cents: 5_000,
        due_day: 3,
        category_id: home?.id ?? '',
        autopay: false,
        start_ym: '2026-11',
      })
      .execute();

    const result = await owner.deleteCategory({ id: home?.id ?? '' });

    expect(result).toEqual({
      movedCount: 1,
      movedToName: 'Housing',
      message: 'Moved 1 bill to Housing.',
    });
    const after = await owner.categories();
    expect(after.map((r) => r.name)).not.toContain('Home');
    expect(after.find((r) => r.id === housing?.id)?.billCount).toBe(1);
  });

  it('deleting an unused category has no message; the last category cannot be deleted', async () => {
    const owner = await caller('sub-owner');
    const rows = await owner.categories();
    const insurance = rows.find((r) => r.name === 'Insurance');
    expect(await owner.deleteCategory({ id: insurance?.id ?? '' })).toMatchObject({
      movedCount: 0,
      message: null,
    });

    const other = await caller('sub-other');
    const only = await other.createCategory({ name: 'Housing', colorIndex: 0 });
    await expect(other.deleteCategory({ id: only.id })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it("another household's category id looks missing", async () => {
    const owner = await caller('sub-owner');
    const other = await caller('sub-other');
    const theirs = (await other.categories())[0];
    await expect(owner.deleteCategory({ id: theirs?.id ?? '' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('a view-only member can read, not change', async () => {
    const view = await caller('sub-view');
    expect((await view.categories()).length).toBeGreaterThan(0);
    await expect(view.createCategory({ name: 'Pets', colorIndex: 1 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
