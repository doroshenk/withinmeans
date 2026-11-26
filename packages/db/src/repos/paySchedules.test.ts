import { randomUUID } from 'node:crypto';
import { paychecksTotalCents } from '@withinmeans/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conflict, InvalidInput, NotFound } from '../context.js';
import { clearAll, seedHousehold, snapshotHousehold, type Seeded } from '../testing/fixtures.js';
import { createTestDb, type TestDb } from '../testing/harness.js';
import { pausingBeforeCommit } from '../testing/pausing.js';
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

describe('P2-03 stopping and marking received at the same moment', () => {
  /**
   * Runs `second` while `first` has done its work but not yet committed, and returns how both
   * ended. Which one wins depends on the engine: Postgres makes `second` wait, while DSQL lets it
   * commit and reruns `first`.
   */
  async function during(
    first: (db: TestDb['db']) => Promise<unknown>,
    second: () => Promise<unknown>,
  ) {
    const slow = pausingBeforeCommit(t.db);
    const firstDone = Promise.allSettled([first(slow.db)]);
    await slow.reached;
    const secondDone = Promise.allSettled([second()]);
    // Long enough for `second` to get as far as it can without waiting.
    await new Promise((resolve) => setTimeout(resolve, 500));
    slow.release();
    const [[firstResult], [secondResult]] = await Promise.all([firstDone, secondDone]);
    return [firstResult, secondResult] as const;
  }

  async function novemberOpen() {
    const job = await add();
    await open('2026-11');
    return { job, nov20: (await paycheckOn('2026-11-20')).id };
  }

  const markEarly = (db: TestDb['db'], id: string) =>
    paychecks.markReceived(db, A.ctx(), id, { receivedCents: 322_500, receivedDate: TODAY });

  /**
   * The two must end as if one ran after the other: marked first, the paycheck stays, received;
   * stopped first, it is gone and marking it says so.
   */
  async function expectOneAfterTheOther(
    marked: PromiseSettledResult<unknown>,
    stopped: PromiseSettledResult<unknown>,
  ) {
    expect(stopped.status).toBe('fulfilled');
    expect((await paySchedules.list(t.db, A.ctx()))[0]?.ended_on).toBe(TODAY);
    if (marked.status === 'fulfilled') {
      expect(await dates()).toEqual(['2026-11-06', '2026-11-20']);
      expect((await paycheckOn('2026-11-20')).received_cents).toBe(322_500);
    } else {
      expect(marked.reason).toBeInstanceOf(NotFound);
      expect(await dates()).toEqual(['2026-11-06']);
    }
  }

  it('a paycheck being marked received survives a stop, or marking it is NotFound', async () => {
    const { job, nov20 } = await novemberOpen();

    const [marked, stopped] = await during(
      (db) => markEarly(db, nov20),
      () => paySchedules.stop(t.db, A.ctx(), job.id, TODAY),
    );

    await expectOneAfterTheOther(marked, stopped);
  });

  it('marking a paycheck that a stop is deleting is never a silent success', async () => {
    const { job, nov20 } = await novemberOpen();

    const [stopped, marked] = await during(
      (db) => paySchedules.stop(db, A.ctx(), job.id, TODAY),
      () => markEarly(t.db, nov20),
    );

    await expectOneAfterTheOther(marked, stopped);
  });
});

describe('P2-09 removing a paycheck added by mistake', () => {
  const schedules = () => paySchedules.list(t.db, A.ctx());

  it('removes the schedule and the paychecks it expected, and nothing else', async () => {
    await open('2026-11');
    const job = await add();
    const kept = await add({ name: 'Side job', frequency: 'monthly' });

    await paySchedules.remove(t.db, A.ctx(), job.id, TODAY);

    expect((await schedules()).map((s) => s.id)).toEqual([kept.id]);
    expect((await rows()).map((p) => p.schedule_id)).toEqual([kept.id]);
  });

  it('removes a schedule that has no paychecks', async () => {
    const job = await add();

    await paySchedules.remove(t.db, A.ctx(), job.id, TODAY);

    expect(await schedules()).toEqual([]);
  });

  it('refuses once a paycheck has been received', async () => {
    await open('2026-11');
    const job = await add();
    const [first] = await rows();
    await paychecks.markReceived(t.db, A.ctx(), first?.id ?? '', {
      receivedCents: 327_218,
      receivedDate: '2026-11-06',
    });

    await expect(paySchedules.remove(t.db, A.ctx(), job.id, TODAY)).rejects.toBeInstanceOf(
      InvalidInput,
    );

    expect(await schedules()).toHaveLength(1);
    expect(await rows()).toHaveLength(2);
  });

  it('refuses when a closed month has one of its paychecks', async () => {
    await open('2026-11');
    const job = await add();
    await close('2026-11');

    await expect(paySchedules.remove(t.db, A.ctx(), job.id, TODAY)).rejects.toBeInstanceOf(
      InvalidInput,
    );

    expect(await rows()).toHaveLength(2);
  });

  it('P2-09: refuses when a past month has one of its paychecks, even if still open', async () => {
    await open('2026-11');
    const job = await add();

    await expect(paySchedules.remove(t.db, A.ctx(), job.id, '2026-12-01')).rejects.toBeInstanceOf(
      InvalidInput,
    );

    expect(await schedules()).toHaveLength(1);
    expect(await rows()).toHaveLength(2);
  });

  it("does not find another household's schedule", async () => {
    const job = await add();

    await expect(paySchedules.remove(t.db, B.ctx(), job.id, TODAY)).rejects.toBeInstanceOf(
      NotFound,
    );

    expect(await schedules()).toHaveLength(1);
  });
});

describe('P2-09 paySchedules.update (spec §6.4 "edit")', () => {
  const edit = (id: string, over: Partial<NewPaySchedule> = {}, today = TODAY) =>
    paySchedules.update(
      t.db,
      A.ctx(),
      id,
      {
        name: 'Main job',
        frequency: 'biweekly',
        anchorDate: '2026-11-06',
        usualCents: 322_500,
        ...over,
      },
      today,
    );

  const amounts = async () => (await rows()).map((p) => [p.expected_date, p.expected_cents]);

  it('saves the new name, take-home and account', async () => {
    const { id } = await add();

    await edit(id, { name: '  Day job ', usualCents: 330_000, accountId: A.accountId });

    expect(await paySchedules.list(t.db, A.ctx())).toMatchObject([
      { id, name: 'Day job', usual_cents: 330_000, account_id: A.accountId },
    ]);
  });

  it('keeps the account when none is given', async () => {
    const { id } = await add({ accountId: A.accountId });

    await edit(id);

    expect((await paySchedules.list(t.db, A.ctx()))[0]?.account_id).toBe(A.accountId);
  });

  it('changes the expected amount from today on, keeping the same rows', async () => {
    const { id } = await add();
    await open('2026-11');
    const nov20 = await paycheckOn('2026-11-20');

    await edit(id, { usualCents: 330_000 });

    expect(await amounts()).toEqual([
      ['2026-11-06', 322_500],
      ['2026-11-20', 330_000],
    ]);
    expect((await paycheckOn('2026-11-20')).id).toBe(nov20.id);
  });

  it("changes today's paycheck, but never a received one", async () => {
    const { id } = await add();
    await open('2026-11');
    await open('2026-12');
    await receive('2026-11-20', 324_860, TODAY);

    await edit(id, { usualCents: 330_000 }, '2026-11-06');

    expect(await amounts()).toEqual([
      ['2026-11-06', 322_500],
      ['2026-11-20', 322_500],
      ['2026-12-04', 330_000],
      ['2026-12-18', 330_000],
    ]);
  });

  it('moves the paydays still to come when the dates change', async () => {
    const { id } = await add();
    await open('2026-11');

    await edit(id, { frequency: 'weekly', anchorDate: '2026-11-19' });

    expect(await dates()).toEqual(['2026-11-06', '2026-11-19', '2026-11-26']);
  });

  it('adds no second paycheck beside one already received early', async () => {
    const { id } = await add();
    await open('2026-11');
    await receive('2026-11-20', 324_860, TODAY);

    await edit(id, { frequency: 'weekly', anchorDate: '2026-11-19' });

    expect(await dates()).toEqual(['2026-11-06', '2026-11-20', '2026-11-26']);
  });

  it('leaves closed months alone', async () => {
    const { id } = await add();
    await open('2026-11');
    await open('2026-12');
    await close('2026-12');

    await edit(id, { usualCents: 330_000 });

    expect(await amounts()).toEqual([
      ['2026-11-06', 322_500],
      ['2026-11-20', 330_000],
      ['2026-12-04', 322_500],
      ['2026-12-18', 322_500],
    ]);
  });

  it('a stopped schedule gets no paychecks by being edited', async () => {
    const { id } = await add();
    await open('2026-11');
    await paySchedules.stop(t.db, A.ctx(), id, TODAY);

    await edit(id, { frequency: 'weekly', anchorDate: '2026-11-19' });

    expect(await dates()).toEqual(['2026-11-06']);
  });

  it.each<[string, Partial<NewPaySchedule>]>([
    ['an empty name', { name: ' ' }],
    ['a take-home of zero', { usualCents: 0 }],
    ['the same day twice', { frequency: 'semimonthly', semimonthlyDays: [5, 5] }],
  ])('rejects %s', async (_why, over) => {
    const { id } = await add();
    const saved = await snapshotHousehold(t.db, A);

    await expect(edit(id, over)).rejects.toBeInstanceOf(InvalidInput);

    expect(await snapshotHousehold(t.db, A)).toEqual(saved);
  });

  it("does not find another household's schedule, or account", async () => {
    const { id } = await add();

    await expect(edit(B.payScheduleId)).rejects.toBeInstanceOf(NotFound);
    await expect(edit(id, { accountId: B.accountId })).rejects.toBeInstanceOf(NotFound);
  });

  it('refuses a brokerage or removed account', async () => {
    const { id } = await add({ accountId: A.accountId });
    const spare = (type: 'brokerage' | 'savings', archivedAt: Date | null) =>
      t.db
        .insertInto('accounts')
        .values({
          household_id: A.householdId,
          name: `Spare ${type}`,
          type,
          is_primary_checking: false,
          archived_at: archivedAt,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    const brokerage = await spare('brokerage', null);
    const removed = await spare('savings', NOW);

    for (const account of [brokerage, removed]) {
      await expect(edit(id, { accountId: account.id })).rejects.toBeInstanceOf(InvalidInput);
      await expect(add({ accountId: account.id })).rejects.toBeInstanceOf(InvalidInput);
    }
  });
});

describe('P2-09 undoing "received"', () => {
  it('puts the expected amount back', async () => {
    await add();
    await open('2026-11');
    await receive('2026-11-06', 327_218);

    await paychecks.unmarkReceived(t.db, A.ctx(), (await paycheckOn('2026-11-06')).id);

    expect(await paycheckOn('2026-11-06')).toMatchObject({
      expected_cents: 322_500,
      received_cents: null,
      received_date: null,
    });
  });

  it('drops a paycheck dated after its schedule stopped', async () => {
    const { id } = await add();
    await open('2026-11');
    await receive('2026-11-20', 324_860, TODAY);
    await paySchedules.stop(t.db, A.ctx(), id, TODAY);

    await paychecks.unmarkReceived(t.db, A.ctx(), (await paycheckOn('2026-11-20')).id);

    expect(await dates()).toEqual(['2026-11-06']);
  });

  it('a closed month is read-only', async () => {
    await add();
    await open('2026-11');
    await receive('2026-11-06', 327_218);
    await close('2026-11');
    const { id } = await paycheckOn('2026-11-06');

    await expect(paychecks.unmarkReceived(t.db, A.ctx(), id)).rejects.toBeInstanceOf(Conflict);

    expect((await paycheckOn('2026-11-06')).received_cents).toBe(327_218);
  });

  it('does not find an unknown paycheck', async () => {
    await expect(paychecks.unmarkReceived(t.db, A.ctx(), randomUUID())).rejects.toBeInstanceOf(
      NotFound,
    );
  });
});

describe('P2-09 paychecks.listReceived', () => {
  it("lists a schedule's received paychecks, latest received first, up to the limit", async () => {
    const { id } = await add();
    await add({ name: 'Side job', anchorDate: '2026-11-07' });
    await open('2026-11');
    await open('2026-12');
    await receive('2026-11-06', 100);
    await receive('2026-11-07', 999);
    await receive('2026-11-20', 200);
    await receive('2026-12-04', 300);

    const latest = await paychecks.listReceived(t.db, A.ctx(), id, 2);

    expect(latest.map((p) => p.expected_date)).toEqual(['2026-12-04', '2026-11-20']);
  });
});
