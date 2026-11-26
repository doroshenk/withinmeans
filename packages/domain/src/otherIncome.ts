import { z } from 'zod';
import type { YearMonth } from './dates';
import type { Cents } from './money';

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
  side_work: '',
  sale: '',
  refund: '',
  gift: '',
  bonus: '',
  other: '',
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

export function otherIncomeForMonth<T extends { date: string }>(
  _items: readonly T[],
  _ym: YearMonth,
): T[] {
  throw new Error('not implemented');
}

export function otherIncomeTotalCents(_items: readonly { amountCents: Cents }[]): Cents {
  throw new Error('not implemented');
}

export function recentSources(_items: readonly OtherIncomeItem[]): RecentSource[] {
  throw new Error('not implemented');
}

export function otherIncomeDraftError(_draft: OtherIncomeDraft): string | undefined {
  throw new Error('not implemented');
}

export const addOtherIncomeInput = z.object({
  date: z.string(),
  source: z.string(),
  type: z.enum(OTHER_INCOME_TYPES),
  amountCents: z.number(),
  accountId: z.string().optional(),
  note: z.string().optional(),
});
export const removeOtherIncomeInput = z.object({ id: z.uuid() });
export const otherIncomeInput = z.object({
  ym: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
