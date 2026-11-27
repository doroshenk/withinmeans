import { daysInMonth, MAX_BILL_CENTS } from '@withinmeans/domain';
import type { Selectable, Transaction } from 'kysely';
import { assertCanWrite, InvalidInput, NotFound, type HouseholdContext } from '../context.js';
import type { BillsTable, Database, DB } from '../db.js';
import {
  assertCents,
  assertDate,
  assertMonthNotClosed,
  assertYm,
  cleanName,
  inTransaction,
  mustHaveChanged,
} from './shared.js';

export type Bill = Selectable<BillsTable>;

/** A month's bill, with its recurring bill's autopay (false for a one-time bill). */
export type ListedBill = Bill & { autopay: boolean };

export interface BillChange {
  name: string;
  amountCents: number;
  /** 'YYYY-MM-DD' */
  dueDate: string;
  categoryId: string;
}

export type NewBill = BillChange & { paid: boolean };

/** The change as it is stored: a trimmed name, whole cents of $0 or more and a real date. */
function checked(change: BillChange): BillChange {
  const name = cleanName(change.name);
  assertCents(change.amountCents);
  if (change.amountCents < 0) throw new InvalidInput('the amount cannot be negative');
  if (change.amountCents > MAX_BILL_CENTS) throw new InvalidInput('the amount is too big');
  assertDate(change.dueDate);
  if (Number(change.dueDate.slice(8)) > daysInMonth(change.dueDate.slice(0, 7))) {
    throw new InvalidInput('that date does not exist');
  }
  return { ...change, name };
}

/** Another household's category looks missing. Locked, so deleting it at the same time conflicts. */
async function assertCategory(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  categoryId: string,
): Promise<void> {
  const found = await trx
    .selectFrom('categories')
    .select('id')
    .where('id', '=', categoryId)
    .where('household_id', '=', ctx.householdId)
    .forUpdate()
    .executeTakeFirst();
  if (found === undefined) throw new NotFound('Category not found');
}

/** The household's bill, locked, in a month that can still change. */
async function changeable(trx: Transaction<DB>, ctx: HouseholdContext, id: string): Promise<Bill> {
  const bill = await trx
    .selectFrom('bills')
    .selectAll()
    .where('id', '=', id)
    .where('household_id', '=', ctx.householdId)
    .forUpdate()
    .executeTakeFirst();
  if (bill === undefined) throw new NotFound('Bill not found');
  await assertMonthNotClosed(trx, ctx, bill.ym);
  return bill;
}

async function write(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  id: string,
  values: Partial<
    Pick<Bill, 'name' | 'category_id' | 'due_date' | 'estimate_cents' | 'actual_cents' | 'paid_at'>
  >,
): Promise<void> {
  const result = await trx
    .updateTable('bills')
    .set(values)
    .where('id', '=', id)
    .where('household_id', '=', ctx.householdId)
    .executeTakeFirst();
  mustHaveChanged(result.numUpdatedRows, 'Bill');
}

export const bills = {
  /** The month's bills by due date. */
  async listForMonth(db: Database, ctx: HouseholdContext, ym: string): Promise<ListedBill[]> {
    assertYm(ym);
    const rows = await db
      .selectFrom('bills')
      .leftJoin('recurring_bills', (join) =>
        join
          .onRef('recurring_bills.id', '=', 'bills.recurring_bill_id')
          .on('recurring_bills.household_id', '=', ctx.householdId),
      )
      .selectAll('bills')
      .select('recurring_bills.autopay')
      .where('bills.household_id', '=', ctx.householdId)
      .where('bills.ym', '=', ym)
      .orderBy('bills.due_date')
      .orderBy('bills.name')
      .orderBy('bills.id')
      .execute();
    return rows.map((row) => ({ ...row, autopay: row.autopay ?? false }));
  },

  /** Adds a one-time bill to the month of its date. */
  async create(
    db: Database,
    ctx: HouseholdContext,
    input: NewBill,
    now: Date = new Date(),
  ): Promise<Bill> {
    assertCanWrite(ctx);
    const { name, amountCents, dueDate, categoryId } = checked(input);
    if (amountCents === 0) throw new InvalidInput('the amount must be more than zero');
    const ym = dueDate.slice(0, 7);
    return inTransaction(db, async (trx) => {
      await assertCategory(trx, ctx, categoryId);
      await assertMonthNotClosed(trx, ctx, ym);
      return trx
        .insertInto('bills')
        .values({
          household_id: ctx.householdId,
          ym,
          recurring_bill_id: null,
          name,
          category_id: categoryId,
          due_date: dueDate,
          estimate_cents: amountCents,
          actual_cents: input.paid ? amountCents : null,
          paid_at: input.paid ? now : null,
          kind: 'one_time',
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  /**
   * Changes one month's bill, which stays in its month. On a recurring bill the amount is this
   * month's actual one (none, if it is unpaid and equals the estimate); on a one-time bill it is
   * the bill's amount.
   */
  async update(db: Database, ctx: HouseholdContext, id: string, change: BillChange): Promise<void> {
    assertCanWrite(ctx);
    const { name, amountCents, dueDate, categoryId } = checked(change);
    await inTransaction(db, async (trx) => {
      const bill = await changeable(trx, ctx, id);
      if (!dueDate.startsWith(`${bill.ym}-`)) {
        throw new InvalidInput('the date must stay in the bill’s month');
      }
      await assertCategory(trx, ctx, categoryId);
      const paid = bill.paid_at !== null;
      const oneTime = bill.kind === 'one_time';
      // Only a recurring bill can come to $0 in a month.
      if (oneTime && amountCents === 0) {
        throw new InvalidInput('the amount must be more than zero');
      }
      const keepsActual = paid || (!oneTime && amountCents !== bill.estimate_cents);
      await write(trx, ctx, id, {
        name,
        category_id: categoryId,
        due_date: dueDate,
        ...(oneTime && { estimate_cents: amountCents }),
        actual_cents: keepsActual ? amountCents : null,
      });
    });
  },

  /**
   * Paid: records the time, and the estimate as the actual amount if there is none. Unpaid: an
   * actual amount equal to the estimate is cleared, so that later estimate changes reach the bill.
   */
  async setPaid(
    db: Database,
    ctx: HouseholdContext,
    id: string,
    paid: boolean,
    at: Date,
  ): Promise<void> {
    assertCanWrite(ctx);
    await inTransaction(db, async (trx) => {
      const bill = await changeable(trx, ctx, id);
      const unpaidActual = bill.actual_cents === bill.estimate_cents ? null : bill.actual_cents;
      await write(trx, ctx, id, {
        actual_cents: paid ? (bill.actual_cents ?? bill.estimate_cents) : unpaidActual,
        paid_at: paid ? (bill.paid_at ?? at) : null,
      });
    });
  },

  /** Takes the bill out of its month; opening the month again does not bring it back. */
  async remove(db: Database, ctx: HouseholdContext, id: string): Promise<void> {
    assertCanWrite(ctx);
    await inTransaction(db, async (trx) => {
      await changeable(trx, ctx, id);
      await trx
        .deleteFrom('bills')
        .where('id', '=', id)
        .where('household_id', '=', ctx.householdId)
        .execute();
    });
  },
};
