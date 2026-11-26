import { PAY_FREQUENCIES, type PayFrequency } from '@withinmeans/domain';
import type { Selectable, Transaction } from 'kysely';
import { assertCanWrite, InvalidInput, NotFound, type HouseholdContext } from '../context.js';
import type { Database, DB, PaySchedulesTable } from '../db.js';
import { lockHouseholdMonths } from './monthBills.js';
import { insertMonthPaychecks } from './paychecks.js';
import { assertCents, assertDate, cleanName, depositAccountId, inTransaction } from './shared.js';

export type PaySchedule = Selectable<PaySchedulesTable>;

export interface NewPaySchedule {
  name: string;
  frequency: PayFrequency;
  /** 'YYYY-MM-DD' */
  anchorDate: string;
  /** Semimonthly only; the 1st and 15th when not given. */
  semimonthlyDays?: readonly [number, number];
  usualCents: number;
  /** The primary checking account when not given. */
  accountId?: string;
}

/** The two days to store: null unless the schedule is semimonthly. */
function semimonthlyDays(input: NewPaySchedule): readonly [number, number] | null {
  const { frequency, semimonthlyDays: days } = input;
  if (frequency !== 'semimonthly') {
    if (days !== undefined) throw new InvalidInput('only semimonthly pay has two days');
    return null;
  }
  if (days === undefined) return [1, 15];
  const valid = (day: number) => Number.isInteger(day) && day >= 1 && day <= 31;
  if (!days.every(valid) || days[0] === days[1]) {
    throw new InvalidInput('pick two different days from 1 to 31');
  }
  return days;
}

async function openYms(trx: Transaction<DB>, ctx: HouseholdContext): Promise<string[]> {
  const rows = await trx
    .selectFrom('months')
    .select('ym')
    .where('household_id', '=', ctx.householdId)
    .where('status', '=', 'open')
    .execute();
  return rows.map((r) => r.ym);
}

async function findMine(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  id: string,
): Promise<PaySchedule> {
  const found = await trx
    .selectFrom('pay_schedules')
    .selectAll()
    .where('id', '=', id)
    .where('household_id', '=', ctx.householdId)
    .executeTakeFirst();
  if (found === undefined) throw new NotFound('Pay schedule not found');
  return found;
}

async function setEndedOn(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  id: string,
  endedOn: string | null,
): Promise<void> {
  await trx
    .updateTable('pay_schedules')
    .set({ ended_on: endedOn })
    .where('id', '=', id)
    .where('household_id', '=', ctx.householdId)
    .execute();
}

export const paySchedules = {
  async list(db: Database, ctx: HouseholdContext): Promise<PaySchedule[]> {
    return db
      .selectFrom('pay_schedules')
      .selectAll()
      .where('household_id', '=', ctx.householdId)
      .orderBy('created_at')
      .orderBy('id')
      .execute();
  },

  /** Adds the schedule, and its expected paychecks to every open month. */
  async create(db: Database, ctx: HouseholdContext, input: NewPaySchedule): Promise<PaySchedule> {
    assertCanWrite(ctx);
    const name = cleanName(input.name);
    if (!PAY_FREQUENCIES.includes(input.frequency)) throw new InvalidInput('unknown frequency');
    assertDate(input.anchorDate);
    assertCents(input.usualCents);
    if (input.usualCents <= 0) throw new InvalidInput('take-home must be more than zero');
    const days = semimonthlyDays(input);
    return inTransaction(db, async (trx) => {
      await lockHouseholdMonths(trx, ctx);
      const created = await trx
        .insertInto('pay_schedules')
        .values({
          household_id: ctx.householdId,
          name,
          frequency: input.frequency,
          anchor_date: input.anchorDate,
          semimonthly_day_1: days?.[0] ?? null,
          semimonthly_day_2: days?.[1] ?? null,
          usual_cents: input.usualCents,
          account_id: await depositAccountId(trx, ctx, input.accountId),
          ended_on: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      for (const ym of await openYms(trx, ctx)) {
        await insertMonthPaychecks(trx, ctx, ym, [created]);
      }
      return created;
    });
  },

  /**
   * Takes back a schedule added by mistake (setup step 3), with the paychecks it expected. One with
   * a received paycheck, or a paycheck in a closed month or one before `today`'s, is history: it can
   * only be stopped (spec §4: past months keep their rows).
   */
  async remove(db: Database, ctx: HouseholdContext, id: string, today: string): Promise<void> {
    assertCanWrite(ctx);
    assertDate(today);
    await inTransaction(db, async (trx) => {
      await lockHouseholdMonths(trx, ctx);
      await findMine(trx, ctx, id);
      const expected = await trx
        .selectFrom('paychecks')
        .select(['expected_date', 'received_cents'])
        .where('household_id', '=', ctx.householdId)
        .where('schedule_id', '=', id)
        .execute();
      const open = new Set(await openYms(trx, ctx));
      const history = expected.some((p) => {
        const ym = p.expected_date.slice(0, 7);
        return p.received_cents !== null || !open.has(ym) || ym < today.slice(0, 7);
      });
      if (history) throw new InvalidInput('This paycheck has history, so it can only be stopped.');
      await trx
        .deleteFrom('paychecks')
        .where('household_id', '=', ctx.householdId)
        .where('schedule_id', '=', id)
        .execute();
      await trx
        .deleteFrom('pay_schedules')
        .where('household_id', '=', ctx.householdId)
        .where('id', '=', id)
        .execute();
    });
  },

  /**
   * Spec §5.9 "Stop this paycheck": sets `ended_on` to `today` and deletes the paychecks after it
   * that are in open months and not received. Stopping a stopped schedule changes nothing.
   */
  async stop(db: Database, ctx: HouseholdContext, id: string, today: string): Promise<void> {
    assertCanWrite(ctx);
    assertDate(today);
    await inTransaction(db, async (trx) => {
      await lockHouseholdMonths(trx, ctx);
      const schedule = await findMine(trx, ctx, id);
      if (schedule.ended_on !== null) return;
      await setEndedOn(trx, ctx, id, today);
      const open = new Set(await openYms(trx, ctx));
      const future = await trx
        .selectFrom('paychecks')
        .select(['id', 'expected_date'])
        .where('household_id', '=', ctx.householdId)
        .where('schedule_id', '=', id)
        .where('expected_date', '>', today)
        .where('received_cents', 'is', null)
        .execute();
      const doomed = future.filter((p) => open.has(p.expected_date.slice(0, 7))).map((p) => p.id);
      if (doomed.length === 0) return;
      await trx
        .deleteFrom('paychecks')
        .where('household_id', '=', ctx.householdId)
        .where('id', 'in', doomed)
        .execute();
    });
  },

  /**
   * Clears `ended_on` and expects pay again in open months, from `today` on: in those months,
   * paydays missed while stopped stay out. A month opened later gets all its paydays. Restarting a
   * running schedule changes nothing.
   */
  async restart(db: Database, ctx: HouseholdContext, id: string, today: string): Promise<void> {
    assertCanWrite(ctx);
    assertDate(today);
    await inTransaction(db, async (trx) => {
      await lockHouseholdMonths(trx, ctx);
      const schedule = await findMine(trx, ctx, id);
      if (schedule.ended_on === null) return;
      await setEndedOn(trx, ctx, id, null);
      for (const ym of await openYms(trx, ctx)) {
        await insertMonthPaychecks(trx, ctx, ym, [{ ...schedule, ended_on: null }], today);
      }
    });
  },
};
