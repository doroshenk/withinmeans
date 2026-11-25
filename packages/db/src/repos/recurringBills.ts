import type { Selectable } from 'kysely';
import { assertCanWrite, InvalidInput, NotFound, type HouseholdContext } from '../context.js';
import type { Database, RecurringBillsTable } from '../db.js';
import { assertCents, assertYm, cleanName, mustHaveChanged } from './shared.js';

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
    return db
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
  },

  async update(db: Database, ctx: HouseholdContext, id: string, patch: Patch): Promise<void> {
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
   * Drops a bill for good. Safe only while there is no `bills` table: step 1 has usually opened the
   * first month, but no month holds bill rows yet. P2-01 must change this to end a bill that has
   * rows (past months keep their history), and create rows in the already-open first month.
   */
  async remove(db: Database, ctx: HouseholdContext, id: string): Promise<void> {
    assertCanWrite(ctx);
    const result = await db
      .deleteFrom('recurring_bills')
      .where('id', '=', id)
      .where('household_id', '=', ctx.householdId)
      .executeTakeFirst();
    mustHaveChanged(result.numDeletedRows, 'Recurring bill');
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
