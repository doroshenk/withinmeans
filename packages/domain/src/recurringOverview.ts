import { Temporal } from 'temporal-polyfill';
import { addMonths, monthOf, week, type Week, type YearMonth } from './dates';
import { percentOf, type Cents } from './money';
import { dueDateIn } from './monthBills';
import { monthlyBillsTotal } from './recurringBills';

/** A recurring bill as the Recurring bills page needs it. */
export interface RecurringBillItem {
  id: string;
  name: string;
  estimateCents: Cents;
  dueDay: number;
  categoryId: string;
  autopay: boolean;
  startYm: YearMonth;
  /** The last month the bill is active; null while it has not ended. */
  endYm: YearMonth | null;
}

export interface UpcomingBill extends RecurringBillItem {
  /** "YYYY-MM-DD", today or later. */
  nextDue: string;
  daysUntil: number;
}

export interface WeekOfBills {
  week: Week;
  totalCents: Cents;
  /** The total as a percent of the biggest week's total (the bar's length). */
  barPercent: number;
  bills: UpcomingBill[];
}

export interface RecurringOverview {
  totalCents: Cents;
  count: number;
  autopayCount: number;
  manualCount: number;
  /** Bills that have not ended, next due first. */
  active: UpcomingBill[];
  ended: RecurringBillItem[];
  nextUp: UpcomingBill | null;
  weeks: WeekOfBills[];
}

export type RecurringSort = 'next-due' | 'amount' | 'name';

export interface CategoryTotal {
  count: number;
  totalCents: Cents;
}

const WEEKS: readonly Week[] = [1, 2, 3, 4];
/** A bill due this many days from today, or sooner, is highlighted. */
const SOON_DAYS = 3;

/**
 * The first due date on or after `today` ("YYYY-MM-DD"), and not before the month the bill starts.
 */
export function nextDueDate(
  bill: Pick<RecurringBillItem, 'dueDay' | 'startYm'>,
  today: string,
): string {
  const thisMonth = monthOf(Temporal.PlainDate.from(today));
  const first = bill.startYm > thisMonth ? bill.startYm : thisMonth;
  const date = dueDateIn(first, bill.dueDay);
  // "YYYY-MM-DD" strings sort in calendar order.
  return date >= today ? date : dueDateIn(addMonths(first, 1), bill.dueDay);
}

/** "Due today", "Tomorrow", "In 5 days"; `soon` for the next few days. */
export function dueInText(daysUntil: number): { text: string; soon: boolean } {
  const soon = daysUntil <= SOON_DAYS;
  if (daysUntil === 0) return { text: 'Due today', soon };
  if (daysUntil === 1) return { text: 'Tomorrow', soon };
  return { text: `In ${daysUntil} days`, soon };
}

const byName = (a: RecurringBillItem, b: RecurringBillItem): number =>
  a.name.localeCompare(b.name, 'en');

const ORDER: Record<RecurringSort, (a: UpcomingBill, b: UpcomingBill) => number> = {
  'next-due': (a, b) => a.daysUntil - b.daysUntil || byName(a, b),
  amount: (a, b) => b.estimateCents - a.estimateCents || byName(a, b),
  name: byName,
};

/** A sorted copy: soonest first, biggest first, or by name. */
export function sortRecurring(bills: readonly UpcomingBill[], by: RecurringSort): UpcomingBill[] {
  return [...bills].sort(ORDER[by]);
}

const totalOf = (bills: readonly RecurringBillItem[]): Cents =>
  monthlyBillsTotal(bills.map((b) => b.estimateCents));

/** Everything the Recurring bills page shows (spec §6.3); ended bills are only listed. */
export function recurringOverview(
  bills: readonly RecurringBillItem[],
  today: string,
): RecurringOverview {
  const from = Temporal.PlainDate.from(today);
  const upcoming = bills
    .filter((b) => b.endYm === null)
    .map((b) => {
      const nextDue = nextDueDate(b, today);
      return { ...b, nextDue, daysUntil: from.until(nextDue).days };
    });
  const active = sortRecurring(upcoming, 'next-due');
  const grouped = WEEKS.map((w) => {
    const inWeek = active
      .filter((b) => week(Temporal.PlainDate.from(b.nextDue)) === w)
      .sort((a, b) => a.dueDay - b.dueDay || byName(a, b));
    return { week: w, totalCents: totalOf(inWeek), bills: inWeek };
  });
  const biggest = grouped.reduce((max, w) => (w.totalCents > max ? w.totalCents : max), 0);
  const autopayCount = active.filter((b) => b.autopay).length;
  return {
    totalCents: totalOf(active),
    count: active.length,
    autopayCount,
    manualCount: active.length - autopayCount,
    active,
    ended: bills.filter((b) => b.endYm !== null).sort(byName),
    nextUp: active[0] ?? null,
    weeks: grouped.map((w) => ({
      ...w,
      barPercent: biggest === 0 ? 0 : percentOf(w.totalCents, biggest),
    })),
  };
}

/** How many bills that have not ended each category has, and what they add up to a month. */
export function categoryTotals(
  bills: readonly RecurringBillItem[],
): ReadonlyMap<string, CategoryTotal> {
  const active = bills.filter((b) => b.endYm === null);
  return new Map(
    active.map((bill) => {
      const same = active.filter((b) => b.categoryId === bill.categoryId);
      return [bill.categoryId, { count: same.length, totalCents: totalOf(same) }];
    }),
  );
}

/**
 * The last month an ended bill stays in: the latest started month up to this one, so months started
 * from now on get no bill. With none, the month before this one.
 */
export function lastKeptMonth(openedMonths: readonly YearMonth[], currentYm: YearMonth): YearMonth {
  const started = openedMonths.filter((ym) => ym <= currentYm).sort();
  return started.at(-1) ?? addMonths(currentYm, -1);
}

/**
 * A new bill starts this month (past months get none), or in the first month if that is later. While
 * no month after the first has been started, the household is still catching up on the first month
 * (spec §3 step 1), so the bill starts there.
 */
export function newBillStartMonth(
  firstMonth: YearMonth,
  currentYm: YearMonth,
  onlyFirstMonthStarted = false,
): YearMonth {
  return onlyFirstMonthStarted || firstMonth > currentYm ? firstMonth : currentYm;
}
