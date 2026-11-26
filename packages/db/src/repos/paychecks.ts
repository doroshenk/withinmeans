import {
  addMonths,
  paychecksForMonth,
  uncoveredPaydays,
  type ExpectedPaycheck,
  type PayScheduleTemplate,
} from '@withinmeans/domain';
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
  openYms,
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
  await insertExpected(trx, ctx, expected);
}

async function insertExpected(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  expected: readonly ExpectedPaycheck[],
): Promise<void> {
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
 * Makes the paychecks `schedule` expects in month `ym`, on `from` or later, match it: an unreceived
 * payday it no longer has goes, one it keeps takes the current amount, and a new one is added
 * unless a received paycheck already pays for it. Received ones stay as they are. Runs inside the
 * caller's transaction.
 */
export async function replaceExpectedPaychecks(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  ym: string,
  schedule: Selectable<PaySchedulesTable>,
  from: string,
): Promise<void> {
  assertCanWrite(ctx);
  const template = templateOf(schedule);
  const expected = paychecksForMonth([template], ym).filter((p) => p.expectedDate >= from);
  const dates = expected.map((p) => p.expectedDate);
  const rows = await trx
    .selectFrom('paychecks')
    .select(['id', 'expected_date', 'received_cents'])
    .where('household_id', '=', ctx.householdId)
    .where('schedule_id', '=', schedule.id)
    .execute();
  const inRange = rows.filter(
    (p) =>
      p.received_cents === null && p.expected_date >= from && p.expected_date.startsWith(`${ym}-`),
  );
  const gone = inRange.filter((p) => !dates.includes(p.expected_date)).map((p) => p.id);
  const kept = inRange.filter((p) => dates.includes(p.expected_date)).map((p) => p.id);
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
  const received = rows.filter((p) => p.received_cents !== null).map((p) => p.expected_date);
  const uncovered = uncoveredPaydays(template, dates, received);
  const added = expected.filter((p) => uncovered.includes(p.expectedDate));
  await insertExpected(trx, ctx, added);
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
   * Takes back "received". A running schedule's paychecks from `today` on are then made to match
   * it, so an edit made meanwhile applies; an earlier paycheck just becomes expected again. One
   * dated after its schedule stopped was only there because the money had arrived, so it goes.
   */
  async unmarkReceived(
    db: Database,
    ctx: HouseholdContext,
    id: string,
    today: string,
  ): Promise<void> {
    assertCanWrite(ctx);
    assertDate(today);
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
        .selectAll()
        .where('id', '=', paycheck.schedule_id)
        .where('household_id', '=', ctx.householdId)
        .executeTakeFirstOrThrow();
      if (schedule.ended_on !== null && paycheck.expected_date > schedule.ended_on) {
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
      if (schedule.ended_on !== null) return;
      for (const ym of await openYms(trx, ctx)) {
        await replaceExpectedPaychecks(trx, ctx, ym, schedule, today);
      }
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
