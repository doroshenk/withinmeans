import type { Selectable } from 'kysely';
import type { HouseholdContext } from '../context.js';
import type { Database, SetupProgressTable } from '../db.js';

export type SetupProgressRow = Selectable<SetupProgressTable>;

export const setupProgress = {
  async list(_db: Database, _ctx: HouseholdContext): Promise<SetupProgressRow[]> {
    throw new Error('not implemented');
  },
  async save(
    _db: Database,
    _ctx: HouseholdContext,
    _step: number,
    _status: 'done' | 'skipped',
  ): Promise<SetupProgressRow> {
    throw new Error('not implemented');
  },
};
