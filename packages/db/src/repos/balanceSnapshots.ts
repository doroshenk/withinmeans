import type { Selectable } from 'kysely';
import type { HouseholdContext } from '../context.js';
import type { BalanceSnapshotsTable, Database } from '../db.js';
import { notImplemented } from './notImplemented.js';

export type BalanceSnapshot = Selectable<BalanceSnapshotsTable>;

export interface NewBalanceSnapshot {
  accountId: string;
  /** 'YYYY-MM-DD' */
  date: string;
  balanceCents: number;
  note: string;
}

export const balanceSnapshots = {
  add(_db: Database, _ctx: HouseholdContext, _input: NewBalanceSnapshot): Promise<BalanceSnapshot> {
    return notImplemented();
  },
  /** Newest date first. */
  listForAccount(
    _db: Database,
    _ctx: HouseholdContext,
    _accountId: string,
  ): Promise<BalanceSnapshot[]> {
    return notImplemented();
  },
  latest(
    _db: Database,
    _ctx: HouseholdContext,
    _accountId: string,
  ): Promise<BalanceSnapshot | undefined> {
    return notImplemented();
  },
};
