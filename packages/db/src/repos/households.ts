import type { Selectable } from 'kysely';
import { assertCanWrite, Conflict, type HouseholdContext } from '../context.js';
import type { Database, HouseholdsTable } from '../db.js';
import { openMonthIn } from './openMonth.js';
import { assertYm, inTransaction } from './shared.js';

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
    db: Database,
    ctx: HouseholdContext,
    ym: string,
    startedAt: Date,
  ): Promise<{ created: boolean }> {
    assertCanWrite(ctx);
    assertYm(ym);
    return inTransaction(db, async (trx) => {
      const other = await trx
        .selectFrom('months')
        .select('ym')
        .where('household_id', '=', ctx.householdId)
        .where('ym', '<>', ym)
        .executeTakeFirst();
      if (other !== undefined) throw new Conflict(`Month ${other.ym} is already open`);
      const { created } = await openMonthIn(trx, ctx, ym, startedAt);
      await trx
        .updateTable('households')
        .set({ first_month: ym })
        .where('id', '=', ctx.householdId)
        .execute();
      return { created };
    });
  },

  async remove(db: Database, ctx: HouseholdContext): Promise<void> {
    assertCanWrite(ctx);
    await db.deleteFrom('households').where('id', '=', ctx.householdId).execute();
  },
};
