import { households } from '@withinmeans/db';
import { today } from '@withinmeans/domain';
import type { MemberContext } from './invitePartner.js';

/** Today's date ("YYYY-MM-DD") in the household's time zone. */
export async function householdToday(
  ctx: Pick<MemberContext, 'db' | 'household' | 'clock'>,
): Promise<string> {
  const household = await households.getMine(ctx.db, ctx.household);
  if (household === undefined) throw new Error('Household not found');
  return today(ctx.clock, household.timezone).toString();
}
