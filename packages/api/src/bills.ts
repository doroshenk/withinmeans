import { bills, categories, months, openMonth, otherIncome, recurringBills } from '@withinmeans/db';
import {
  canOpenMonth,
  monthBillPreview,
  today,
  type addBillInput,
  type BillKind,
  type CardRow,
  type openMonthInput,
  type OtherIncomeType,
  type setBillPaidInput,
  type updateBillInput,
} from '@withinmeans/domain';
import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import { monthCards } from './creditCards.js';
import { translated } from './errors.js';
import type { MemberContext } from './invitePartner.js';
import { pagePaychecks, type PagePaycheck } from './paychecks.js';
import { myHousehold } from './setupBills.js';

type Ctx = Pick<MemberContext, 'db' | 'household' | 'clock'>;

export interface BillView {
  /** Null in a preview of a month not started. */
  id: string | null;
  name: string;
  categoryId: string;
  /** "YYYY-MM-DD" */
  dueDate: string;
  estimateCents: number;
  actualCents: number | null;
  paid: boolean;
  kind: BillKind;
  autopay: boolean;
}

export interface BillsPageView {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  /** The month shown. */
  ym: string;
  status: 'open' | 'closed' | 'not-started';
  /** True when "Open {month}" applies to the month. */
  canOpen: boolean;
  bills: BillView[];
  categories: { id: string; name: string; colorIndex: number }[];
  paychecks: PagePaycheck[];
  otherIncome: { id: string; type: OtherIncomeType; amountCents: number }[];
  /** Spec §5.10: each card's row for the month. */
  cards: CardRow[];
}

/** The household's first month and its date today. */
async function householdNow(ctx: Ctx) {
  const household = await myHousehold(ctx);
  return {
    firstMonth: household.first_month,
    today: today(ctx.clock, household.timezone).toString(),
  };
}

const now = (ctx: Ctx) => new Date(ctx.clock.now().epochMilliseconds);

const storedBills = async (ctx: Ctx, ym: string): Promise<BillView[]> =>
  (await bills.listForMonth(ctx.db, ctx.household, ym)).map((b) => ({
    id: b.id,
    name: b.name,
    categoryId: b.category_id,
    dueDate: b.due_date,
    // A bill with no estimate shows its actual amount.
    estimateCents: Number(b.estimate_cents ?? b.actual_cents),
    actualCents: b.actual_cents === null ? null : Number(b.actual_cents),
    paid: b.paid_at !== null,
    kind: b.kind,
    autopay: b.autopay,
  }));

/** The recurring bills a month not started will get. */
async function previewBills(ctx: Ctx, ym: string, date: string): Promise<BillView[]> {
  const rows = await recurringBills.list(ctx.db, ctx.household);
  const autopay = new Set(rows.filter((r) => r.autopay).map((r) => r.id));
  return monthBillPreview(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      estimateCents: Number(r.estimate_cents),
      dueDay: r.due_day,
      categoryId: r.category_id,
      startYm: r.start_ym,
      endYm: r.end_ym,
    })),
    ym,
    date,
  ).map((b) => ({
    id: null,
    name: b.name,
    categoryId: b.categoryId,
    dueDate: b.dueDate,
    estimateCents: b.estimateCents,
    actualCents: null,
    paid: false,
    kind: 'recurring' as const,
    autopay: autopay.has(b.recurringBillId),
  }));
}

/** Spec §6.2: a month's bills (this month when none is given), paychecks and one-time income. */
export async function billsPage(ctx: Ctx, ym?: string): Promise<BillsPageView> {
  const household = await householdNow(ctx);
  const shown = ym ?? household.today.slice(0, 7);
  const month = await months.get(ctx.db, ctx.household, shown);
  const started = month !== undefined;
  const [stored, preview, allCategories, paychecks, income, cards] = await Promise.all([
    storedBills(ctx, shown),
    started ? [] : previewBills(ctx, shown, household.today),
    categories.list(ctx.db, ctx.household, { includeArchived: true }),
    pagePaychecks(ctx, shown, started, household.today),
    otherIncome.listForMonth(ctx.db, ctx.household, shown),
    monthCards(ctx, shown),
  ]);
  return {
    today: household.today,
    ym: shown,
    status: month === undefined ? 'not-started' : month.status,
    canOpen: !started && canOpenMonth(shown, household.firstMonth, household.today),
    // A month not started can already hold one-time bills, beside the preview.
    bills: [...stored, ...preview].sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name),
    ),
    categories: allCategories.map((c) => ({ id: c.id, name: c.name, colorIndex: c.color_index })),
    paychecks,
    cards,
    otherIncome: income.map((i) => ({
      id: i.id,
      type: i.type,
      amountCents: Number(i.amount_cents),
    })),
  };
}

/** Spec §5.11: the temporary "Open {month}" button. */
export const openBillsMonth = (ctx: Ctx, input: z.infer<typeof openMonthInput>) =>
  translated(async () => {
    const household = await householdNow(ctx);
    if (!canOpenMonth(input.ym, household.firstMonth, household.today)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'That month cannot be opened yet.' });
    }
    const { created } = await openMonth(ctx.db, ctx.household, input.ym, now(ctx));
    return { created };
  });

export const addBill = (ctx: Ctx, input: z.infer<typeof addBillInput>) =>
  translated(async () => {
    const row = await bills.create(ctx.db, ctx.household, input, now(ctx));
    return { id: row.id };
  });

export const updateBill = (ctx: Ctx, input: z.infer<typeof updateBillInput>) =>
  translated(async () => {
    const { id, ...change } = input;
    await bills.update(ctx.db, ctx.household, id, change);
  });

export const setBillPaid = (ctx: Ctx, input: z.infer<typeof setBillPaidInput>) =>
  translated(() => bills.setPaid(ctx.db, ctx.household, input.id, input.paid, now(ctx)));

export const removeBill = (ctx: Ctx, input: { id: string }) =>
  translated(() => bills.remove(ctx.db, ctx.household, input.id));
