import type { Selectable } from 'kysely';
import { assertCanWrite, type HouseholdContext } from '../context.js';
import type { Database, MonthsTable } from '../db.js';
import { assertYm, orConflict } from './shared.js';

export type Month = Selectable<MonthsTable>;

export const months = {
  async get(db: Database, ctx: HouseholdContext, ym: string): Promise<Month | undefined> {
    return db
      .selectFrom('months')
      .selectAll()
      .where('household_id', '=', ctx.householdId)
      .where('ym', '=', ym)
      .executeTakeFirst();
  },

  async list(db: Database, ctx: HouseholdContext): Promise<Month[]> {
    return db
      .selectFrom('months')
      .selectAll()
      .where('household_id', '=', ctx.householdId)
      .orderBy('ym')
      .execute();
  },

  /** Low-level row insert (status open). Only `openMonth(ym)` may call it, from the user's flow. */
  async insert(db: Database, ctx: HouseholdContext, ym: string, startedAt: Date): Promise<Month> {
    assertCanWrite(ctx);
    assertYm(ym);
    return orConflict(
      () =>
        db
          .insertInto('months')
          .values({
            household_id: ctx.householdId,
            ym,
            started_at: startedAt,
            closed_at: null,
          })
          .returningAll()
          .executeTakeFirstOrThrow(),
      `Month ${ym} is already open`,
    );
  },
};
