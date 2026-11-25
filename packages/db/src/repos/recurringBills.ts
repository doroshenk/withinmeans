import { dueDateIn, lastKeptMonth } from '@withinmeans/domain';
import type { Selectable, Transaction } from 'kysely';
import { assertCanWrite, InvalidInput, NotFound, type HouseholdContext } from '../context.js';
import type { Database, DB, RecurringBillsTable } from '../db.js';
import { insertMonthBills, lockHouseholdBills } from './monthBills.js';
import { assertCents, assertYm, cleanName, inTransaction } from './shared.js';

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

/** The household's row for this bill, or NotFound. */
async function mine(db: Database, ctx: HouseholdContext, id: string): Promise<RecurringBill> {
  const bill = await db
    .selectFrom('recurring_bills')
    .selectAll()
    .where('id', '=', id)
    .where('household_id', '=', ctx.householdId)
    .executeTakeFirst();
  if (bill === undefined) throw new NotFound('Recurring bill not found');
  return bill;
}

async function setEndYm(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  id: string,
  endYm: string | null,
): Promise<void> {
  await trx
    .updateTable('recurring_bills')
    .set({ end_ym: endYm })
    .where('id', '=', id)
    .where('household_id', '=', ctx.householdId)
    .execute();
}

/**
 * Deletes the bill's rows in open months from `from` (inclusive or not) that are unpaid and have
 * no actual amount: nothing a person recorded is ever lost.
 */
async function deleteUntouched(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  id: string,
  from: { op: '>' | '>='; ym: string },
): Promise<void> {
  await trx
    .deleteFrom('bills')
    .where('household_id', '=', ctx.householdId)
    .where('recurring_bill_id', '=', id)
    .where('ym', from.op, from.ym)
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
}

const openMonthsFrom = async (
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  fromYm: string,
): Promise<string[]> => {
  const rows = await trx
    .selectFrom('months')
    .select('ym')
    .where('household_id', '=', ctx.householdId)
    .where('status', '=', 'open')
    .where('ym', '>=', fromYm)
    .execute();
  return rows.map((r) => r.ym);
};

/**
 * Carries an edit into the bill's unpaid rows (no actual amount) in open months from `fromYm`. Only
 * what changed on the recurring bill is written, so other values on a month's bill stay.
 */
async function updateMonthBills(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  before: RecurringBill,
  after: RecurringBill,
  fromYm: string,
): Promise<void> {
  const changed = (key: 'name' | 'estimate_cents' | 'due_day' | 'category_id') =>
    before[key] !== after[key];
  if (!(['name', 'estimate_cents', 'due_day', 'category_id'] as const).some(changed)) return;
  for (const ym of await openMonthsFrom(trx, ctx, fromYm)) {
    await trx
      .updateTable('bills')
      .set({
        ...(changed('name') && { name: after.name }),
        ...(changed('estimate_cents') && { estimate_cents: after.estimate_cents }),
        ...(changed('due_day') && { due_date: dueDateIn(ym, after.due_day) }),
        ...(changed('category_id') && { category_id: after.category_id }),
      })
      .where('household_id', '=', ctx.householdId)
      .where('recurring_bill_id', '=', after.id)
      .where('ym', '=', ym)
      .where('paid_at', 'is', null)
      .where('actual_cents', 'is', null)
      .execute();
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

  /** Changes the bill; with `fromYm`, its unpaid rows from that month on change with it. */
  async update(
    db: Database,
    ctx: HouseholdContext,
    id: string,
    patch: Patch,
    options: { fromYm?: string } = {},
  ): Promise<void> {
    assertCanWrite(ctx);
    if (patch.estimateCents !== undefined) assertCents(patch.estimateCents);
    if (patch.dueDay !== undefined) assertDueDay(patch.dueDay);
    const { fromYm } = options;
    if (fromYm !== undefined) assertYm(fromYm, 'current month');
    await assertRefs(db, ctx, patch);
    await inTransaction(db, async (trx) => {
      await lockHouseholdBills(trx, ctx);
      const before = await mine(trx, ctx, id);
      const after = await trx
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
        .returningAll()
        .executeTakeFirstOrThrow();
      if (fromYm !== undefined) await updateMonthBills(trx, ctx, before, after, fromYm);
    });
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
      await mine(trx, ctx, id);
      await deleteUntouched(trx, ctx, id, { op: '>=', ym: currentYm });
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
        await setEndYm(trx, ctx, id, last.ym);
      }
    });
  },

  /**
   * Spec §6.3 "End": months started from now on get no bill, and the bills already made up to this
   * month stay. An unpaid bill in a month started ahead is taken out. Ending twice changes nothing.
   */
  async stop(db: Database, ctx: HouseholdContext, id: string, currentYm: string): Promise<void> {
    assertCanWrite(ctx);
    assertYm(currentYm, 'current month');
    await inTransaction(db, async (trx) => {
      await lockHouseholdBills(trx, ctx);
      if ((await mine(trx, ctx, id)).end_ym !== null) return;
      const started = await trx
        .selectFrom('months')
        .select('ym')
        .where('household_id', '=', ctx.householdId)
        .execute();
      const endYm = lastKeptMonth(
        started.map((m) => m.ym),
        currentYm,
      );
      await deleteUntouched(trx, ctx, id, { op: '>', ym: endYm });
      await setEndYm(trx, ctx, id, endYm);
    });
  },

  /**
   * Brings an ended bill back: it loses its end, and open months from `currentYm` that have no row
   * for it get one. Months that passed while it was ended stay without it.
   */
  async restart(db: Database, ctx: HouseholdContext, id: string, currentYm: string): Promise<void> {
    assertCanWrite(ctx);
    assertYm(currentYm, 'current month');
    await inTransaction(db, async (trx) => {
      await lockHouseholdBills(trx, ctx);
      const bill = await mine(trx, ctx, id);
      if (bill.end_ym === null) return;
      await setEndYm(trx, ctx, id, null);
      const rows = await trx
        .selectFrom('bills')
        .select('ym')
        .where('household_id', '=', ctx.householdId)
        .where('recurring_bill_id', '=', id)
        .execute();
      const has = new Set(rows.map((r) => r.ym));
      for (const ym of await openMonthsFrom(trx, ctx, currentYm)) {
        if (!has.has(ym)) await insertMonthBills(trx, ctx, ym, [{ ...bill, end_ym: null }]);
      }
    });
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
