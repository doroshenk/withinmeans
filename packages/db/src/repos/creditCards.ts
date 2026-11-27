import { MAX_CARD_DUE_DAY, nicknameError, USUAL_PLANS, type UsualPlan } from '@withinmeans/domain';
import type { Selectable, Transaction } from 'kysely';
import { assertCanWrite, InvalidInput, NotFound, type HouseholdContext } from '../context.js';
import type { CreditCardsTable, Database, DB } from '../db.js';
import { inTransaction } from './shared.js';

export type CreditCard = Selectable<CreditCardsTable>;

export interface NewCreditCard {
  nickname: string;
  dueDay: number;
  usualPlan: UsualPlan;
}

/**
 * The household's card, locked so that removing it and saving its statement can't both slip past
 * each other. Another household's card looks missing.
 */
export async function lockCard(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  id: string,
): Promise<CreditCard> {
  const card = await trx
    .selectFrom('credit_cards')
    .selectAll()
    .where('id', '=', id)
    .where('household_id', '=', ctx.householdId)
    .forUpdate()
    .executeTakeFirst();
  if (card === undefined) throw new NotFound('Card not found');
  return card;
}

export const creditCards = {
  /** The cards still in use (all of them with `includeArchived`), by due day then nickname. */
  async list(
    db: Database,
    ctx: HouseholdContext,
    options: { includeArchived?: boolean } = {},
  ): Promise<CreditCard[]> {
    let query = db
      .selectFrom('credit_cards')
      .selectAll()
      .where('household_id', '=', ctx.householdId);
    if (options.includeArchived !== true) query = query.where('archived_at', 'is', null);
    return query.orderBy('due_day').orderBy('nickname').orderBy('id').execute();
  },

  async create(db: Database, ctx: HouseholdContext, input: NewCreditCard): Promise<CreditCard> {
    assertCanWrite(ctx);
    const nickname = input.nickname.trim();
    const problem = nicknameError(nickname);
    if (problem !== undefined) throw new InvalidInput(problem);
    const { dueDay, usualPlan } = input;
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > MAX_CARD_DUE_DAY) {
      throw new InvalidInput('due day must be a whole number from 1 to 31');
    }
    if (!USUAL_PLANS.includes(usualPlan)) throw new InvalidInput('unknown usual payment');
    return db
      .insertInto('credit_cards')
      .values({
        household_id: ctx.householdId,
        nickname,
        due_day: dueDay,
        usual_plan: usualPlan,
        archived_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /** Deletes a card with no statements; one with statements is archived, so they stay. */
  async remove(db: Database, ctx: HouseholdContext, id: string, at: Date): Promise<void> {
    assertCanWrite(ctx);
    await inTransaction(db, async (trx) => {
      await lockCard(trx, ctx, id);
      const used = await trx
        .selectFrom('card_statements')
        .select('id')
        .where('household_id', '=', ctx.householdId)
        .where('card_id', '=', id)
        .limit(1)
        .executeTakeFirst();
      if (used === undefined) {
        await trx
          .deleteFrom('credit_cards')
          .where('id', '=', id)
          .where('household_id', '=', ctx.householdId)
          .execute();
      } else {
        await trx
          .updateTable('credit_cards')
          .set({ archived_at: at })
          .where('id', '=', id)
          .where('household_id', '=', ctx.householdId)
          .execute();
      }
    });
  },
};
