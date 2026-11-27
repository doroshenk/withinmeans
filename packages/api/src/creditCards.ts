import { cardStatements, creditCards } from '@withinmeans/db';
import {
  addMonths,
  cardMonthRows,
  type addCreditCardInput,
  type CardRow,
  type markCardPaidInput,
  type saveCardStatementInput,
  type unmarkCardPaidInput,
  type UsualPlan,
} from '@withinmeans/domain';
import type { z } from 'zod';
import { translated } from './errors.js';
import type { MemberContext } from './invitePartner.js';

type Ctx = Pick<MemberContext, 'db' | 'household' | 'clock'>;

export interface CreditCardView {
  id: string;
  nickname: string;
  dueDay: number;
  usualPlan: UsualPlan;
}

const now = (ctx: Ctx) => new Date(ctx.clock.now().epochMilliseconds);

/** Spec §3 step 6: the cards still in use. */
export async function listCreditCards(ctx: Ctx): Promise<CreditCardView[]> {
  const rows = await creditCards.list(ctx.db, ctx.household);
  return rows.map((c) => ({
    id: c.id,
    nickname: c.nickname,
    dueDay: c.due_day,
    usualPlan: c.usual_plan,
  }));
}

/** Spec §5.10: a month's card rows, with what last month carried. */
export async function monthCards(ctx: Ctx, ym: string): Promise<CardRow[]> {
  const [cards, statements] = await Promise.all([
    creditCards.list(ctx.db, ctx.household, { includeArchived: true }),
    cardStatements.listForMonths(ctx.db, ctx.household, [addMonths(ym, -1), ym]),
  ]);
  return cardMonthRows(
    cards.map((c) => ({
      id: c.id,
      nickname: c.nickname,
      dueDay: c.due_day,
      usualPlan: c.usual_plan,
      archived: c.archived_at !== null,
    })),
    statements.map((s) => ({
      cardId: s.card_id,
      ym: s.ym,
      statementCents: Number(s.statement_cents),
      minimumCents: Number(s.minimum_cents),
      plannedPaymentCents: Number(s.planned_payment_cents),
      paidCents: s.paid_cents === null ? null : Number(s.paid_cents),
      dueDate: s.due_date,
    })),
    ym,
  );
}

export const addCreditCard = (ctx: Ctx, input: z.infer<typeof addCreditCardInput>) =>
  translated(async () => {
    const row = await creditCards.create(ctx.db, ctx.household, input);
    return { id: row.id };
  });

export const removeCreditCard = (ctx: Ctx, input: { id: string }) =>
  translated(() => creditCards.remove(ctx.db, ctx.household, input.id, now(ctx)));

export const saveCardStatement = (ctx: Ctx, input: z.infer<typeof saveCardStatementInput>) =>
  translated(() => {
    const { alreadyPaid, dueDate, ...statement } = input;
    return cardStatements.save(
      ctx.db,
      ctx.household,
      {
        ...statement,
        ...(alreadyPaid !== undefined && { alreadyPaid }),
        ...(dueDate !== undefined && { dueDate }),
      },
      now(ctx),
    );
  });

export const markCardPaid = (ctx: Ctx, input: z.infer<typeof markCardPaidInput>) =>
  translated(() =>
    cardStatements.markPaid(
      ctx.db,
      ctx.household,
      input.cardId,
      input.ym,
      input.paidCents,
      now(ctx),
    ),
  );

export const unmarkCardPaid = (ctx: Ctx, input: z.infer<typeof unmarkCardPaidInput>) =>
  translated(() => cardStatements.unmarkPaid(ctx.db, ctx.household, input.cardId, input.ym));
