import { categories, households, recurringBills } from '@withinmeans/db';
import { monthlyBillsTotal, monthOf, today } from '@withinmeans/domain';
import { translated } from './errors.js';
import type { MemberContext } from './invitePartner.js';

type Ctx = Pick<MemberContext, 'db' | 'household' | 'clock'>;

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

async function mine(ctx: Ctx) {
  const household = await households.getMine(ctx.db, ctx.household);
  if (household === undefined) throw new Error('Household not found');
  return household;
}

/** Spec §3 step 5: active recurring bills (by due day), their total, and take-home for the share. */
export async function listSetupBills(ctx: Ctx): Promise<SetupBillsView> {
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

/** Spec §3 step 5: the bill starts in the household's first month. */
export const addSetupBill = (
  ctx: Ctx,
  input: {
    name: string;
    estimateCents: number;
    dueDay: number;
    categoryId: string;
    autopay: boolean;
  },
) =>
  translated(async () => {
    const household = await mine(ctx);
    const row = await recurringBills.create(ctx.db, ctx.household, {
      ...input,
      startYm: household.first_month,
    });
    return { id: row.id };
  });

/** Takes the bill out of this month and later ones; earlier months keep it. */
export const removeSetupBill = (ctx: Ctx, input: { id: string }) =>
  translated(async () => {
    const household = await mine(ctx);
    const currentYm = monthOf(today(ctx.clock, household.timezone));
    await recurringBills.remove(ctx.db, ctx.household, input.id, currentYm);
  });
