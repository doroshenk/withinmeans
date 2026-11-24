import { households, months } from '@withinmeans/db';
import { firstMonthFor, firstMonthOptions as optionsFor, today } from '@withinmeans/domain';
import { translated } from './errors.js';
import type { MemberContext } from './invitePartner.js';

type Ctx = Pick<MemberContext, 'db' | 'household' | 'clock'>;

export interface FirstMonthOptions {
  thisMonth: string;
  nextMonth: string;
  /** The household's saved first month. */
  firstMonth: string;
  /** True once that month has been opened (the choice is made). */
  opened: boolean;
}

async function mine(ctx: Ctx) {
  const household = await households.getMine(ctx.db, ctx.household);
  if (household === undefined) throw new Error('Household not found');
  return household;
}

/** Spec §3 step 1: the two months to pick from, in the household's time zone. */
export async function firstMonthOptions(ctx: Ctx): Promise<FirstMonthOptions> {
  const household = await mine(ctx);
  const open = await months.get(ctx.db, ctx.household, household.first_month);
  return {
    ...optionsFor(today(ctx.clock, household.timezone)),
    firstMonth: household.first_month,
    opened: open !== undefined,
  };
}

/** Spec §3 step 1: sets the first month and calls `openMonth`, in one transaction. */
export const startFirstMonth = (ctx: Ctx, input: { choice: 'this' | 'next' }) =>
  translated(async () => {
    const household = await mine(ctx);
    const firstMonth = firstMonthFor(input.choice, today(ctx.clock, household.timezone));
    const startedAt = new Date(ctx.clock.now().epochMilliseconds);
    await households.startFirstMonth(ctx.db, ctx.household, firstMonth, startedAt);
    return { firstMonth };
  });
