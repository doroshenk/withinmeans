import { randomUUID } from 'node:crypto';
import { paychecksTotalCents } from '@withinmeans/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conflict, InvalidInput, NotFound } from '../context.js';
import { clearAll, seedHousehold, snapshotHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { openMonth } from './openMonth.js';
import { paychecks } from './paychecks.js';
import { paySchedules, type NewPaySchedule } from './paySchedules.js';

let t: TestDb;
let A: Seeded;
let B: Seeded;

const NOW = new Date('2026-11-18T12:00:00Z');
const TODAY = '2026-11-18';

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.destroy();
});
beforeEach(async () => {
  await clearAll(t.db);
  A = await seedHousehold(t.db, 'A');
  B = await seedHousehold(t.db, 'B');
  // Household A keeps its account, but has no schedules, paychecks or months.
  for (const table of ['paychecks', 'pay_schedules', 'bills', 'months'] as const) {
    await t.db.deleteFrom(table).where('household_id', '=', A.householdId).execute();
  }
});

/** Spec §10: "Main job", biweekly, anchored Fri Nov 6, 2026, usual $3,225.00. */
const add = (over: Partial<NewPaySchedule> = {}) =>
  paySchedules.create(t.db, A.ctx(), {
    name: 'Main job',
    frequency: 'biweekly',
    anchorDate: '2026-11-06',
    usualCents: 322_500,
    ...over,
  });

const open = (ym: string) => openMonth(t.db, A.ctx(), ym, NOW);

const close = (ym: string) =>
  t.db
    .updateTable('months')
    .set({ status: 'closed', closed_at: NOW })
    .where('household_id', '=', A.householdId)
    .where('ym', '=', ym)
    .execute();

const rows = () =>
  t.db
    .selectFrom('paychecks')
    .selectAll()
    .where('household_id', '=', A.householdId)
    .orderBy('expected_date')
    .execute();

const dates = async () => (await rows()).map((p) => p.expected_date);

const paycheckOn = async (date: string) => {
  const found = (await rows()).find((p) => p.expected_date === date);
  if (found === undefined) throw new Error(`no paycheck on ${date}`);
  return found;
};

const receive = async (date: string, receivedCents: number, receivedDate = date) =>
  paychecks.markReceived(t.db, A.ctx(), (await paycheckOn(date)).id, {
    receivedCents,
    receivedDate,
  });

describe('P2-03 paySchedules.create', () => {
  it('saves the schedule, paid into the primary checking account', async () => {
    await t.db
      .updateTable('accounts')
      .set({ is_primary_checking: true })
      .where('household_id', '=', A.householdId)
      .execute();

    const created = await add({ name: '  Main job  ' });

    expect(created).toMatchObject({
      name: 'Main job',
      frequency: 'biweekly',
      anchor_date: '2026-11-06',
      usual_cents: 322_500,
      account_id: A.accountId,
      semimonthly_day_1: null,
      semimonthly_day_2: null,
      ended_on: null,
    });
    expect(await paySchedules.list(t.db, A.ctx())).toEqual([created]);
  });

  it('leaves the account empty when there is no primary checking account', async () => {
    expect((await add()).account_id).toBeNull();
  });

  it('keeps semimonthly days, the 1st and 15th by default', async () => {
    const usual = await add({ frequency: 'semimonthly' });
    const own = await add({ frequency: 'semimonthly', semimonthlyDays: [10, 25] });

    expect([usual.semimonthly_day_1, usual.semimonthly_day_2]).toEqual([1, 15]);
    expect([own.semimonthly_day_1, own.semimonthly_day_2]).toEqual([10, 25]);
  });

  it('adds expected paychecks to open months, and none to closed ones', async () => {
    await open('2026-10');
    await close('2026-10');
    await open('2026-11');

    await add();

    expect(await dates()).toEqual(['2026-11-06', '2026-11-20']);
  });

  it.each<[string, Partial<NewPaySchedule>]>([
    ['an empty name', { name: ' ' }],
    ['a take-home of zero', { usualCents: 0 }],
    ['fractional cents', { usualCents: 1.5 }],
    ['a malformed date', { anchorDate: '11/06/2026' }],
    ['the same day twice', { frequency: 'semimonthly', semimonthlyDays: [5, 5] }],
    ['a day past 31', { frequency: 'semimonthly', semimonthlyDays: [1, 32] }],
    ['semimonthly days on another frequency', { semimonthlyDays: [1, 15] }],
  ])('rejects %s', async (_why, over) => {
    await expect(add(over)).rejects.toBeInstanceOf(InvalidInput);
    expect(await rows()).toEqual([]);
  });

  it("rejects another household's account", async () => {
    await expect(add({ accountId: B.accountId })).rejects.toBeInstanceOf(NotFound);
  });
});

describe('P2-03 openMonth creates the expected paychecks (spec §5.9, §5.11)', () => {
  it('creates one unreceived paycheck per payday, at the usual take-home', async () => {
    const job = await add();

    await open('2026-11');

    expect(await rows()).toMatchObject([
      {
        schedule_id: job.id,
        expected_date: '2026-11-06',
        expected_cents: 322_500,
        received_date: null,
        received_cents: null,
      },
      { schedule_id: job.id, expected_date: '2026-11-20' },
    ]);
  });

  it("uses only this household's schedules", async () => {
    await add();
    const before = await snapshotHousehold(t.db, B);

    await open('2026-10');

    expect(await dates()).toEqual(['2026-10-09', '2026-10-23']);
    expect(await snapshotHousehold(t.db, B)).toEqual(before);
  });

  it('unique (schedule_id, expected_date): a second row for the same payday is refused', async () => {
    await add();
    await open('2026-11');
    const copy = { ...(await paycheckOn('2026-11-06')), id: randomUUID() };

    await expect(t.db.insertInto('paychecks').values(copy).execute()).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('opening twice, at once or later, creates no duplicates', async () => {
    await add();

    await Promise.all([open('2026-11'), open('2026-11')]);
    await open('2026-11');

    expect(await dates()).toEqual(['2026-11-06', '2026-11-20']);
  });
});

describe('P2-03 paychecks.markReceived (spec §5.9)', () => {
  it('T3: marking Nov 20 received at $3,248.60 replaces the expected amount', async () => {
    await add();
    await open('2026-11');
    await receive('2026-11-06', 327_218);

    await receive('2026-11-20', 324_860, '2026-11-19');

    const month = await paychecks.listForMonth(t.db, A.ctx(), '2026-11');
    expect(month).toHaveLength(2);
    expect(month[1]).toMatchObject({
      expected_cents: 322_500,
      received_cents: 324_860,
      received_date: '2026-11-19',
    });
    const total = paychecksTotalCents(
      month.map((p) => ({ expectedCents: p.expected_cents, receivedCents: p.received_cents })),
    );
    // With the $534.20 of other income this is T3's $7,054.98.
    expect(total + 53_420).toBe(705_498);
  });

  it('can be corrected by marking it again', async () => {
    await add();
    await open('2026-11');
    await receive('2026-11-06', 327_218);

    await receive('2026-11-06', 327_000);

    expect((await paycheckOn('2026-11-06')).received_cents).toBe(327_000);
  });

  it.each([
    ['an amount of zero', { receivedCents: 0, receivedDate: '2026-11-06' }],
    ['a malformed date', { receivedCents: 100, receivedDate: 'today' }],
  ])('rejects %s', async (_why, received) => {
    await add();
    await open('2026-11');
    const { id } = await paycheckOn('2026-11-06');

    await expect(paychecks.markReceived(t.db, A.ctx(), id, received)).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });

  it('a closed month is read-only', async () => {
    await add();
    await open('2026-11');
    await close('2026-11');

    await expect(receive('2026-11-06', 327_218)).rejects.toBeInstanceOf(Conflict);
    expect((await paycheckOn('2026-11-06')).received_cents).toBeNull();
  });
});

describe('P2-03 paychecks.listForMonth', () => {
  it('lists only that month, first day to last', async () => {
    await add({ frequency: 'weekly', anchorDate: '2026-11-01' });
    await open('2026-11');
    await open('2026-12');

    const month = await paychecks.listForMonth(t.db, A.ctx(), '2026-11');

    expect(month.map((p) => p.expected_date)).toEqual([
      '2026-11-01',
      '2026-11-08',
      '2026-11-15',
      '2026-11-22',
      '2026-11-29',
    ]);
  });

  it('rejects a malformed month', async () => {
    await expect(paychecks.listForMonth(t.db, A.ctx(), '2026-13')).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });
});

describe('P2-03 stopping and restarting a schedule (spec §5.9)', () => {
  /** November (Nov 6, 20) and December (Dec 4, 18) open. */
  async function twoMonths() {
    const job = await add();
    await open('2026-11');
    await open('2026-12');
    return job;
  }

  const endedOn = async () => (await paySchedules.list(t.db, A.ctx()))[0]?.ended_on;

  it('stopping removes future expected paychecks and keeps past ones', async () => {
    const job = await twoMonths();

    await paySchedules.stop(t.db, A.ctx(), job.id, TODAY);

    // Nov 6 is past and not marked received: it stays.
    expect(await dates()).toEqual(['2026-11-06']);
    expect(await endedOn()).toBe(TODAY);
  });

  it("keeps today's paycheck, and one already received early", async () => {
    const job = await twoMonths();
    await receive('2026-12-04', 322_500, '2026-11-20');

    await paySchedules.stop(t.db, A.ctx(), job.id, '2026-11-20');

    expect(await dates()).toEqual(['2026-11-06', '2026-11-20', '2026-12-04']);
  });

  it('leaves closed months alone', async () => {
    const job = await twoMonths();
    await close('2026-11');

    await paySchedules.stop(t.db, A.ctx(), job.id, TODAY);

    expect(await dates()).toEqual(['2026-11-06', '2026-11-20']);
  });

  it("leaves other schedules' paychecks", async () => {
    const job = await twoMonths();
    await add({ name: 'Side', frequency: 'monthly', anchorDate: '2026-11-28' });

    await paySchedules.stop(t.db, A.ctx(), job.id, TODAY);

    expect(await dates()).toEqual(['2026-11-06', '2026-11-28', '2026-12-28']);
  });

  it('a month opened after stopping gets no paychecks from the stopped schedule', async () => {
    const job = await add();
    await paySchedules.stop(t.db, A.ctx(), job.id, TODAY);

    await open('2026-12');

    expect(await dates()).toEqual([]);
  });

  it('stopping again keeps the first stop date', async () => {
    const job = await twoMonths();
    await paySchedules.stop(t.db, A.ctx(), job.id, TODAY);

    await paySchedules.stop(t.db, A.ctx(), job.id, '2026-12-01');

    expect(await endedOn()).toBe(TODAY);
  });

  it('restarting brings back paychecks from today on, without duplicates', async () => {
    const job = await twoMonths();
    await receive('2026-12-04', 330_000, TODAY);
    await paySchedules.stop(t.db, A.ctx(), job.id, TODAY);

    await paySchedules.restart(t.db, A.ctx(), job.id, TODAY);

    expect(await endedOn()).toBeNull();
    expect(await dates()).toEqual(['2026-11-06', '2026-11-20', '2026-12-04', '2026-12-18']);
    expect((await paycheckOn('2026-12-04')).received_cents).toBe(330_000);
  });

  it('restarting later does not bring back paydays missed while stopped', async () => {
    const job = await twoMonths();
    await paySchedules.stop(t.db, A.ctx(), job.id, TODAY);

    await paySchedules.restart(t.db, A.ctx(), job.id, '2026-12-10');

    expect(await dates()).toEqual(['2026-11-06', '2026-12-18']);
  });

  it('restarting a running schedule changes nothing', async () => {
    const job = await twoMonths();
    await t.db
      .deleteFrom('paychecks')
      .where('id', '=', (await paycheckOn('2026-12-18')).id)
      .execute();

    await paySchedules.restart(t.db, A.ctx(), job.id, TODAY);

    expect(await dates()).toEqual(['2026-11-06', '2026-11-20', '2026-12-04']);
  });

  it('rejects a malformed date', async () => {
    const job = await add();

    await expect(paySchedules.stop(t.db, A.ctx(), job.id, 'today')).rejects.toBeInstanceOf(
      InvalidInput,
    );
    await expect(paySchedules.restart(t.db, A.ctx(), job.id, 'today')).rejects.toBeInstanceOf(
      InvalidInput,
    );
  });
});
