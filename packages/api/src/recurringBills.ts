import { categories, recurringBills } from '@withinmeans/db';
import { monthOf, today, type RecurringBillItem } from '@withinmeans/domain';
import { translated } from './errors.js';
import { myHousehold, type BillsContext } from './setupBills.js';

export interface RecurringBillsView {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  bills: RecurringBillItem[];
  /** Categories that any bill, past ones too, uses. */
  usedCategoryIds: string[];
  /** Monthly take-home pay; null until pay schedules exist. */
  takeHomeCents: number | null;
}

async function todayOf(ctx: BillsContext) {
  return today(ctx.clock, (await myHousehold(ctx)).timezone);
}

/** Spec §6.3: every recurring bill, ended ones too. */
export async function listRecurringBills(ctx: BillsContext): Promise<RecurringBillsView> {
  const [date, rows, usedCategoryIds] = await Promise.all([
    todayOf(ctx),
    recurringBills.list(ctx.db, ctx.household),
    categories.usedIds(ctx.db, ctx.household),
  ]);
  return {
    today: date.toString(),
    bills: rows.map((b) => ({
      id: b.id,
      name: b.name,
      estimateCents: Number(b.estimate_cents),
      dueDay: b.due_day,
      categoryId: b.category_id,
      autopay: b.autopay,
      startYm: b.start_ym,
      endYm: b.end_ym,
    })),
    usedCategoryIds,
    takeHomeCents: null,
  };
}

/** Saves the bill; this month's unpaid bill, and later ones, change with it. */
export const updateRecurringBill = (
  ctx: BillsContext,
  input: {
    id: string;
    name: string;
    estimateCents: number;
    dueDay: number;
    categoryId: string;
    autopay: boolean;
  },
) =>
  translated(async () => {
    const { id, ...patch } = input;
    const fromYm = monthOf(await todayOf(ctx));
    await recurringBills.update(ctx.db, ctx.household, id, patch, { fromYm });
  });

/** Spec §6.3: ending keeps the bill's history. */
export const endRecurringBill = (ctx: BillsContext, input: { id: string }) =>
  translated(async () => {
    const currentYm = monthOf(await todayOf(ctx));
    await recurringBills.stop(ctx.db, ctx.household, input.id, currentYm);
  });

export const restartRecurringBill = (ctx: BillsContext, input: { id: string }) =>
  translated(async () => {
    const currentYm = monthOf(await todayOf(ctx));
    await recurringBills.restart(ctx.db, ctx.household, input.id, currentYm);
  });
