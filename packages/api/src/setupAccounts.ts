import { TRPCError } from '@trpc/server';
import { accounts, households } from '@withinmeans/db';
import { setupAccountsError, today } from '@withinmeans/domain';
import { translated } from './errors.js';
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
export async function listSetupAccounts(ctx: Ctx): Promise<SetupAccountsView> {
  const [rows, household] = await Promise.all([
    accounts.listWithBalance(ctx.db, ctx.household),
    households.getMine(ctx.db, ctx.household),
  ]);
  if (household === undefined) throw new Error('Household not found');
  return {
    accounts: rows.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balanceCents: a.balance_cents,
      isPrimaryChecking: a.is_primary_checking,
    })),
    cushionCents: Number(household.cushion_cents),
  };
}

/** Spec §3 step 2: the account and its balance today (the first BalanceSnapshot). */
export const addSetupAccount = (
  ctx: Ctx,
  input: { name: string; type: 'checking' | 'savings' | 'cash'; balanceCents: number },
) =>
  translated(async () => {
    const household = await households.getMine(ctx.db, ctx.household);
    if (household === undefined) throw new Error('Household not found');
    const date = today(ctx.clock, household.timezone).toString();
    const row = await accounts.createWithBalance(ctx.db, ctx.household, { ...input, date });
    return { id: row.id };
  });

export const removeSetupAccount = (ctx: Ctx, input: { id: string }) =>
  translated(() => accounts.archive(ctx.db, ctx.household, input.id));

export const saveCushion = (ctx: Ctx, input: { cushionCents: number }) =>
  translated(() => households.setCushion(ctx.db, ctx.household, input.cushionCents));

/** Spec §3 step 2: the step cannot be finished without at least one account. */
export async function requireAccounts(ctx: Ctx): Promise<void> {
  const message = setupAccountsError((await accounts.list(ctx.db, ctx.household)).length);
  if (message !== undefined) throw new TRPCError({ code: 'CONFLICT', message });
}
