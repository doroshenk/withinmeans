import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { parseDollars } from './accounts';
import { kept, moneyIn, moneyOut, type MonthCashflow } from './cashflow';
import { addMonths, daysInMonth, formatMonthDay, monthOf, parseYm, week } from './dates';
import type { Week, YearMonth } from './dates';
import { monthLabel } from './firstMonth';
import { billsForMonth, type MonthBill, type RecurringBillTemplate } from './monthBills';
import { percentOf, subCents, sumCents, type Cents } from './money';
import { otherIncomeTotalCents } from './otherIncome';

export type BillKind = 'recurring' | 'one_time';

/** One month's bill as the page needs it. */
export interface BillLine {
  name: string;
  categoryId: string;
  /** "YYYY-MM-DD" */
  dueDate: string;
  estimateCents: Cents;
  /** Null until the real amount is known. */
  actualCents: Cents | null;
  paid: boolean;
  kind: BillKind;
}

export type BillWeekState = 'none' | 'paid' | 'partly' | 'to-pay';

export interface BillWeek<T extends BillLine = BillLine> {
  week: Week;
  /** "Nov 15 – 21" */
  range: string;
  bills: T[];
  totalCents: Cents;
  paidCount: number;
  leftCents: Cents;
  state: BillWeekState;
  isCurrent: boolean;
  /** Spec §6.2: the current and later weeks start open. */
  startsOpen: boolean;
}

export interface BillsMonthSummary {
  /** Paychecks and one-time income. */
  incomeCents: Cents;
  paychecksReceived: number;
  paycheckCount: number;
  otherCents: Cents;
  otherCount: number;
  checkingMovedCents: Cents;
  billsCents: Cents;
  cardsCents: Cents;
  outCents: Cents;
  paidCents: Cents;
  /** Paid so far as a whole-number percent of money out. */
  paidPct: number;
  paidCount: number;
  billCount: number;
  leftCents: Cents;
}

export interface BillCategoryTotal {
  /** Null for the credit cards line. */
  categoryId: string | null;
  name: string;
  colorIndex: number | null;
  cents: Cents;
  /** The bar's width next to the largest line. */
  barPct: number;
}

export interface BillDraftFields {
  name: string;
  amountText: string;
  /** "YYYY-MM-DD" from the date box; empty when not picked. */
  date: string;
  categoryId: string;
}

/** $100,000,000: far above any real bill, and totals stay exact. */
export const MAX_BILL_CENTS = 10_000_000_000;

/** Spec §5.6: the actual amount, or the estimate until there is one. */
export function billAmountCents(bill: Pick<BillLine, 'estimateCents' | 'actualCents'>): Cents {
  return bill.actualCents ?? bill.estimateCents;
}

const totalOf = (bills: readonly BillLine[]): Cents => sumCents(bills.map(billAmountCents));

const WEEK_DAYS: readonly { week: Week; first: number; last: number | null }[] = [
  { week: 1, first: 1, last: 7 },
  { week: 2, first: 8, last: 14 },
  { week: 3, first: 15, last: 21 },
  { week: 4, first: 22, last: null },
];

function weekState(count: number, paidCount: number): BillWeekState {
  if (count === 0) return 'none';
  if (paidCount === count) return 'paid';
  return paidCount > 0 ? 'partly' : 'to-pay';
}

/** Spec §5.1 and §6.2: a month's bills in weeks 1–4, each by due date and name. */
export function billWeeks<T extends BillLine>(
  bills: readonly T[],
  ym: YearMonth,
  today: string,
): BillWeek<T>[] {
  parseYm(ym);
  const date = Temporal.PlainDate.from(today);
  const thisMonth = monthOf(date);
  return WEEK_DAYS.map((days) => {
    const inWeek = bills
      .filter((b) => week(Temporal.PlainDate.from(b.dueDate)) === days.week)
      // "YYYY-MM-DD" strings sort in calendar order.
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
    const paid = inWeek.filter((b) => b.paid);
    const totalCents = totalOf(inWeek);
    const first = formatMonthDay(`${ym}-${String(days.first).padStart(2, '0')}`);
    const isCurrent = ym === thisMonth && week(date) === days.week;
    return {
      week: days.week,
      range: `${first} – ${days.last ?? daysInMonth(ym)}`,
      bills: inWeek,
      totalCents,
      paidCount: paid.length,
      leftCents: subCents(totalCents, totalOf(paid)),
      state: weekState(inWeek.length, paid.length),
      isCurrent,
      startsOpen: ym > thisMonth || (ym === thisMonth && days.week >= week(date)),
    };
  });
}

/** Spec §6.2: the numbers in the tiles and in "How {month} adds up". */
export function billsMonthSummary(
  month: Omit<MonthCashflow, 'bills'> & { bills: readonly BillLine[] },
): BillsMonthSummary {
  const paid = month.bills.filter((b) => b.paid);
  const billsCents = totalOf(month.bills);
  const cardsPaidCents = sumCents(month.cards.map((c) => c.paidCents ?? 0));
  const paidCents = sumCents([totalOf(paid), cardsPaidCents]);
  const outCents = moneyOut(month);
  const otherCents = otherIncomeTotalCents(month.otherIncome);
  const checkingMovedCents = month.checkingMovedCents ?? 0;
  const share = outCents > 0 ? percentOf(paidCents, outCents) : 0;
  return {
    incomeCents: subCents(moneyIn(month), checkingMovedCents),
    paychecksReceived: month.paychecks.filter((p) => p.receivedCents !== null).length,
    paycheckCount: month.paychecks.length,
    otherCents,
    otherCount: month.otherIncome.length,
    checkingMovedCents,
    billsCents,
    cardsCents: subCents(outCents, billsCents),
    outCents,
    paidCents,
    // A card can be paid more than planned.
    paidPct: share > 100 ? 100 : share,
    paidCount: paid.length,
    billCount: month.bills.length,
    leftCents: kept(month),
  };
}

/** Spec §6.2 "By category": largest first, with credit cards as their own line. */
export function billCategoryTotals(
  bills: readonly BillLine[],
  categories: readonly { id: string; name: string; colorIndex: number }[],
  cardsCents: Cents,
): { rows: BillCategoryTotal[]; oneTimeCents: Cents } {
  const byCategory = new Map<string, BillLine[]>();
  for (const bill of bills) {
    byCategory.set(bill.categoryId, [...(byCategory.get(bill.categoryId) ?? []), bill]);
  }
  const lines: Omit<BillCategoryTotal, 'barPct'>[] = [...byCategory].map(([id, inIt]) => {
    const category = categories.find((c) => c.id === id);
    return {
      categoryId: id,
      name: category?.name ?? 'Other',
      colorIndex: category?.colorIndex ?? null,
      cents: totalOf(inIt),
    };
  });
  if (cardsCents > 0) {
    lines.push({ categoryId: null, name: 'Credit cards', colorIndex: null, cents: cardsCents });
  }
  lines.sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
  const largestCents = lines[0]?.cents ?? 0;
  return {
    rows: lines.map((line) => ({
      ...line,
      barPct: largestCents > 0 ? percentOf(line.cents, largestCents) : 0,
    })),
    oneTimeCents: totalOf(bills.filter((b) => b.kind === 'one_time')),
  };
}

/**
 * Spec §5.11: the recurring bills a month not started yet will get. A past month that was never
 * started has nothing to preview.
 */
export function monthBillPreview(
  recurring: readonly RecurringBillTemplate[],
  ym: YearMonth,
  today: string,
): MonthBill[] {
  parseYm(ym);
  if (ym < monthOf(Temporal.PlainDate.from(today))) return [];
  return billsForMonth(recurring, ym);
}

/**
 * The months the temporary "Open {month}" button may open: from the household's first month up to
 * next month (or the first month itself, when that is further ahead).
 */
export function canOpenMonth(ym: YearMonth, firstMonth: YearMonth, today: string): boolean {
  parseYm(ym);
  parseYm(firstMonth);
  const nextMonth = addMonths(monthOf(Temporal.PlainDate.from(today)), 1);
  // "YYYY-MM" strings sort in calendar order.
  const latest = firstMonth > nextMonth ? firstMonth : nextMonth;
  return ym >= firstMonth && ym <= latest;
}

/** Says where a new bill landed (spec §6.2). */
export function billAddedText(name: string, dueDate: string): string {
  const date = Temporal.PlainDate.from(dueDate);
  return `Added ${name} to week ${week(date)} of ${monthLabel(monthOf(date))}.`;
}

const isDate = (text: string) => z.iso.date().safeParse(text).success;

function draftError(draft: BillDraftFields, allowZero: boolean): string | undefined {
  if (draft.name.trim() === '') return 'Give the bill a name.';
  const amountCents = parseDollars(draft.amountText);
  if (amountCents === undefined || amountCents < 0 || (!allowZero && amountCents === 0)) {
    return 'Enter an amount greater than $0.';
  }
  if (amountCents > MAX_BILL_CENTS) return 'Enter an amount of $100,000,000 or less.';
  if (!isDate(draft.date)) return 'Pick the date it is due.';
  if (draft.categoryId === '') return 'Pick a category.';
  return undefined;
}

/** What is wrong with the "Add one-time bill" form, if anything. */
export function oneTimeBillDraftError(draft: BillDraftFields): string | undefined {
  return draftError(draft, false);
}

/**
 * What is wrong with the edit form, if anything. A recurring bill can come to $0 in a month, and
 * a bill stays in its month.
 */
export function billEditDraftError(
  draft: BillDraftFields,
  ym: YearMonth,
  kind: BillKind = 'one_time',
): string | undefined {
  const error = draftError(draft, kind === 'recurring');
  if (error !== undefined) return error;
  return draft.date.startsWith(`${ym}-`) ? undefined : `Pick a date in ${monthLabel(ym)}.`;
}

const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const id = z.uuid();
const billFields = {
  name: z.string().trim().min(1),
  amountCents: z.number().int().min(0).max(MAX_BILL_CENTS),
  dueDate: z.iso.date(),
  categoryId: id,
};

export const billsPageInput = z.object({ ym: ym.optional() });
export const openMonthInput = z.object({ ym });
/** A new one-time bill has an amount above $0. */
export const addBillInput = z.object({
  ...billFields,
  amountCents: billFields.amountCents.min(1),
  paid: z.boolean(),
});
export const updateBillInput = z.object({ id, ...billFields });
export const setBillPaidInput = z.object({ id, paid: z.boolean() });
export const removeBillInput = z.object({ id });
