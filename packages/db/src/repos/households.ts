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

  async remove(db: Database, ctx: HouseholdContext): Promise<void> {
    assertCanWrite(ctx);
    await db.deleteFrom('households').where('id', '=', ctx.householdId).execute();
  },
};
