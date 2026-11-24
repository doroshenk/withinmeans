import type { Selectable } from 'kysely';
import { assertCanWrite, type HouseholdContext } from '../context.js';
import type { Database, HouseholdsTable } from '../db.js';

export const households = {
  async getMine(
    db: Database,
    ctx: HouseholdContext,
  ): Promise<Selectable<HouseholdsTable> | undefined> {
    return db
      .selectFrom('households')
      .selectAll()
      .where('id', '=', ctx.householdId)
      .executeTakeFirst();
  },

  async rename(db: Database, ctx: HouseholdContext, name: string): Promise<void> {
    assertCanWrite(ctx);
    await db.updateTable('households').set({ name }).where('id', '=', ctx.householdId).execute();
  },

  /**
   * Spec �3 step 1: sets `first_month` and opens that month, in one transaction. Choosing the same
   * month again is fine; a different month once one is open is a Conflict.
   */
  async startFirstMonth(
    _db: Database,
    _ctx: HouseholdContext,
    _ym: string,
    _startedAt: Date,
  ): Promise<{ created: boolean }> {
    throw new Error('not implemented');
  },

  async remove(db: Database, ctx: HouseholdContext): Promise<void> {
    assertCanWrite(ctx);
    await db.deleteFrom('households').where('id', '=', ctx.householdId).execute();
  },
};
