import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { formatShortDate, monthOf, week } from './dates';
import { monthLabel } from './firstMonth';

export type QuickAddType = 'bill' | 'income' | 'paycheck' | 'card';

export interface QuickAddTypeInfo {
  id: QuickAddType;
  label: string;
  /** One line under the label in the list. */
  hint: string;
  heading: string;
  help: string;
}

/** Spec §5.14: the types built so far, in order; P3-11 adds the rest. */
export const QUICK_ADD_TYPES: readonly QuickAddTypeInfo[] = [
  {
    id: 'bill',
    label: 'Bill',
    hint: 'One-time bill or expense',
    heading: 'Add a bill',
    help: 'For one-time bills. Monthly ones belong on Recurring bills.',
  },
  {
    id: 'income',
    label: 'Other income',
    hint: 'Side work, refund, sale, gift',
    heading: 'Add other income',
    help: 'Money that isn’t a scheduled paycheck.',
  },
  {
    id: 'paycheck',
    label: 'Paycheck received',
    hint: 'Mark an expected paycheck',
    heading: 'Mark a paycheck received',
    help: 'The amount that landed replaces the expected one.',
  },
  {
    id: 'card',
    label: 'Card balance',
    hint: 'This month’s statement',
    heading: 'Enter a card balance',
    help: 'What you plan to pay counts toward this month’s bills.',
  },
];

const BILLS = { route: 'bills', name: 'Bills & cash flow' } as const;
const PAYCHECKS = { route: 'paychecks', name: 'Paychecks & income' } as const;

export const QUICK_ADD_PAGES: Record<QuickAddType, { route: 'bills' | 'paychecks'; name: string }> =
  { bill: BILLS, income: PAYCHECKS, paycheck: PAYCHECKS, card: BILLS };

/** Spec §5.14: the page, week and month a saved entry landed in. `date` is "YYYY-MM-DD". */
export function quickAddLandedText(type: QuickAddType, name: string, date: string): string {
  const day = Temporal.PlainDate.from(date);
  const when = `week ${week(day)} of ${monthLabel(monthOf(day))}`;
  return `Saved ${name} to ${QUICK_ADD_PAGES[type].name}, ${when}.`;
}

/** Where an entry will go, while its form is filled; null until the date is a real one. */
export function quickAddPreviewText(
  type: QuickAddType,
  date: string,
  category?: string,
): string | null {
  if (!z.iso.date().safeParse(date).success) return null;
  const when = `Week ${week(Temporal.PlainDate.from(date))} (${formatShortDate(date)})`;
  const where = [QUICK_ADD_PAGES[type].name, when, category].filter(Boolean).join(' · ');
  return `Goes to ${where}`;
}

/** The second line of an entry in the "Just added" list. */
export function quickAddDetail(type: QuickAddType, date: string): string {
  return `${QUICK_ADD_PAGES[type].name} · ${formatShortDate(date)}`;
}

/**
 * The paychecks Quick Add can mark: stored ones in open months that are not received yet, oldest
 * first. It is given the months around today, since pay can land early or late.
 */
export function paychecksWaiting<
  P extends { id: string | null; expectedDate: string; receivedCents: number | null },
>(months: readonly { status: string; paychecks: readonly P[] }[]): (P & { id: string })[] {
  return (
    months
      .filter((month) => month.status === 'open')
      .flatMap((month) => month.paychecks)
      .filter((pay): pay is P & { id: string } => pay.id !== null && pay.receivedCents === null)
      // "YYYY-MM-DD" strings sort in calendar order.
      .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))
  );
}
