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

describe('P2-03 pay schedules and paychecks API', () => {
  it('adds a schedule, opens the month, marks a paycheck, stops and restarts', async () => {
    const owner = await caller('sub-owner');
    const { id } = await owner.addPaySchedule({
      name: 'Main job',
      frequency: 'biweekly',
      anchorDate: '2026-11-06',
      usualCents: 322_500,
    });
    await owner.startFirstMonth({ choice: 'this' });

    const [, nov20] = await owner.paychecks({ ym: '2026-11' });
    expect(nov20).toEqual({
      id: expect.any(String),
      scheduleId: id,
      scheduleName: 'Main job',
      expectedDate: '2026-11-20',
      expectedCents: 322_500,
      receivedDate: null,
      receivedCents: null,
    });

    await owner.markPaycheckReceived({
      id: nov20?.id ?? '',
      receivedCents: 324_860,
      receivedDate: '2026-11-18',
    });
    expect((await owner.paychecks({ ym: '2026-11' }))[1]).toMatchObject({
      receivedCents: 324_860,
      receivedDate: '2026-11-18',
    });

    // Today is Nov 18 in the household's time zone.
    await owner.stopPaySchedule({ id });
    expect(await owner.paySchedules()).toEqual([
      {
        id,
        name: 'Main job',
        frequency: 'biweekly',
        anchorDate: '2026-11-06',
        semimonthlyDays: null,
        usualCents: 322_500,
        accountId: null,
        endedOn: '2026-11-18',
      },
    ]);
    // Nov 20 was received early, so it stays.
    expect(await owner.paychecks({ ym: '2026-11' })).toHaveLength(2);

    await owner.restartPaySchedule({ id });
    expect((await owner.paySchedules())[0]?.endedOn).toBeNull();
  });

  it('returns semimonthly days', async () => {
    const owner = await caller('sub-owner');
    const { id } = await owner.addPaySchedule({
      name: 'Pension',
      frequency: 'semimonthly',
      semimonthlyDays: [10, 25],
      anchorDate: '2026-11-10',
      usualCents: 50_000,
    });

    const found = (await owner.paySchedules()).find((s) => s.id === id);

    expect(found?.semimonthlyDays).toEqual([10, 25]);
  });

  it("pays into the chosen account, and refuses another household's", async () => {
    const owner = await caller('sub-owner');
    const other = await caller('sub-other');
    const account = await owner.addAccount({
      name: 'Joint checking',
      type: 'checking',
      balanceCents: 100_000,
    });
    const input = {
      name: 'Side job',
      frequency: 'weekly' as const,
      anchorDate: '2026-11-06',
      usualCents: 20_000,
      accountId: account.id,
    };

    const { id } = await owner.addPaySchedule(input);

    expect((await owner.paySchedules()).find((s) => s.id === id)?.accountId).toBe(account.id);
    await expect(other.addPaySchedule(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lets a view-only member read', async () => {
    const view = await caller('sub-view');

    expect((await view.paySchedules()).length).toBeGreaterThan(0);
    expect((await view.paychecks({ ym: '2026-11' })).length).toBeGreaterThan(0);
  });

  it("shows another household nothing, and can't touch this one's rows", async () => {
    const owner = await caller('sub-owner');
    const other = await caller('sub-other');
    const [schedule] = await owner.paySchedules();
    const [paycheck] = await owner.paychecks({ ym: '2026-11' });

    expect(await other.paySchedules()).toEqual([]);
    expect(await other.paychecks({ ym: '2026-11' })).toEqual([]);
    await expect(other.stopPaySchedule({ id: schedule?.id ?? '' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(other.restartPaySchedule({ id: schedule?.id ?? '' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      other.markPaycheckReceived({
        id: paycheck?.id ?? '',
        receivedCents: 1,
        receivedDate: '2026-11-18',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('P2-09 Paychecks page API', () => {
  // Household Two: no accounts, schedules or months until here.
  const job = {
    name: 'Main job',
    frequency: 'biweekly' as const,
    anchorDate: '2026-11-06',
    usualCents: 322_500,
  };

  it('previews a month not started, then shows it open with schedules and accounts', async () => {
    const other = await caller('sub-other');
    const account = await other.addAccount({
      name: 'Everyday checking',
      type: 'checking',
      balanceCents: 100_000,
    });
    const { id } = await other.addPaySchedule(job);

    const preview = await other.paychecksPage({});
    expect(preview).toMatchObject({ today: '2026-11-18', ym: '2026-11', status: 'not-started' });
    expect(preview.paychecks).toMatchObject([
      { id: null, scheduleName: 'Main job', expectedDate: '2026-11-06', receivedCents: null },
      { id: null, expectedDate: '2026-11-20', expectedCents: 322_500 },
    ]);

    await other.startFirstMonth({ choice: 'this' });
    const [nov6] = (await other.paychecksPage({ ym: '2026-11' })).paychecks;
    await other.markPaycheckReceived({
      id: nov6?.id ?? '',
      receivedCents: 327_218,
      receivedDate: '2026-11-06',
    });

    const page = await other.paychecksPage({ ym: '2026-11' });
    expect(page.status).toBe('open');
    expect(page.paychecks[0]).toStrictEqual({
      id: nov6?.id,
      scheduleId: id,
      scheduleName: 'Main job',
      accountName: 'Everyday checking',
      expectedDate: '2026-11-06',
      expectedCents: 322_500,
      receivedDate: '2026-11-06',
      receivedCents: 327_218,
    });
    expect(page.schedules).toMatchObject([
      {
        id,
        name: 'Main job',
        accountId: account.id,
        accountName: 'Everyday checking',
        averageCents: 327_218,
        endedOn: null,
      },
    ]);
    expect(page.accounts).toEqual([{ id: account.id, name: 'Everyday checking', isPrimary: true }]);
  });

  it('undoes "received", and edits a schedule', async () => {
    const other = await caller('sub-other');
    const before = await other.paychecksPage({});
    const [nov6] = before.paychecks;
    const scheduleId = nov6?.scheduleId ?? '';

    await other.unmarkPaycheckReceived({ id: nov6?.id ?? '' });
    await other.updatePaySchedule({ ...job, id: scheduleId, name: 'Day job', usualCents: 330_000 });

    const page = await other.paychecksPage({});
    expect(page.paychecks).toMatchObject([
      { receivedCents: null, receivedDate: null, expectedCents: 322_500 },
      { expectedDate: '2026-11-20', expectedCents: 330_000 },
    ]);
    expect(page.schedules).toMatchObject([{ name: 'Day job', averageCents: null }]);
  });

  it('a past month with no Month row shows no paychecks', async () => {
    const other = await caller('sub-other');

    expect(await other.paychecksPage({ ym: '2026-09' })).toMatchObject({
      ym: '2026-09',
      status: 'not-started',
      paychecks: [],
    });
  });

  it('lets a view-only member read, and keeps households apart', async () => {
    const owner = await caller('sub-owner');
    const view = await caller('sub-view');
    const other = await caller('sub-other');
    const theirs = await other.paychecksPage({});
    const mine = await view.paychecksPage({});

    expect(mine.schedules.map((s) => s.id)).not.toContain(theirs.schedules[0]?.id);
    await expect(
      owner.updatePaySchedule({ ...job, id: theirs.schedules[0]?.id ?? '' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      owner.unmarkPaycheckReceived({ id: theirs.paychecks[0]?.id ?? '' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('shows a closed month, which is read-only', async () => {
    const other = await caller('sub-other');
    await t.db
      .updateTable('months')
      .set({ status: 'closed', closed_at: new Date('2026-11-30T12:00:00Z') })
      .where('household_id', '=', H2)
      .execute();

    const page = await other.paychecksPage({ ym: '2026-11' });

    expect(page.status).toBe('closed');
    await expect(
      other.unmarkPaycheckReceived({ id: page.paychecks[0]?.id ?? '' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
