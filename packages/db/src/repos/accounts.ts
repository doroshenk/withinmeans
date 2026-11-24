import type { Selectable } from 'kysely';
import { assertCanWrite, InvalidInput, NotFound, type HouseholdContext } from '../context.js';
import type { AccountsTable, AccountType, Database } from '../db.js';
import { assertCents, assertDate, cleanName, inTransaction, mustHaveChanged } from './shared.js';

export type Account = Selectable<AccountsTable>;
export type AccountWithBalance = Account & { balance_cents: number | null };

export interface NewAccountWithBalance {
  name: string;
  type: AccountType;
  balanceCents: number;
  /** 'YYYY-MM-DD': the date of the first snapshot. */
  date: string;
}

export const accounts = {
  async list(
    db: Database,
    ctx: HouseholdContext,
    options: { includeArchived?: boolean } = {},
  ): Promise<Account[]> {
    let query = db.selectFrom('accounts').selectAll().where('household_id', '=', ctx.householdId);
    if (options.includeArchived !== true) query = query.where('archived_at', 'is', null);
    return query.orderBy('created_at').orderBy('id').execute();
  },

  async create(
    db: Database,
    ctx: HouseholdContext,
    input: { name: string; type: AccountType },
  ): Promise<Account> {
    assertCanWrite(ctx);
    return db
      .insertInto('accounts')
      .values({
        household_id: ctx.householdId,
        name: cleanName(input.name),
        type: input.type,
        archived_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /** Active accounts with their latest balance (null when there is no snapshot yet). */
  async listWithBalance(db: Database, ctx: HouseholdContext): Promise<AccountWithBalance[]> {
    const rows = await accounts.list(db, ctx);
    if (rows.length === 0) return [];
    const snapshots = await db
      .selectFrom('balance_snapshots')
      .select(['account_id', 'balance_cents'])
      .where('household_id', '=', ctx.householdId)
      .where(
        'account_id',
        'in',
        rows.map((r) => r.id),
      )
      .orderBy('date', 'desc')
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((account) => {
      const latest = snapshots.find((s) => s.account_id === account.id);
      return {
        ...account,
        balance_cents: latest === undefined ? null : Number(latest.balance_cents),
      };
    });
  },

  /**
   * Spec §3 step 2: the account and its first BalanceSnapshot in one transaction. The household's
   * first checking account becomes the primary checking account.
   */
  async createWithBalance(
    db: Database,
    ctx: HouseholdContext,
    input: NewAccountWithBalance,
  ): Promise<Account> {
    assertCanWrite(ctx);
    const name = cleanName(input.name);
    assertDate(input.date);
    assertCents(input.balanceCents);
    return inTransaction(db, async (trx) => {
      // Touch the household row so two adds at once conflict and retry (DSQL optimistic
      // concurrency); otherwise both could read "no primary yet" and both become primary.
      await trx
        .updateTable('households')
        .set({ id: ctx.householdId })
        .where('id', '=', ctx.householdId)
        .execute();
      const primary = await trx
        .selectFrom('accounts')
        .select('id')
        .where('household_id', '=', ctx.householdId)
        .where('is_primary_checking', '=', true)
        .where('archived_at', 'is', null)
        .executeTakeFirst();
      const account = await trx
        .insertInto('accounts')
        .values({
          household_id: ctx.householdId,
          name,
          type: input.type,
          is_primary_checking: input.type === 'checking' && primary === undefined,
          archived_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('balance_snapshots')
        .values({
          household_id: ctx.householdId,
          account_id: account.id,
          date: input.date,
          balance_cents: input.balanceCents,
          note: '',
        })
        .execute();
      return account;
    });
  },

  async rename(db: Database, ctx: HouseholdContext, id: string, name: string): Promise<void> {
    assertCanWrite(ctx);
    const result = await db
      .updateTable('accounts')
      .set({ name: cleanName(name) })
      .where('id', '=', id)
      .where('household_id', '=', ctx.householdId)
      .executeTakeFirst();
    mustHaveChanged(result.numUpdatedRows, 'Account');
  },

  /** Makes this checking account the household's only primary one, in one transaction. */
  async setPrimaryChecking(db: Database, ctx: HouseholdContext, id: string): Promise<void> {
    assertCanWrite(ctx);
    await inTransaction(db, async (trx) => {
      const account = await trx
        .selectFrom('accounts')
        .select(['type', 'archived_at'])
        .where('id', '=', id)
        .where('household_id', '=', ctx.householdId)
        .executeTakeFirst();
      if (account === undefined) throw new NotFound('Account not found');
      if (account.type !== 'checking') {
        throw new InvalidInput('Only a checking account can be the primary checking account');
      }
      if (account.archived_at !== null) {
        throw new InvalidInput('An archived account cannot be the primary checking account');
      }
      await trx
        .updateTable('accounts')
        .set({ is_primary_checking: false })
        .where('household_id', '=', ctx.householdId)
        .where('is_primary_checking', '=', true)
        .execute();
      await trx
        .updateTable('accounts')
        .set({ is_primary_checking: true })
        .where('id', '=', id)
        .where('household_id', '=', ctx.householdId)
        .execute();
    });
  },

  /** Archives the account. If it was the primary checking account, the next checking one is. */
  async archive(db: Database, ctx: HouseholdContext, id: string): Promise<void> {
    assertCanWrite(ctx);
    await inTransaction(db, async (trx) => {
      const result = await trx
        .updateTable('accounts')
        .set({ archived_at: new Date(), is_primary_checking: false })
        .where('id', '=', id)
        .where('household_id', '=', ctx.householdId)
        .returning('id')
        .executeTakeFirst();
      if (result === undefined) throw new NotFound('Account not found');
      const stillPrimary = await trx
        .selectFrom('accounts')
        .select('id')
        .where('household_id', '=', ctx.householdId)
        .where('is_primary_checking', '=', true)
        .where('archived_at', 'is', null)
        .executeTakeFirst();
      if (stillPrimary !== undefined) return;
      const next = await trx
        .selectFrom('accounts')
        .select('id')
        .where('household_id', '=', ctx.householdId)
        .where('type', '=', 'checking')
        .where('archived_at', 'is', null)
        .orderBy('created_at')
        .orderBy('id')
        .executeTakeFirst();
      if (next === undefined) return;
      await trx
        .updateTable('accounts')
        .set({ is_primary_checking: true })
        .where('id', '=', next.id)
        .where('household_id', '=', ctx.householdId)
        .execute();
    });
  },
};
