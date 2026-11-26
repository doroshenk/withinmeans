import {
  addMonths,
  MAX_OTHER_INCOME_CENTS,
  OTHER_INCOME_TYPES,
  type OtherIncomeType,
} from '@withinmeans/domain';
import type { Selectable } from 'kysely';
import { assertCanWrite, InvalidInput, NotFound, type HouseholdContext } from '../context.js';
import type { Database, OtherIncomeTable } from '../db.js';
import {
  assertCents,
  assertDate,
  assertMonthNotClosed,
  assertYm,
  cleanName,
  incomeAccountId,
  inTransaction,
} from './shared.js';

export type OtherIncome = Selectable<OtherIncomeTable>;

export interface NewOtherIncome {
  /** 'YYYY-MM-DD' */
  date: string;
  source: string;
  type: OtherIncomeType;
  amountCents: number;
  /** The primary checking account when not given. */
  accountId?: string;
  note?: string;
}

/** Enough entries to find the form's recent sources in. */
const RECENT_ENTRIES = 50;

const newestFirst = (db: Database, ctx: HouseholdContext) =>
  db
    .selectFrom('other_income')
    .selectAll()
    .where('household_id', '=', ctx.householdId)
    .orderBy('date', 'desc')
    .orderBy('created_at', 'desc')
    .orderBy('id');

export const otherIncome = {
  /** The entries dated in month `ym`, newest first. */
  async listForMonth(db: Database, ctx: HouseholdContext, ym: string): Promise<OtherIncome[]> {
    assertYm(ym);
    return newestFirst(db, ctx)
      .where('date', '>=', `${ym}-01`)
      .where('date', '<', `${addMonths(ym, 1)}-01`)
      .execute();
  },

  /** The latest entries from any month. */
  async listRecent(db: Database, ctx: HouseholdContext): Promise<OtherIncome[]> {
    return newestFirst(db, ctx).limit(RECENT_ENTRIES).execute();
  },

  async create(db: Database, ctx: HouseholdContext, input: NewOtherIncome): Promise<OtherIncome> {
    assertCanWrite(ctx);
    assertDate(input.date);
    assertCents(input.amountCents);
    if (input.amountCents <= 0) throw new InvalidInput('the amount must be more than zero');
    if (input.amountCents > MAX_OTHER_INCOME_CENTS) throw new InvalidInput('the amount is too big');
    if (!OTHER_INCOME_TYPES.includes(input.type)) throw new InvalidInput('unknown income type');
    const source = cleanName(input.source);
    const note = input.note?.trim();
    return inTransaction(db, async (trx) => {
      await assertMonthNotClosed(trx, ctx, input.date.slice(0, 7));
      return trx
        .insertInto('other_income')
        .values({
          household_id: ctx.householdId,
          date: input.date,
          source,
          type: input.type,
          amount_cents: input.amountCents,
          account_id: await incomeAccountId(trx, ctx, input.accountId),
          note: note === undefined || note === '' ? null : note,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  async remove(db: Database, ctx: HouseholdContext, id: string): Promise<void> {
    assertCanWrite(ctx);
    await inTransaction(db, async (trx) => {
      const entry = await trx
        .selectFrom('other_income')
        .select('date')
        .where('id', '=', id)
        .where('household_id', '=', ctx.householdId)
        .executeTakeFirst();
      if (entry === undefined) throw new NotFound('Income not found');
      await assertMonthNotClosed(trx, ctx, entry.date.slice(0, 7));
      await trx
        .deleteFrom('other_income')
        .where('id', '=', id)
        .where('household_id', '=', ctx.householdId)
        .execute();
    });
  },
};
