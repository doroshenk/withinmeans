import type { HouseholdContext } from '../context.js';
import type { Database } from '../db.js';

/** One array of rows per household-scoped table, keyed by the table's name. */
export type HouseholdTables = Record<string, Record<string, unknown>[]>;

export const householdExport = {
  async read(_db: Database, _ctx: HouseholdContext): Promise<HouseholdTables> {
    throw new Error('not implemented');
  },

  async listContexts(_db: Database): Promise<HouseholdContext[]> {
    throw new Error('not implemented');
  },
};
