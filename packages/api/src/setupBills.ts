import { categories, households, months, recurringBills } from '@withinmeans/db';
import { monthlyBillsTotal, monthOf, newBillStartMonth, today } from '@withinmeans/domain';
import { translated } from './errors.js';
import type { MemberContext } from './invitePartner.js';

export type BillsContext = Pick<MemberContext, 'db' | 'household' | 'clock'>;

export interface SetupBillView {
  id: string;
  name: string;
  estimateCents: number;
  dueDay: number;
  categoryId: string;
  categoryName: string;
  autopay: boolean;
}

export interface SetupBillsView {
  bills: SetupBillView[];
  totalCents: number;
  /** Monthly take-home pay; null until pay schedules exist (setup step 3). */
  takeHomeCents: number | null;
}

export async function myHousehold(ctx: BillsContext) {
  const household = await households.getMine(ctx.db, ctx.household);
  if (household === undefined) throw new Error('Household not found');
  return household;
}

/** Spec §3 step 5: active recurring bills (by due day), their total, and take-home for the share. */
export async function listSetupBills(ctx: BillsContext): Promise<SetupBillsView> {
  const [rows, cats] = await Promise.all([
    recurringBills.list(ctx.db, ctx.household),
    categories.list(ctx.db, ctx.household, { includeArchived: true }),
  ]);
  const names = new Map(cats.map((c) => [c.id, c.name]));
  const bills = rows
    .filter((b) => b.end_ym === null)
    .map((b) => ({
      id: b.id,
      name: b.name,
      estimateCents: Number(b.estimate_cents),
      dueDay: b.due_day,
      categoryId: b.category_id,
      categoryName: names.get(b.category_id) ?? '',
      autopay: b.autopay,
    }));
  return {
    bills,
    totalCents: monthlyBillsTotal(bills.map((b) => b.estimateCents)),
    takeHomeCents: null,
  };
}

/**
 * Spec §3 step 5 and §6.3: the bill starts this month, or in the first month if that is later or is
 * still the only month started.
 */
export const addSetupBill = (
  ctx: BillsContext,
  input: {
    name: string;
    estimateCents: number;
    dueDay: number;
    categoryId: string;
    autopay: boolean;
  },
) =>
  translated(async () => {
    const household = await myHousehold(ctx);
    const currentYm = monthOf(today(ctx.clock, household.timezone));
    const started = await months.list(ctx.db, ctx.household);
    const onlyFirst = started.length > 0 && started.every((m) => m.ym === household.first_month);
    const row = await recurringBills.create(ctx.db, ctx.household, {
      ...input,
      startYm: newBillStartMonth(household.first_month, currentYm, onlyFirst),
    });
    return { id: row.id };
  });

/** Takes the bill out of this month and later ones; earlier months keep it. */
export const removeSetupBill = (ctx: BillsContext, input: { id: string }) =>
  translated(async () => {
    const household = await myHousehold(ctx);
    const currentYm = monthOf(today(ctx.clock, household.timezone));
    await recurringBills.remove(ctx.db, ctx.household, input.id, currentYm);
  });
