import type { Selectable } from 'kysely';
import type { HouseholdContext } from '../context.js';
import type { Database, MonthsTable } from '../db.js';
import { notImplemented } from './notImplemented.js';

export type Month = Selectable<MonthsTable>;

export const months = {
  get(_db: Database, _ctx: HouseholdContext, _ym: string): Promise<Month | undefined> {
    return notImplemented();
  },
  list(_db: Database, _ctx: HouseholdContext): Promise<Month[]> {
    return notImplemented();
  },
  /** Low-level row insert (status open). Only `openMonth(ym)` may call it, from the user's flow. */
  insert(_db: Database, _ctx: HouseholdContext, _ym: string, _startedAt: Date): Promise<Month> {
    return notImplemented();
  },
};
