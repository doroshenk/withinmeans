import type { Transaction } from 'kysely';
import { assertCanWrite, type HouseholdContext } from '../context.js';
import type { Database, DB } from '../db.js';
import { insertMonthBills, lockHouseholdBills } from './monthBills.js';
import type { Month } from './months.js';
import { insertMonthPaychecks } from './paychecks.js';
import { assertYm, inTransaction } from './shared.js';

/**
 * Inserts the Month row, its bills and its expected paychecks, or finds the month that is already
 * there and adds nothing (so a bill later taken out of it stays out). Runs inside the caller's
 * transaction. A later ticket adds the carry-ins here, so they open together.
 */
export async function openMonthIn(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  ym: string,
  startedAt: Date,
): Promise<{ month: Month; created: boolean }> {
  assertCanWrite(ctx);
  assertYm(ym);
  await lockHouseholdBills(trx, ctx);
  const inserted = await trx
    .insertInto('months')
    .values({ household_id: ctx.householdId, ym, started_at: startedAt, closed_at: null })
    .onConflict((oc) => oc.columns(['household_id', 'ym']).doNothing())
    .returningAll()
    .executeTakeFirst();
  if (inserted !== undefined) {
    const recurring = await trx
      .selectFrom('recurring_bills')
      .selectAll()
      .where('household_id', '=', ctx.householdId)
      .execute();
    await insertMonthBills(trx, ctx, ym, recurring);
    const schedules = await trx
      .selectFrom('pay_schedules')
      .selectAll()
      .where('household_id', '=', ctx.householdId)
      .execute();
    await insertMonthPaychecks(trx, ctx, ym, schedules);
    return { month: inserted, created: true };
  }
  const month = await trx
    .selectFrom('months')
    .selectAll()
    .where('household_id', '=', ctx.householdId)
    .where('ym', '=', ym)
    .executeTakeFirstOrThrow();
  return { month, created: false };
}

/** Spec §5.11: the one operation that opens a month. Idempotent; one transaction. */
export async function openMonth(
  db: Database,
  ctx: HouseholdContext,
  ym: string,
  startedAt: Date,
): Promise<{ month: Month; created: boolean }> {
  assertCanWrite(ctx);
  assertYm(ym);
  return inTransaction(db, (trx) => openMonthIn(trx, ctx, ym, startedAt));
}
