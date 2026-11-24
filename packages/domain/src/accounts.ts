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
export function parseDollars(_text: string): Cents | undefined {
  throw new Error('not implemented');
}

/** Spec §3 step 2: every account has a name and a balance. */
export function accountDraftError(_draft: AccountDraft): string | undefined {
  throw new Error('not implemented');
}

/** Spec §3 step 2: at least one account is required. */
export function setupAccountsError(_accountCount: number): string | undefined {
  throw new Error('not implemented');
}

/** Spec §3 step 2: the first checking account becomes the primary checking account. */
export function becomesPrimaryChecking(
  _type: SetupAccountType,
  _hasPrimaryChecking: boolean,
): boolean {
  throw new Error('not implemented');
}

export const addAccountInput = z.object({
  name: z.string().trim().min(1),
  type: z.enum(['checking', 'savings', 'cash']),
  balanceCents: z.number().int(),
});
export const removeAccountInput = z.object({ id: z.uuid() });
export const setCushionInput = z.object({ cushionCents: z.number().int().min(0) });
