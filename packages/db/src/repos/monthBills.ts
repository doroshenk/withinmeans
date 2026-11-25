import { billsForMonth, type RecurringBillTemplate } from '@withinmeans/domain';
import type { Selectable, Transaction } from 'kysely';
import { assertCanWrite, type HouseholdContext } from '../context.js';
import type { DB, RecurringBillsTable } from '../db.js';

const templateOf = (row: Selectable<RecurringBillsTable>): RecurringBillTemplate => ({
  id: row.id,
  name: row.name,
  estimateCents: row.estimate_cents,
  dueDay: row.due_day,
  categoryId: row.category_id,
  startYm: row.start_ym,
  endYm: row.end_ym,
});

/**
 * Months, recurring bills and pay schedules change each other's Bill and Paycheck rows but write
 * different rows, so two transactions could both commit without seeing each other. Each takes this lock first: Postgres
 * makes the second one wait, and DSQL fails one at commit so that it is retried.
 */
export async function lockHouseholdBills(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
): Promise<void> {
  await trx
    .selectFrom('households')
    .select('id')
    .where('id', '=', ctx.householdId)
    .forUpdate()
    .execute();
}

/**
 * Writes the unpaid Bill rows that `recurring` makes in month `ym`. Runs inside the caller's
 * transaction; the caller makes sure the month has no row for these bills yet.
 */
export async function insertMonthBills(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  ym: string,
  recurring: readonly Selectable<RecurringBillsTable>[],
): Promise<void> {
  assertCanWrite(ctx);
  const bills = billsForMonth(recurring.map(templateOf), ym);
  if (bills.length === 0) return;
  await trx
    .insertInto('bills')
    .values(
      bills.map((b) => ({
        household_id: ctx.householdId,
        ym,
        recurring_bill_id: b.recurringBillId,
        name: b.name,
        category_id: b.categoryId,
        due_date: b.dueDate,
        estimate_cents: b.estimateCents,
        actual_cents: null,
        paid_at: null,
        kind: 'recurring' as const,
      })),
    )
    .execute();
}
