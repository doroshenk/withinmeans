import { cardDueDate, cardDueDateError, MAX_CARD_CENTS, statementError } from '@withinmeans/domain';
import type { Selectable, Transaction } from 'kysely';
import { assertCanWrite, InvalidInput, NotFound, type HouseholdContext } from '../context.js';
import type { CardStatementsTable, Database, DB } from '../db.js';
import { lockCard } from './creditCards.js';
import { assertMonthNotClosed, assertYm, inTransaction } from './shared.js';

export type CardStatement = Selectable<CardStatementsTable>;

export interface NewStatement {
  cardId: string;
  ym: string;
  statementCents: number;
  minimumCents: number;
  plannedPaymentCents: number;
  /** Records the planned amount as paid, unless something was already paid. */
  alreadyPaid?: boolean;
  /** 'YYYY-MM-DD' in month `ym`. Left out, the statement keeps the date it has. */
  dueDate?: string;
}

/** The card's statement for the month, or undefined when no balance is entered. */
function find(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  cardId: string,
  ym: string,
): Promise<CardStatement | undefined> {
  return trx
    .selectFrom('card_statements')
    .selectAll()
    .where('household_id', '=', ctx.householdId)
    .where('card_id', '=', cardId)
    .where('ym', '=', ym)
    .forUpdate()
    .executeTakeFirst();
}

/** Records or clears what was paid on a statement in a month that can still change. */
async function setPaid(
  db: Database,
  ctx: HouseholdContext,
  cardId: string,
  ym: string,
  paid: { cents: number; at: Date } | null,
): Promise<void> {
  assertCanWrite(ctx);
  assertYm(ym);
  await inTransaction(db, async (trx) => {
    await assertMonthNotClosed(trx, ctx, ym);
    const statement = await find(trx, ctx, cardId, ym);
    if (statement === undefined) throw new NotFound('Statement not found');
    await trx
      .updateTable('card_statements')
      .set({ paid_cents: paid?.cents ?? null, paid_at: paid?.at ?? null })
      .where('id', '=', statement.id)
      .where('household_id', '=', ctx.householdId)
      .execute();
  });
}

export const cardStatements = {
  async listForMonths(
    db: Database,
    ctx: HouseholdContext,
    yms: readonly string[],
  ): Promise<CardStatement[]> {
    yms.forEach((ym) => assertYm(ym));
    return db
      .selectFrom('card_statements')
      .selectAll()
      .where('household_id', '=', ctx.householdId)
      .where('ym', 'in', yms)
      .orderBy('ym')
      .orderBy('card_id')
      .execute();
  },

  /** Adds or replaces the month's balance for a card. What was paid stays. */
  async save(db: Database, ctx: HouseholdContext, input: NewStatement, now: Date): Promise<void> {
    assertCanWrite(ctx);
    assertYm(input.ym);
    const { cardId, ym, dueDate } = input;
    const problem =
      statementError(input) ?? (dueDate === undefined ? undefined : cardDueDateError(ym, dueDate));
    if (problem !== undefined) throw new InvalidInput(problem);
    const entered = {
      statement_cents: input.statementCents,
      minimum_cents: input.minimumCents,
      planned_payment_cents: input.plannedPaymentCents,
    };
    await inTransaction(db, async (trx) => {
      const card = await lockCard(trx, ctx, cardId);
      await assertMonthNotClosed(trx, ctx, ym);
      const existing = await find(trx, ctx, cardId, ym);
      // An empty date already means the card's own, so that one is not written. A deploy runs this
      // code before the migration that adds the column, and such a save must still work then.
      const keepsCardDay =
        (existing?.due_date ?? null) === null && dueDate === cardDueDate(ym, card.due_day);
      const due = dueDate === undefined || keepsCardDay ? {} : { due_date: dueDate };
      const payNow = input.alreadyPaid === true && (existing?.paid_at ?? null) === null;
      const paid = payNow ? { paid_cents: input.plannedPaymentCents, paid_at: now } : {};
      if (existing !== undefined) {
        await trx
          .updateTable('card_statements')
          .set({ ...entered, ...due, ...paid })
          .where('id', '=', existing.id)
          .where('household_id', '=', ctx.householdId)
          .execute();
        return;
      }
      if (card.archived_at !== null) throw new InvalidInput('that card was removed');
      await trx
        .insertInto('card_statements')
        .values({
          household_id: ctx.householdId,
          card_id: cardId,
          ym,
          ...entered,
          ...due,
          paid_cents: null,
          paid_at: null,
          ...paid,
        })
        .execute();
    });
  },

  async markPaid(
    db: Database,
    ctx: HouseholdContext,
    cardId: string,
    ym: string,
    paidCents: number,
    at: Date,
  ): Promise<void> {
    assertCanWrite(ctx);
    if (!Number.isSafeInteger(paidCents) || paidCents < 0 || paidCents > MAX_CARD_CENTS) {
      throw new InvalidInput('the amount paid must be from $0 to $100,000,000');
    }
    await setPaid(db, ctx, cardId, ym, { cents: paidCents, at });
  },

  async unmarkPaid(db: Database, ctx: HouseholdContext, cardId: string, ym: string): Promise<void> {
    await setPaid(db, ctx, cardId, ym, null);
  },
};
