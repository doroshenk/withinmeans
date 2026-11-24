import type { MemberContext } from './invitePartner.js';

type Ctx = Pick<MemberContext, 'db' | 'household' | 'clock'>;

export interface SetupAccountView {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'cash' | 'brokerage';
  balanceCents: number | null;
  isPrimaryChecking: boolean;
}

export interface SetupAccountsView {
  accounts: SetupAccountView[];
  cushionCents: number;
}

/** Spec §3 step 2: active accounts with their balance, and the checking cushion. */
export async function listSetupAccounts(_ctx: Ctx): Promise<SetupAccountsView> {
  throw new Error('not implemented');
}

export const addSetupAccount = (
  _ctx: Ctx,
  _input: { name: string; type: 'checking' | 'savings' | 'cash'; balanceCents: number },
): Promise<{ id: string }> => {
  throw new Error('not implemented');
};

export const removeSetupAccount = (_ctx: Ctx, _input: { id: string }): Promise<void> => {
  throw new Error('not implemented');
};

export const saveCushion = (_ctx: Ctx, _input: { cushionCents: number }): Promise<void> => {
  throw new Error('not implemented');
};
