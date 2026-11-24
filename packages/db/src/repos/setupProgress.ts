import type { Selectable } from 'kysely';
import { assertCanWrite, InvalidInput, type HouseholdContext } from '../context.js';
import type { Database, SetupProgressTable } from '../db.js';
import { inTransaction } from './shared.js';

export type SetupProgressRow = Selectable<SetupProgressTable>;

export const setupProgress = {
  async list(db: Database, ctx: HouseholdContext): Promise<SetupProgressRow[]> {
    return db
      .selectFrom('setup_progress')
      .selectAll()
      .where('household_id', '=', ctx.householdId)
      .orderBy('step')
      .execute();
  },

  /** Saves (or re-saves) a step as done or skipped; one row per household and step. */
  async save(
    db: Database,
    ctx: HouseholdContext,
    step: number,
    status: 'done' | 'skipped',
  ): Promise<SetupProgressRow> {
    assertCanWrite(ctx);
    if (!Number.isInteger(step) || step < 1 || step > 9) {
      throw new InvalidInput('step must be a whole number from 1 to 9');
    }
    return inTransaction(db, (trx) =>
      trx
        .insertInto('setup_progress')
        .values({ household_id: ctx.householdId, step, status })
        .onConflict((oc) =>
          oc.columns(['household_id', 'step']).doUpdateSet({ status, updated_at: new Date() }),
        )
        .returningAll()
        .executeTakeFirstOrThrow(),
    );
  },
};
