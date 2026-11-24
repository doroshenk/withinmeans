import { z } from 'zod';
import type { Cents } from './money';

export const SUGGESTED_BILLS: readonly string[] = [];

export interface BillDraft {
  name: string;
  estimateText: string;
  dueDayText: string;
}

export function isSuggestionUsed(_suggestion: string, _billNames: readonly string[]): boolean {
  throw new Error('not implemented');
}

export function billDraftError(_draft: BillDraft): string | undefined {
  throw new Error('not implemented');
}

export function monthlyBillsTotal(_estimates: readonly Cents[]): Cents {
  throw new Error('not implemented');
}

export function shareOfTakeHome(_totalCents: Cents, _takeHomeCents: Cents | null): string {
  throw new Error('not implemented');
}

export const addRecurringBillInput = z.object({
  name: z.string(),
  estimateCents: z.number(),
  dueDay: z.number(),
  categoryId: z.string(),
  autopay: z.boolean(),
});
export const removeRecurringBillInput = z.object({ id: z.string() });
