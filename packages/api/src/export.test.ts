import { createTestDb, type TestDb } from '@withinmeans/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from './context.js';
import { runExportJob } from './exportJob.js';
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
const U_VIEW = '55555555-5555-4555-8555-555555555555';
const U_OTHER = '66666666-6666-4666-8666-666666666666';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.db
    .insertInto('households')
    .values([
      {
        id: H1,
        name: 'First House',
        mode: 'duo',
        // Noon UTC on Nov 18 is already Nov 19 here: the export date follows the household.
        timezone: 'Pacific/Kiritimati',
        first_month: '2026-11',
        cushion_cents: 987_654,
      },
      {
        id: H2,
        name: 'Second House',
        mode: 'solo',
        timezone: 'America/New_York',
        first_month: '2026-11',
      },
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

async function caller(authorization: string | undefined) {
  const { logger } = captureLogger();
  const ctx = await createContextFactory({
    db: t.db,
    verifier: fakeVerifier,
    logger,
    identityProvider: fakeIdentityProvider(),
    clock: testClock,
    invites: fakeInviteDeps(),
  })(authorization);
  return appRouter.createCaller(ctx);
}

describe('P1-14: exportData ("Download my data")', () => {
  it.each(['sub-owner', 'sub-view'])(
    "returns the member's own household only (%s)",
    async (sub) => {
      const result = await (await caller(`Bearer good:${sub}`)).exportData();

      expect(result).toMatchObject({
        version: 1,
        exportedAt: '2026-11-18T12:00:00Z',
        exportedOn: '2026-11-19',
      });
      expect(result.tables['households']).toEqual([
        expect.objectContaining({ id: H1, name: 'First House', cushion_cents: 987_654 }),
      ]);
      const text = JSON.stringify(result);
      expect(text).not.toContain('Second House');
      expect(text).not.toContain('other@example.test');
    },
  );

  it('rejects a visitor who is not signed in', async () => {
    await expect((await caller(undefined)).exportData()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects a signed-in user with no household', async () => {
    await expect((await caller('Bearer good:sub-nobody')).exportData()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('P1-14: the nightly export job', () => {
  it("writes each household's export to its own object, with nothing from the others", async () => {
    const objects = new Map<string, string>();
    const { logger, lines } = captureLogger();

    const result = await runExportJob({
      db: t.db,
      clock: testClock,
      logger,
      store: {
        put: async (key, body) => {
          objects.set(key, body);
        },
      },
    });

    expect(result).toEqual({ exported: 2 });
    expect([...objects.keys()].sort()).toEqual([`households/${H1}.json`, `households/${H2}.json`]);
    const first = objects.get(`households/${H1}.json`) ?? '';
    expect(JSON.parse(first)).toMatchObject({ version: 1, exportedOn: '2026-11-19' });
    expect(first).toContain('First House');
    expect(first).not.toContain('Second House');
    expect(objects.get(`households/${H2}.json`)).not.toContain('First House');
    expect(lines.join('\n')).not.toContain('987654');
  });

  it('carries on past a failed household, then fails the run so it shows up as an error', async () => {
    const attempted: string[] = [];
    const { logger, lines } = captureLogger();

    const run = runExportJob({
      db: t.db,
      clock: testClock,
      logger,
      store: {
        put: async (key) => {
          attempted.push(key);
          if (key.includes(H1)) throw new Error('value 987654 rejected');
        },
      },
    });

    await expect(run).rejects.toThrow('1 of 2 household exports failed');
    expect(attempted).toHaveLength(2);
    const log = lines.join('\n');
    expect(log).toContain(H1);
    expect(log).not.toContain('987654');
  });
});
