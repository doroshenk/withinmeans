import { billsForMonth, type RecurringBillTemplate } from '@withinmeans/domain';
import type { Selectable, Transaction } from 'kysely';
import type { HouseholdContext } from '../context.js';
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
 * Writes the unpaid Bill rows that `recurring` makes in month `ym`. Runs inside the caller's
 * transaction; the caller has checked the role and that the month is new to these bills.
 */
export async function insertMonthBills(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  ym: string,
  recurring: readonly Selectable<RecurringBillsTable>[],
): Promise<void> {
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
