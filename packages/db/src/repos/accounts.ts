import type { Selectable } from 'kysely';
import { assertCanWrite, InvalidInput, NotFound, type HouseholdContext } from '../context.js';
import type { AccountsTable, AccountType, Database } from '../db.js';
import { cleanName, inTransaction, mustHaveChanged } from './shared.js';

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
  async listWithBalance(_db: Database, _ctx: HouseholdContext): Promise<AccountWithBalance[]> {
    throw new Error('not implemented');
  },

  /**
   * Spec section 3 step 2: the account and its first BalanceSnapshot in one transaction. The
   * household's first checking account becomes the primary checking account.
   */
  async createWithBalance(
    _db: Database,
    _ctx: HouseholdContext,
    _input: NewAccountWithBalance,
  ): Promise<Account> {
    throw new Error('not implemented');
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

  async archive(db: Database, ctx: HouseholdContext, id: string): Promise<void> {
    assertCanWrite(ctx);
    const result = await db
      .updateTable('accounts')
      .set({ archived_at: new Date() })
      .where('id', '=', id)
      .where('household_id', '=', ctx.householdId)
      .executeTakeFirst();
    mustHaveChanged(result.numUpdatedRows, 'Account');
  },
};
