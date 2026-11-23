import type { Selectable } from 'kysely';
import type { HouseholdContext } from '../context.js';
import type { AccountsTable, AccountType, Database } from '../db.js';
import { notImplemented } from './notImplemented.js';

export type Account = Selectable<AccountsTable>;

export const accounts = {
  list(
    _db: Database,
    _ctx: HouseholdContext,
    _options?: { includeArchived?: boolean },
  ): Promise<Account[]> {
    return notImplemented();
  },
  create(
    _db: Database,
    _ctx: HouseholdContext,
    _input: { name: string; type: AccountType },
  ): Promise<Account> {
    return notImplemented();
  },
  rename(_db: Database, _ctx: HouseholdContext, _id: string, _name: string): Promise<void> {
    return notImplemented();
  },
  /** Makes this checking account the household's only primary one, in one transaction. */
  setPrimaryChecking(_db: Database, _ctx: HouseholdContext, _id: string): Promise<void> {
    return notImplemented();
  },
  archive(_db: Database, _ctx: HouseholdContext, _id: string): Promise<void> {
    return notImplemented();
  },
};
