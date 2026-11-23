import type { Selectable } from 'kysely';
import { assertCanWrite, NotFound, type HouseholdContext } from '../context.js';
import type { BalanceSnapshotsTable, Database } from '../db.js';
import { assertCents, assertDate } from './shared.js';

export type BalanceSnapshot = Selectable<BalanceSnapshotsTable>;

export interface NewBalanceSnapshot {
  accountId: string;
  /** 'YYYY-MM-DD' */
  date: string;
  balanceCents: number;
  note: string;
}

export const balanceSnapshots = {
  async add(
    db: Database,
    ctx: HouseholdContext,
    input: NewBalanceSnapshot,
  ): Promise<BalanceSnapshot> {
    assertCanWrite(ctx);
    assertDate(input.date);
    assertCents(input.balanceCents);
    const account = await db
      .selectFrom('accounts')
      .select('id')
      .where('id', '=', input.accountId)
      .where('household_id', '=', ctx.householdId)
      .executeTakeFirst();
    if (account === undefined) throw new NotFound('Account not found');
    return db
      .insertInto('balance_snapshots')
      .values({
        household_id: ctx.householdId,
        account_id: input.accountId,
        date: input.date,
        balance_cents: input.balanceCents,
        note: input.note,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /** Newest date first. */
  async listForAccount(
    db: Database,
    ctx: HouseholdContext,
    accountId: string,
  ): Promise<BalanceSnapshot[]> {
    return db
      .selectFrom('balance_snapshots')
      .selectAll()
      .where('household_id', '=', ctx.householdId)
      .where('account_id', '=', accountId)
      .orderBy('date', 'desc')
      .orderBy('created_at', 'desc')
      .execute();
  },

  async latest(
    db: Database,
    ctx: HouseholdContext,
    accountId: string,
  ): Promise<BalanceSnapshot | undefined> {
    return (await balanceSnapshots.listForAccount(db, ctx, accountId))[0];
  },
};
