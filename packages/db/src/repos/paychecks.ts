import { addMonths, paychecksForMonth, type PayScheduleTemplate } from '@withinmeans/domain';
import type { Selectable, Transaction } from 'kysely';
import {
  assertCanWrite,
  Conflict,
  InvalidInput,
  NotFound,
  type HouseholdContext,
} from '../context.js';
import type { Database, DB, PaychecksTable, PaySchedulesTable } from '../db.js';
import { lockHouseholdMonths } from './monthBills.js';
import { assertCents, assertDate, assertYm, inTransaction } from './shared.js';

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
      const month = await trx
        .selectFrom('months')
        .select('status')
        .where('household_id', '=', ctx.householdId)
        .where('ym', '=', paycheck.expected_date.slice(0, 7))
        // So that closing the month at the same moment can't slip past this check.
        .forUpdate()
        .executeTakeFirst();
      if (month?.status === 'closed') throw new Conflict('That month is closed');
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
