import { z } from 'zod';
import { parseDollars } from './accounts';
import { parseYm, type YearMonth } from './dates';
import { sumCents, type Cents } from './money';

export const OTHER_INCOME_TYPES = [
  'side_work',
  'sale',
  'refund',
  'gift',
  'bonus',
  'other',
] as const;
export type OtherIncomeType = (typeof OTHER_INCOME_TYPES)[number];

export const OTHER_INCOME_TYPE_LABELS: Record<OtherIncomeType, string> = {
  side_work: 'Side work',
  sale: 'Sale',
  refund: 'Refund',
  gift: 'Gift',
  bonus: 'Bonus',
  other: 'Other',
};

export interface OtherIncomeItem {
  id: string;
  /** "YYYY-MM-DD": the day the money came in. */
  date: string;
  source: string;
  type: OtherIncomeType;
  amountCents: Cents;
  accountId: string | null;
  note: string | null;
}

export type RecentSource = Pick<OtherIncomeItem, 'source' | 'type' | 'accountId'>;

export interface OtherIncomeDraft {
  source: string;
  /** The typed amount, e.g. "64.20". */
  amountText: string;
  /** "YYYY-MM-DD" from the date box; empty when not picked. */
  date: string;
}

/** "YYYY-MM-DD" strings sort in calendar order. */
const newestFirst = (a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date);

/** Spec §5.6: an entry counts in the month of its date. Newest first. */
export function otherIncomeForMonth<T extends { date: string }>(
  items: readonly T[],
  ym: YearMonth,
): T[] {
  parseYm(ym);
  return items.filter((item) => item.date.startsWith(`${ym}-`)).sort(newestFirst);
}

export function otherIncomeTotalCents(items: readonly { amountCents: Cents }[]): Cents {
  return sumCents(items.map((item) => item.amountCents));
}

const RECENT_SOURCES = 3;

/** The form's shortcuts: the last few sources used, each as it was entered most recently. */
export function recentSources(items: readonly (RecentSource & { date: string })[]): RecentSource[] {
  const latest = new Map<string, RecentSource>();
  for (const { source, type, accountId } of [...items].sort(newestFirst)) {
    if (!latest.has(source)) latest.set(source, { source, type, accountId });
  }
  return [...latest.values()].slice(0, RECENT_SOURCES);
}

const isDate = (text: string) => z.iso.date().safeParse(text).success;

/** What is wrong with the form, if anything. */
export function otherIncomeDraftError(draft: OtherIncomeDraft): string | undefined {
  if (draft.source.trim() === '') return 'Say where the money came from.';
  if ((parseDollars(draft.amountText) ?? 0) <= 0) return 'Enter an amount more than zero.';
  if (!isDate(draft.date)) return 'Pick the date the money came in.';
  return undefined;
}

export const addOtherIncomeInput = z.object({
  date: z.iso.date(),
  source: z.string().trim().min(1),
  type: z.enum(OTHER_INCOME_TYPES),
  amountCents: z.number().int().positive(),
  accountId: z.uuid().optional(),
  note: z
    .string()
    .trim()
    .transform((note) => (note === '' ? undefined : note))
    .optional(),
});
export const removeOtherIncomeInput = z.object({ id: z.uuid() });
export const otherIncomeInput = z.object({
  ym: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
