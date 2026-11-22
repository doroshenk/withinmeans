import type { HouseholdContext } from '../context.js';
import type { Database, HouseholdsTable } from '../db.js';

export const households = {
  async getMine(_db: Database, _ctx: HouseholdContext): Promise<HouseholdsTable | undefined> {
    throw new Error('not implemented');
  },
  async remove(_db: Database, _ctx: HouseholdContext): Promise<void> {
    throw new Error('not implemented');
  },
  async rename(_db: Database, _ctx: HouseholdContext, _name: string): Promise<void> {
    throw new Error('not implemented');
  },
};
