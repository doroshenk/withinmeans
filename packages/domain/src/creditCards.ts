import { z } from 'zod';
import type { CardMonth } from './cashflow';
import type { YearMonth } from './dates';
import type { Cents } from './money';

export const USUAL_PLANS = ['full', 'min', 'varies'] as const;
export type UsualPlan = (typeof USUAL_PLANS)[number];

export const USUAL_PLAN_LABELS: Record<UsualPlan, string> = {} as Record<UsualPlan, string>;

/** What the balance form's "How much will you pay?" says. */
export type PlanChoice = 'full' | 'min' | 'other';

export interface CreditCardItem {
  id: string;
  nickname: string;
  /** 1 to 31; a shorter month uses its last day. */
  dueDay: number;
  usualPlan: UsualPlan;
  archived: boolean;
}

export interface StatementAmounts {
  statementCents: Cents;
  minimumCents: Cents;
  plannedPaymentCents: Cents;
  /** Null until the payment is marked paid. */
  paidCents: Cents | null;
}

export type StatementItem = StatementAmounts & { cardId: string; ym: YearMonth };

/** One card in one month. */
export interface CardRow {
  cardId: string;
  nickname: string;
  dueDay: number;
  /** "YYYY-MM-DD" */
  dueDate: string;
  usualPlan: UsualPlan;
  archived: boolean;
  /** Null until the month's balance is entered. */
  statement: StatementAmounts | null;
  /** Last month's statement balance. */
  previousCents: Cents | null;
  /** What was left unpaid last month. */
  carriedCents: Cents;
}

export interface CardDraft {
  nickname: string;
  dueDayText: string;
}

export interface StatementDraft {
  cardId: string;
  statementText: string;
  minimumText: string;
  choice: PlanChoice;
  otherText: string;
}

const notImplemented = (): never => {
  throw new Error('not implemented');
};

export function statementError(_amounts: Omit<StatementAmounts, 'paidCents'>): string | undefined {
  return notImplemented();
}

export function defaultPlannedPayment(
  _plan: UsualPlan,
  _statementCents: Cents,
  _minimumCents: Cents,
): Cents | null {
  return notImplemented();
}

export function defaultPlanChoice(_plan: UsualPlan): PlanChoice {
  return notImplemented();
}

export function plannedForChoice(
  _choice: PlanChoice,
  _statementCents: Cents,
  _minimumCents: Cents,
  _otherCents: Cents | null,
): Cents | null {
  return notImplemented();
}

export function planChoiceOf(_amounts: Omit<StatementAmounts, 'paidCents'>): PlanChoice {
  return notImplemented();
}

export function carriedCents(
  _statement: Pick<StatementAmounts, 'statementCents' | 'paidCents'> | null,
): Cents {
  return notImplemented();
}

export function carryText(_cents: Cents): string | null {
  return notImplemented();
}

export function cardDueDate(_ym: YearMonth, _dueDay: number): string {
  return notImplemented();
}

export function cardMonthRows(
  _cards: readonly CreditCardItem[],
  _statements: readonly StatementItem[],
  _ym: YearMonth,
): CardRow[] {
  return notImplemented();
}

export function cardCashflow(_rows: readonly CardRow[]): CardMonth[] {
  return notImplemented();
}

export function cardPlanText(_statement: StatementAmounts): string {
  return notImplemented();
}

export function cardChangeText(
  _statementCents: Cents,
  _previousCents: Cents,
  _ym: YearMonth,
): string {
  return notImplemented();
}

export function cardDraftError(_draft: CardDraft): string | undefined {
  return notImplemented();
}

export function statementDraftError(_draft: StatementDraft): string | undefined {
  return notImplemented();
}

export function paidDraftError(_amountText: string): string | undefined {
  return notImplemented();
}

export const addCreditCardInput = z.object({});
export const removeCreditCardInput = z.object({});
export const saveCardStatementInput = z.object({});
export const markCardPaidInput = z.object({});
export const unmarkCardPaidInput = z.object({});
