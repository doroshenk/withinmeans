import { z } from 'zod';
import type { Cents } from './money';

export type SetupAccountType = 'checking' | 'savings' | 'cash';

/** Spec §3 step 2: the account types offered in setup (brokerage comes with the investments step). */
export const SETUP_ACCOUNT_TYPES: readonly SetupAccountType[] = ['checking', 'savings', 'cash'];

export interface AccountDraft {
  name: string;
  type: SetupAccountType;
  /** The typed balance, e.g. "1,234.56". Empty means not entered. */
  balanceText: string;
}

/** "1,234.56", "$900", "-14.80" → cents; undefined when it is not a dollar amount. */
export function parseDollars(text: string): Cents | undefined {
  const match = /^(-|−)?\$?(\d[\d,]*)?(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (match === null) return undefined;
  const [, sign, whole, fraction] = match;
  if (whole === undefined && fraction === undefined) return undefined;
  const dollars = Number.parseInt((whole ?? '0').replaceAll(',', ''), 10);
  const cents = Number.parseInt((fraction ?? '0').padEnd(2, '0'), 10);
  const total = dollars * 100 + cents;
  return sign === undefined ? total : 0 - total;
}

/** Cents → the text of an input box: 100000 → "1000.00", −1480 → "-14.80". */
export function dollarText(valueCents: Cents): string {
  const negative = valueCents < 0;
  const digits = (negative ? String(valueCents).slice(1) : String(valueCents)).padStart(3, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** Spec §3 step 2: every account has a name and a balance. */
export function accountDraftError(draft: AccountDraft): string | undefined {
  if (draft.name.trim() === '') return 'Give the account a name.';
  if (parseDollars(draft.balanceText) === undefined) return 'Enter the balance today.';
  return undefined;
}

/** Spec §3 step 2: at least one account is required. */
export function setupAccountsError(accountCount: number): string | undefined {
  return accountCount < 1 ? 'Add at least one account.' : undefined;
}

/** Spec §3 step 2: the first checking account becomes the primary checking account. */
export function becomesPrimaryChecking(
  type: SetupAccountType,
  hasPrimaryChecking: boolean,
): boolean {
  return type === 'checking' && !hasPrimaryChecking;
}

export const addAccountInput = z.object({
  name: z.string().trim().min(1),
  type: z.enum(['checking', 'savings', 'cash']),
  balanceCents: z.number().int(),
});
export const removeAccountInput = z.object({ id: z.uuid() });
export const setCushionInput = z.object({ cushionCents: z.number().int().min(0) });
