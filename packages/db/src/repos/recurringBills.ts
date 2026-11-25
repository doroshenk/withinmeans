import type { Selectable } from 'kysely';
import { assertCanWrite, InvalidInput, NotFound, type HouseholdContext } from '../context.js';
import type { Database, RecurringBillsTable } from '../db.js';
import { insertMonthBills, lockHouseholdBills } from './monthBills.js';
import { assertCents, assertYm, cleanName, inTransaction, mustHaveChanged } from './shared.js';

export type RecurringBill = Selectable<RecurringBillsTable>;

export interface NewRecurringBill {
  name: string;
  estimateCents: number;
  dueDay: number;
  categoryId: string;
  autopay: boolean;
  accountId?: string;
  startYm: string;
  endYm?: string;
}

type Patch = Partial<Omit<NewRecurringBill, 'startYm' | 'endYm' | 'accountId'>> & {
  accountId?: string | null;
};

function assertDueDay(day: number): void {
  if (!Number.isInteger(day) || day < 1 || day > 28) {
    throw new InvalidInput('due day must be a whole number from 1 to 28');
  }
}

/** Rejects ids that are not in the caller's household (another household's ids look missing). */
async function assertRefs(
  db: Database,
  ctx: HouseholdContext,
  refs: { categoryId?: string | undefined; accountId?: string | null | undefined },
): Promise<void> {
  if (refs.categoryId !== undefined) {
    const found = await db
      .selectFrom('categories')
      .select('id')
      .where('id', '=', refs.categoryId)
      .where('household_id', '=', ctx.householdId)
      .executeTakeFirst();
    if (found === undefined) throw new NotFound('Category not found');
  }
  if (refs.accountId !== undefined && refs.accountId !== null) {
    const found = await db
      .selectFrom('accounts')
      .select('id')
      .where('id', '=', refs.accountId)
      .where('household_id', '=', ctx.householdId)
      .executeTakeFirst();
    if (found === undefined) throw new NotFound('Account not found');
  }
}

export const recurringBills = {
  async list(db: Database, ctx: HouseholdContext): Promise<RecurringBill[]> {
    return db
      .selectFrom('recurring_bills')
      .selectAll()
      .where('household_id', '=', ctx.householdId)
      .orderBy('due_day')
      .orderBy('name')
      .orderBy('id')
      .execute();
  },

  /** Adds the bill, and its Bill row to every open month it is active in. */
  async create(
    db: Database,
    ctx: HouseholdContext,
    input: NewRecurringBill,
  ): Promise<RecurringBill> {
    assertCanWrite(ctx);
    const name = cleanName(input.name);
    assertCents(input.estimateCents);
    assertDueDay(input.dueDay);
    assertYm(input.startYm, 'start month');
    if (input.endYm !== undefined) {
      assertYm(input.endYm, 'end month');
      if (input.endYm < input.startYm) throw new InvalidInput('end month is before start month');
    }
    await assertRefs(db, ctx, input);
    return inTransaction(db, async (trx) => {
      await lockHouseholdBills(trx, ctx);
      const created = await trx
        .insertInto('recurring_bills')
        .values({
          household_id: ctx.householdId,
          name,
          estimate_cents: input.estimateCents,
          due_day: input.dueDay,
          category_id: input.categoryId,
          autopay: input.autopay,
          account_id: input.accountId ?? null,
          start_ym: input.startYm,
          end_ym: input.endYm ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const open = await trx
        .selectFrom('months')
        .select('ym')
        .where('household_id', '=', ctx.householdId)
        .where('status', '=', 'open')
        .execute();
      for (const { ym } of open) await insertMonthBills(trx, ctx, ym, [created]);
      return created;
    });
  },

  async update(
    db: Database,
    ctx: HouseholdContext,
    id: string,
    patch: Patch,
    _options: { fromYm?: string } = {},
  ): Promise<void> {
    assertCanWrite(ctx);
    if (patch.estimateCents !== undefined) assertCents(patch.estimateCents);
    if (patch.dueDay !== undefined) assertDueDay(patch.dueDay);
    await assertRefs(db, ctx, patch);
    const result = await db
      .updateTable('recurring_bills')
      .set({
        ...(patch.name !== undefined && { name: cleanName(patch.name) }),
        ...(patch.estimateCents !== undefined && { estimate_cents: patch.estimateCents }),
        ...(patch.dueDay !== undefined && { due_day: patch.dueDay }),
        ...(patch.categoryId !== undefined && { category_id: patch.categoryId }),
        ...(patch.autopay !== undefined && { autopay: patch.autopay }),
        ...(patch.accountId !== undefined && { account_id: patch.accountId }),
      })
      .where('id', '=', id)
      .where('household_id', '=', ctx.householdId)
      .executeTakeFirst();
    mustHaveChanged(result.numUpdatedRows, 'Recurring bill');
  },

  /**
   * Takes the bill away from `currentYm` on: deletes its Bill rows in open months from then that
   * are unpaid and have no actual amount. If any rows remain (past or closed months, or money
   * already recorded), the bill is ended at the last of them so that history keeps it; otherwise
   * it is deleted.
   */
  async remove(db: Database, ctx: HouseholdContext, id: string, currentYm: string): Promise<void> {
    assertCanWrite(ctx);
    assertYm(currentYm, 'current month');
    await inTransaction(db, async (trx) => {
      await lockHouseholdBills(trx, ctx);
      const bill = await trx
        .selectFrom('recurring_bills')
        .select('id')
        .where('id', '=', id)
        .where('household_id', '=', ctx.householdId)
        .executeTakeFirst();
      if (bill === undefined) throw new NotFound('Recurring bill not found');
      await trx
        .deleteFrom('bills')
        .where('household_id', '=', ctx.householdId)
        .where('recurring_bill_id', '=', id)
        .where('ym', '>=', currentYm)
        .where('paid_at', 'is', null)
        .where('actual_cents', 'is', null)
        .where('ym', 'in', (eb) =>
          eb
            .selectFrom('months')
            .select('months.ym')
            .where('months.household_id', '=', ctx.householdId)
            .where('months.status', '=', 'open'),
        )
        .execute();
      const last = await trx
        .selectFrom('bills')
        .select('ym')
        .where('household_id', '=', ctx.householdId)
        .where('recurring_bill_id', '=', id)
        .orderBy('ym', 'desc')
        .limit(1)
        .executeTakeFirst();
      if (last === undefined) {
        await trx
          .deleteFrom('recurring_bills')
          .where('id', '=', id)
          .where('household_id', '=', ctx.householdId)
          .execute();
      } else {
        await trx
          .updateTable('recurring_bills')
          .set({ end_ym: last.ym })
          .where('id', '=', id)
          .where('household_id', '=', ctx.householdId)
          .execute();
      }
    });
  },

  /** Spec §6.3 "End": months started from now on get no bill; bills already made stay. */
  async stop(
    _db: Database,
    _ctx: HouseholdContext,
    _id: string,
    _currentYm: string,
  ): Promise<void> {
    throw new Error('not implemented');
  },

  /** Brings an ended bill back, from `currentYm` on. */
  async restart(
    _db: Database,
    _ctx: HouseholdContext,
    _id: string,
    _currentYm: string,
  ): Promise<void> {
    throw new Error('not implemented');
  },

  /** Ends the bill from `endYm`; past months keep their rows. */
  async end(db: Database, ctx: HouseholdContext, id: string, endYm: string): Promise<void> {
    assertCanWrite(ctx);
    assertYm(endYm, 'end month');
    const bill = await db
      .selectFrom('recurring_bills')
      .select('start_ym')
      .where('id', '=', id)
      .where('household_id', '=', ctx.householdId)
      .executeTakeFirst();
    if (bill === undefined) throw new NotFound('Recurring bill not found');
    if (endYm < bill.start_ym) throw new InvalidInput('end month is before start month');
    await db
      .updateTable('recurring_bills')
      .set({ end_ym: endYm })
      .where('id', '=', id)
      .where('household_id', '=', ctx.householdId)
      .execute();
  },
};
