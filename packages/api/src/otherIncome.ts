import { accounts, otherIncome, type OtherIncome } from '@withinmeans/db';
import {
  recentSources,
  type addOtherIncomeInput,
  type OtherIncomeItem,
  type RecentSource,
} from '@withinmeans/domain';
import type { z } from 'zod';
import { translated } from './errors.js';
import { householdToday } from './householdToday.js';
import type { MemberContext } from './invitePartner.js';

type Ctx = Pick<MemberContext, 'db' | 'household' | 'clock'>;

export type OtherIncomeView = OtherIncomeItem & {
  /** The account it went into, even one since removed. */
  accountName: string | null;
};

export interface OtherIncomePageView {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  /** The month listed. */
  ym: string;
  entries: OtherIncomeView[];
  recent: RecentSource[];
  /** The accounts money can be deposited into. */
  accounts: { id: string; name: string; isPrimary: boolean }[];
}

/** Spec §6.4: a month's one-time income, this month when none is given. */
export async function listOtherIncome(ctx: Ctx, ym?: string): Promise<OtherIncomePageView> {
  const date = await householdToday(ctx);
  const month = ym ?? date.slice(0, 7);
  const [rows, latest, allAccounts] = await Promise.all([
    otherIncome.listForMonth(ctx.db, ctx.household, month),
    otherIncome.listRecent(ctx.db, ctx.household),
    accounts.list(ctx.db, ctx.household, { includeArchived: true }),
  ]);
  const names = new Map(allAccounts.map((a) => [a.id, a.name]));
  const itemOf = (row: OtherIncome): OtherIncomeItem => ({
    id: row.id,
    date: row.date,
    source: row.source,
    type: row.type,
    amountCents: Number(row.amount_cents),
    accountId: row.account_id,
    note: row.note,
  });
  return {
    today: date,
    ym: month,
    entries: rows.map((row) => ({
      ...itemOf(row),
      accountName: row.account_id === null ? null : (names.get(row.account_id) ?? null),
    })),
    recent: recentSources(latest.map(itemOf)),
    accounts: allAccounts
      .filter((a) => a.archived_at === null && a.type !== 'brokerage')
      .map((a) => ({ id: a.id, name: a.name, isPrimary: a.is_primary_checking })),
  };
}

export const addOtherIncome = (ctx: Ctx, input: z.infer<typeof addOtherIncomeInput>) =>
  translated(async () => {
    const { accountId, note, ...rest } = input;
    const row = await otherIncome.create(ctx.db, ctx.household, {
      ...rest,
      ...(accountId !== undefined && { accountId }),
      ...(note !== undefined && { note }),
    });
    return { id: row.id };
  });

export const removeOtherIncome = (ctx: Ctx, input: { id: string }) =>
  translated(() => otherIncome.remove(ctx.db, ctx.household, input.id));
