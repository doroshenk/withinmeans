import { z } from 'zod';
import { parseDollars } from './accounts';
import type { CardMonth } from './cashflow';
import { addMonths, daysInMonth, formatMonthDay, type YearMonth } from './dates';
import { monthName } from './firstMonth';
import { formatMoney, subCents, type Cents } from './money';

export const USUAL_PLANS = ['full', 'min', 'varies'] as const;
export type UsualPlan = (typeof USUAL_PLANS)[number];

export const USUAL_PLAN_LABELS: Record<UsualPlan, string> = {
  full: 'Full balance',
  min: 'Minimum',
  varies: 'Varies',
};

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

export type StatementItem = StatementAmounts & {
  cardId: string;
  ym: YearMonth;
  /** "YYYY-MM-DD" in month `ym`; without one, the card's due day. */
  dueDate?: string | null;
};

/** One card in one month. */
export interface CardRow {
  cardId: string;
  nickname: string;
  dueDay: number;
  /** "YYYY-MM-DD": this month's statement's date, else the card's due day. */
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
  /** The "Payment due" field, and the month it has to fall in. */
  due?: { ym: YearMonth; dateText: string };
}

/** $100,000,000: far above any real balance, and totals stay exact. */
export const MAX_CARD_CENTS = 10_000_000_000;
export const MAX_NICKNAME_LENGTH = 40;
export const MAX_CARD_DUE_DAY = 31;
/** A nickname with this many digits looks like a card or account number. */
const NUMBER_LIKE_DIGITS = 8;

const isAmount = (cents: number): boolean =>
  Number.isSafeInteger(cents) && cents >= 0 && cents <= MAX_CARD_CENTS;

const AMOUNT_RANGE = 'Enter amounts from $0 to $100,000,000.';

/** Spec §5.10: neither the minimum nor the planned payment can be more than the balance. */
export function statementError(amounts: Omit<StatementAmounts, 'paidCents'>): string | undefined {
  const { statementCents, minimumCents, plannedPaymentCents } = amounts;
  if (![statementCents, minimumCents, plannedPaymentCents].every(isAmount)) return AMOUNT_RANGE;
  if (minimumCents > statementCents) {
    return 'The minimum can’t be more than the statement balance.';
  }
  if (plannedPaymentCents > statementCents) {
    return 'The planned payment can’t be more than the statement balance.';
  }
  return undefined;
}

/** The form's choice for a card's usual plan; "varies" leaves the amount to the user. */
export function defaultPlanChoice(plan: UsualPlan): PlanChoice {
  return plan === 'varies' ? 'other' : plan;
}

/** What a choice pays; null while "other" has no amount. */
export function plannedForChoice(
  choice: PlanChoice,
  statementCents: Cents,
  minimumCents: Cents,
  otherCents: Cents | null,
): Cents | null {
  if (choice === 'full') return statementCents;
  return choice === 'min' ? minimumCents : otherCents;
}

/** Spec §5.10: the planned payment defaults to the card's usual plan. */
export function defaultPlannedPayment(
  plan: UsualPlan,
  statementCents: Cents,
  minimumCents: Cents,
): Cents | null {
  return plannedForChoice(defaultPlanChoice(plan), statementCents, minimumCents, null);
}

/** The choice a saved statement shows when it is edited. */
export function planChoiceOf(amounts: Omit<StatementAmounts, 'paidCents'>): PlanChoice {
  if (amounts.plannedPaymentCents === amounts.statementCents) return 'full';
  return amounts.plannedPaymentCents === amounts.minimumCents ? 'min' : 'other';
}

/** Spec §5.10: the statement less what was paid, never below $0. No statement carries nothing. */
export function carriedCents(
  statement: Pick<StatementAmounts, 'statementCents' | 'paidCents'> | null,
): Cents {
  if (statement === null) return 0;
  const paidCents = statement.paidCents ?? 0;
  return paidCents < statement.statementCents ? subCents(statement.statementCents, paidCents) : 0;
}

/** "carries $187.43", or null when nothing is carried. */
export function carryText(cents: Cents): string | null {
  return cents > 0 ? `carries ${formatMoney(cents)}` : null;
}

/** The date ("YYYY-MM-DD") a card with this due day is due in month `ym`. */
export function cardDueDate(ym: YearMonth, dueDay: number): string {
  const day = Math.min(dueDay, daysInMonth(ym));
  return `${ym}-${String(day).padStart(2, '0')}`;
}

/** What is wrong with a statement's due date: it must be a day of the statement's month. */
export function cardDueDateError(ym: YearMonth, date: string): string | undefined {
  const real = z.iso.date().safeParse(date).success;
  return real && date.startsWith(`${ym}-`) ? undefined : `Pick a payment date in ${monthName(ym)}.`;
}

/**
 * The month's card rows, by the date each is due, then due day and nickname: every card still in
 * use, and a removed card in a month that has its statement. `statements` holds this month's and
 * last month's.
 */
export function cardMonthRows(
  cards: readonly CreditCardItem[],
  statements: readonly StatementItem[],
  ym: YearMonth,
): CardRow[] {
  const previousYm = addMonths(ym, -1);
  const find = (cardId: string, month: YearMonth): StatementItem | undefined =>
    statements.find((s) => s.cardId === cardId && s.ym === month);
  return cards
    .filter((card) => !card.archived || find(card.id, ym) !== undefined)
    .map((card) => {
      const current = find(card.id, ym);
      const previous = find(card.id, previousYm);
      return {
        cardId: card.id,
        nickname: card.nickname,
        dueDay: card.dueDay,
        dueDate: current?.dueDate ?? cardDueDate(ym, card.dueDay),
        usualPlan: card.usualPlan,
        archived: card.archived,
        statement:
          current === undefined
            ? null
            : {
                statementCents: current.statementCents,
                minimumCents: current.minimumCents,
                plannedPaymentCents: current.plannedPaymentCents,
                paidCents: current.paidCents,
              },
        previousCents: previous?.statementCents ?? null,
        carriedCents: carriedCents(previous ?? null),
      };
    })
    .sort(
      // "YYYY-MM-DD" strings sort in calendar order.
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.dueDay - b.dueDay ||
        a.nickname.localeCompare(b.nickname),
    );
}

/** The rows as the money-in, money-out rules take them (spec §5.6). */
export function cardCashflow(rows: readonly CardRow[]): CardMonth[] {
  return rows.map((row) => ({
    cardId: row.cardId,
    name: row.nickname,
    plannedPaymentCents: row.statement?.plannedPaymentCents ?? null,
    paidCents: row.statement?.paidCents ?? null,
  }));
}

/** How a statement is being paid, as design/Bills.png says it. */
export function cardPlanText(statement: StatementAmounts): string {
  const { statementCents, plannedPaymentCents, paidCents } = statement;
  if (paidCents !== null) return `Paid ${formatMoney(paidCents)}`;
  if (statementCents === 0) return 'Nothing due';
  if (plannedPaymentCents === statementCents) return 'Paying in full';
  const rest = subCents(statementCents, plannedPaymentCents);
  return `Paying ${formatMoney(plannedPaymentCents)} · ${formatMoney(rest)} carries over`;
}

/** "+$181.62 vs Oct": this month's balance beside last month's. */
export function cardChangeText(statementCents: Cents, previousCents: Cents, ym: YearMonth): string {
  const [month] = formatMonthDay(`${addMonths(ym, -1)}-01`).split(' ');
  const difference = subCents(statementCents, previousCents);
  if (difference === 0) return `Same as ${month}`;
  return `${difference > 0 ? '+' : ''}${formatMoney(difference)} vs ${month}`;
}

/** "October statement: $98.20 · up $44.16", once this month's balance is typed. */
export function cardPreviousText(
  previousCents: Cents,
  statementCents: Cents | null,
  ym: YearMonth,
): string {
  const last = `${monthName(addMonths(ym, -1))} statement: ${formatMoney(previousCents)}`;
  if (statementCents === null) return last;
  if (statementCents === previousCents) return `${last} · no change`;
  const up = statementCents > previousCents;
  const difference = up
    ? subCents(statementCents, previousCents)
    : subCents(previousCents, statementCents);
  return `${last} · ${up ? 'up' : 'down'} ${formatMoney(difference)}`;
}

const looksLikeNumber = (nickname: string): boolean =>
  nickname.replace(/[^0-9]/g, '').length >= NUMBER_LIKE_DIGITS;

/** Spec §3 step 6: a nickname, never a card number. Undefined when it is fine. */
export function nicknameError(nickname: string): string | undefined {
  const trimmed = nickname.trim();
  if (trimmed === '') return 'Give the card a nickname.';
  if (trimmed.length > MAX_NICKNAME_LENGTH) return 'Keep the nickname to 40 characters.';
  if (looksLikeNumber(trimmed)) return 'Use a nickname, not the card number.';
  return undefined;
}

/** Spec §3 step 6: the step is finished with at least one card, or else skipped. */
export function setupCardsError(cardCount: number): string | undefined {
  return cardCount > 0 ? undefined : 'Add a card, or skip for now.';
}

/** What is wrong with the card form, if anything. */
export function cardDraftError(draft: CardDraft): string | undefined {
  const day = draft.dueDayText.trim();
  const badDay = !/^\d{1,2}$/.test(day) || Number(day) < 1 || Number(day) > MAX_CARD_DUE_DAY;
  return nicknameError(draft.nickname) ?? (badDay ? 'Pick a due day from 1 to 31.' : undefined);
}

/** What is wrong with the balance form, if anything. */
export function statementDraftError(draft: StatementDraft): string | undefined {
  if (draft.cardId === '') return 'Pick a card.';
  const badDate = draft.due && cardDueDateError(draft.due.ym, draft.due.dateText);
  if (badDate !== undefined) return badDate;
  const statementCents = parseDollars(draft.statementText);
  if (statementCents === undefined) return 'Enter the statement balance.';
  const minimumCents = parseDollars(draft.minimumText);
  if (minimumCents === undefined) return 'Enter the minimum payment (0 if there is none).';
  const plannedPaymentCents = plannedForChoice(
    draft.choice,
    statementCents,
    minimumCents,
    parseDollars(draft.otherText) ?? null,
  );
  if (plannedPaymentCents === null) return 'Enter the amount you plan to pay.';
  return statementError({ statementCents, minimumCents, plannedPaymentCents });
}

/**
 * A typed amount from $0 to the card limit; null for anything else, so that a form can total what
 * is typed so far without meeting a number too large to add up.
 */
export function parseCardAmount(text: string): Cents | null {
  const cents = parseDollars(text);
  return cents !== undefined && isAmount(cents) ? cents : null;
}

/** What is wrong with the amount typed into "mark paid", if anything. */
export function paidDraftError(amountText: string): string | undefined {
  const paidCents = parseDollars(amountText);
  if (paidCents === undefined || paidCents < 0) return 'Enter the amount paid.';
  if (paidCents > MAX_CARD_CENTS) return 'Enter an amount of $100,000,000 or less.';
  return undefined;
}

const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const id = z.uuid();
const cents = z.number().int().min(0).max(MAX_CARD_CENTS);

export const addCreditCardInput = z.object({
  nickname: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const message = nicknameError(value);
      if (message !== undefined) ctx.addIssue({ code: 'custom', message });
    }),
  dueDay: z.number().int().min(1).max(MAX_CARD_DUE_DAY),
  usualPlan: z.enum(USUAL_PLANS),
});
export const removeCreditCardInput = z.object({ id });
export const saveCardStatementInput = z
  .object({
    cardId: id,
    ym,
    statementCents: cents,
    minimumCents: cents,
    plannedPaymentCents: cents,
    alreadyPaid: z.boolean().optional(),
    /** Left out, the statement keeps the date it has. */
    dueDate: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const message =
      statementError(value) ??
      (value.dueDate === undefined ? undefined : cardDueDateError(value.ym, value.dueDate));
    if (message !== undefined) ctx.addIssue({ code: 'custom', message });
  });
export const markCardPaidInput = z.object({ cardId: id, ym, paidCents: cents });
export const unmarkCardPaidInput = z.object({ cardId: id, ym });
