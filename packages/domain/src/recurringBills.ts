import { z } from 'zod';
import { parseDollars } from './accounts';
import { percentOf, sumCents, type Cents } from './money';

/** Spec §3 step 5: one-tap additions. */
export const SUGGESTED_BILLS: readonly string[] = [
  'Mortgage',
  'Rent',
  'Electric',
  'Water & sewer',
  'Internet',
  'Phone',
  'Car insurance',
  'Streaming',
  'HOA dues',
  'Gym',
];

const MIN_DUE_DAY = 1;
const MAX_DUE_DAY = 28;

export interface BillDraft {
  name: string;
  /** The typed estimate, e.g. "1,500.00". */
  estimateText: string;
  /** The typed due day, e.g. "15". */
  dueDayText: string;
}

const key = (name: string): string => name.trim().toLowerCase();

/** Spec §3 step 5: a suggestion is crossed out once a bill with that name exists. */
export function isSuggestionUsed(suggestion: string, billNames: readonly string[]): boolean {
  return billNames.some((name) => key(name) === key(suggestion));
}

/** Spec §3 step 5: name required, estimate > 0, due day 1–28 (no "last day of the month"). */
export function billDraftError(draft: BillDraft): string | undefined {
  if (draft.name.trim() === '') return 'Give the bill a name.';
  const estimate = parseDollars(draft.estimateText);
  if (estimate === undefined || estimate <= 0) return 'Enter an estimate greater than $0.';
  const day = draft.dueDayText.trim();
  if (!/^\d{1,2}$/.test(day) || Number(day) < MIN_DUE_DAY || Number(day) > MAX_DUE_DAY) {
    return 'Pick a due day from 1 to 28.';
  }
  return undefined;
}

/** Spec §3 step 5: what the recurring bills add up to in a month. */
export function monthlyBillsTotal(estimates: readonly Cents[]): Cents {
  return sumCents(estimates);
}

/**
 * Spec §3 step 5: the bills as a whole-number percent of take-home pay, or "—" until there is
 * take-home pay to compare with (paychecks come in step 3).
 */
export function shareOfTakeHome(part: Cents, whole: Cents | null): string {
  if (whole === null || whole <= 0) return '—';
  return `${percentOf(part, whole)}%`;
}

const ORDINAL_ENDINGS: Readonly<Record<number, string>> = { 1: 'st', 2: 'nd', 3: 'rd' };

/** 1 → "1st", 22 → "22nd". */
export function ordinal(day: number): string {
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const ending = teen ? 'th' : (ORDINAL_ENDINGS[day % 10] ?? 'th');
  return `${day}${ending}`;
}

/** "Due on the 1st", "Due on the 22nd": the due day as people say it. */
export function dueDayLabel(day: number): string {
  return `Due on the ${ordinal(day)}`;
}

const dueDay = z.number().int().min(MIN_DUE_DAY).max(MAX_DUE_DAY);

export const addRecurringBillInput = z.object({
  name: z.string().trim().min(1),
  estimateCents: z.number().int().positive(),
  dueDay,
  categoryId: z.uuid(),
  autopay: z.boolean(),
});
export const removeRecurringBillInput = z.object({ id: z.uuid() });

/** An edit saves the whole bill. */
export const updateRecurringBillInput = addRecurringBillInput.extend({ id: z.uuid() });
export const endRecurringBillInput = z.object({ id: z.uuid() });
export const restartRecurringBillInput = z.object({ id: z.uuid() });
