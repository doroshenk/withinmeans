import { z } from 'zod';
import type { YearMonth } from './dates';
import type { Cents } from './money';
import type { ExpectedPaycheck, PaycheckAmounts, PayScheduleTemplate } from './paychecks';

const todo = (): never => {
  throw new Error('not implemented');
};

export interface PaycheckMonthSummary {
  receivedCents: Cents;
  stillExpectedCents: Cents;
  toComeCount: number;
  paychecksCents: Cents;
  paycheckCount: number;
  otherCents: Cents;
  otherCount: number;
}

export function paycheckMonthSummary(
  _paychecks: readonly PaycheckAmounts[],
  _otherIncome: readonly { amountCents: Cents }[],
): PaycheckMonthSummary {
  return todo();
}

export function averageReceivedCents(
  _paychecks: readonly { receivedDate: string | null; receivedCents: Cents | null }[],
): Cents | null {
  return todo();
}

export function receivedDifferenceText(_receivedCents: Cents, _expectedCents: Cents): string {
  return todo();
}

export function receivedPreviewText(_amountText: string, _expectedCents: Cents): string | null {
  return todo();
}

export function expectedWhenText(_expectedDate: string, _today: string): string {
  return todo();
}

export function receivedDraftError(_draft: {
  amountText: string;
  date: string;
}): string | undefined {
  return todo();
}

export function nextThreePaydayMonth(
  _schedule: PayScheduleTemplate,
  _from: YearMonth,
): YearMonth | null {
  return todo();
}

export function monthPaycheckPreview(
  _schedules: readonly PayScheduleTemplate[],
  _ym: YearMonth,
  _today: string,
): ExpectedPaycheck[] {
  return todo();
}

export function firstRegeneratedPayday(_today: string, _received: readonly string[]): string {
  return todo();
}

export const updatePayScheduleInput = z.never();
export const paycheckIdInput = z.never();
export const paychecksPageInput = z.object({ ym: z.string().optional() });
