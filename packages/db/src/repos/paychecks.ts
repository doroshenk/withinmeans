import { addMonths, paychecksForMonth, type PayScheduleTemplate } from '@withinmeans/domain';
import type { Selectable, Transaction } from 'kysely';
import { assertCanWrite, InvalidInput, NotFound, type HouseholdContext } from '../context.js';
import type { Database, DB, PaychecksTable, PaySchedulesTable } from '../db.js';
import { lockHouseholdMonths } from './monthBills.js';
import {
  assertCents,
  assertDate,
  assertMonthNotClosed,
  assertYm,
  inTransaction,
} from './shared.js';

export type Paycheck = Selectable<PaychecksTable>;

const templateOf = (row: Selectable<PaySchedulesTable>): PayScheduleTemplate => ({
  id: row.id,
  frequency: row.frequency,
  anchorDate: row.anchor_date,
  semimonthlyDays:
    row.semimonthly_day_1 === null || row.semimonthly_day_2 === null
      ? null
      : [row.semimonthly_day_1, row.semimonthly_day_2],
  usualCents: row.usual_cents,
  endedOn: row.ended_on,
});

/**
 * Writes the expected paychecks that `schedules` make in month `ym`, on `from` or later. A payday
 * that already has a row keeps it. Runs inside the caller's transaction.
 */
export async function insertMonthPaychecks(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  ym: string,
  schedules: readonly Selectable<PaySchedulesTable>[],
  from?: string,
): Promise<void> {
  assertCanWrite(ctx);
  const expected = paychecksForMonth(schedules.map(templateOf), ym).filter(
    (p) => from === undefined || p.expectedDate >= from,
  );
  if (expected.length === 0) return;
  await trx
    .insertInto('paychecks')
    .values(
      expected.map((p) => ({
        household_id: ctx.householdId,
        schedule_id: p.scheduleId,
        expected_date: p.expectedDate,
        expected_cents: p.expectedCents,
        received_date: null,
        received_cents: null,
      })),
    )
    .onConflict((oc) => oc.columns(['schedule_id', 'expected_date']).doNothing())
    .execute();
}

/**
 * Makes the paychecks `schedule` expects in month `ym`, on `from` or later, match it: a payday it
 * no longer has goes, one it keeps takes the new amount, and a new one is added. None of those
 * days may have been received. Runs inside the caller's transaction.
 */
export async function replaceExpectedPaychecks(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  ym: string,
  schedule: Selectable<PaySchedulesTable>,
  from: string,
): Promise<void> {
  assertCanWrite(ctx);
  const dates = paychecksForMonth([templateOf(schedule)], ym).map((p) => p.expectedDate);
  const stored = await trx
    .selectFrom('paychecks')
    .select(['id', 'expected_date'])
    .where('household_id', '=', ctx.householdId)
    .where('schedule_id', '=', schedule.id)
    .where('expected_date', '>=', from > `${ym}-01` ? from : `${ym}-01`)
    .where('expected_date', '<', `${addMonths(ym, 1)}-01`)
    .where('received_cents', 'is', null)
    .execute();
  const gone = stored.filter((p) => !dates.includes(p.expected_date)).map((p) => p.id);
  const kept = stored.filter((p) => dates.includes(p.expected_date)).map((p) => p.id);
  if (gone.length > 0) {
    await trx
      .deleteFrom('paychecks')
      .where('household_id', '=', ctx.householdId)
      .where('id', 'in', gone)
      .execute();
  }
  if (kept.length > 0) {
    await trx
      .updateTable('paychecks')
      .set({ expected_cents: schedule.usual_cents })
      .where('household_id', '=', ctx.householdId)
      .where('id', 'in', kept)
      .execute();
  }
  await insertMonthPaychecks(trx, ctx, ym, [schedule], from);
}

export const paychecks = {
  /** The paychecks expected in month `ym`, by date. */
  async listForMonth(db: Database, ctx: HouseholdContext, ym: string): Promise<Paycheck[]> {
    assertYm(ym);
    return db
      .selectFrom('paychecks')
      .selectAll()
      .where('household_id', '=', ctx.householdId)
      .where('expected_date', '>=', `${ym}-01`)
      .where('expected_date', '<', `${addMonths(ym, 1)}-01`)
      .orderBy('expected_date')
      .orderBy('id')
      .execute();
  },

  /**
   * Takes back "received". A paycheck dated after its schedule stopped was only there because the
   * money had arrived, so it goes.
   */
  async unmarkReceived(db: Database, ctx: HouseholdContext, id: string): Promise<void> {
    assertCanWrite(ctx);
    await inTransaction(db, async (trx) => {
      await lockHouseholdMonths(trx, ctx);
      const paycheck = await trx
        .selectFrom('paychecks')
        .select(['schedule_id', 'expected_date'])
        .where('id', '=', id)
        .where('household_id', '=', ctx.householdId)
        .executeTakeFirst();
      if (paycheck === undefined) throw new NotFound('Paycheck not found');
      await assertMonthNotClosed(trx, ctx, paycheck.expected_date.slice(0, 7));
      const schedule = await trx
        .selectFrom('pay_schedules')
        .select('ended_on')
        .where('id', '=', paycheck.schedule_id)
        .where('household_id', '=', ctx.householdId)
        .executeTakeFirst();
      const endedOn = schedule?.ended_on ?? null;
      if (endedOn !== null && paycheck.expected_date > endedOn) {
        await trx
          .deleteFrom('paychecks')
          .where('id', '=', id)
          .where('household_id', '=', ctx.householdId)
          .execute();
        return;
      }
      await trx
        .updateTable('paychecks')
        .set({ received_cents: null, received_date: null })
        .where('id', '=', id)
        .where('household_id', '=', ctx.householdId)
        .execute();
    });
  },

  /** A schedule's received paychecks, the latest received first. */
  async listReceived(
    db: Database,
    ctx: HouseholdContext,
    scheduleId: string,
    limit: number,
  ): Promise<Paycheck[]> {
    return db
      .selectFrom('paychecks')
      .selectAll()
      .where('household_id', '=', ctx.householdId)
      .where('schedule_id', '=', scheduleId)
      .where('received_cents', 'is not', null)
      .orderBy('received_date', 'desc')
      .orderBy('expected_date', 'desc')
      .limit(limit)
      .execute();
  },

  /** Spec §5.9: the actual amount and date, which may be early. Marking again corrects it. */
  async markReceived(
    db: Database,
    ctx: HouseholdContext,
    id: string,
    received: { receivedCents: number; receivedDate: string },
  ): Promise<void> {
    assertCanWrite(ctx);
    assertCents(received.receivedCents);
    if (received.receivedCents <= 0) throw new InvalidInput('the amount must be more than zero');
    assertDate(received.receivedDate);
    await inTransaction(db, async (trx) => {
      // Stopping a schedule deletes paychecks, so the two take turns.
      await lockHouseholdMonths(trx, ctx);
      const paycheck = await trx
        .selectFrom('paychecks')
        .select('expected_date')
        .where('id', '=', id)
        .where('household_id', '=', ctx.householdId)
        .executeTakeFirst();
      if (paycheck === undefined) throw new NotFound('Paycheck not found');
      await assertMonthNotClosed(trx, ctx, paycheck.expected_date.slice(0, 7));
      await trx
        .updateTable('paychecks')
        .set({
          received_cents: received.receivedCents,
          received_date: received.receivedDate,
        })
        .where('id', '=', id)
        .where('household_id', '=', ctx.householdId)
        .execute();
    });
  },
};
