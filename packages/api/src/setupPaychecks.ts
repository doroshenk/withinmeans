import { paySchedules } from '@withinmeans/db';
import { today } from '@withinmeans/domain';
import { translated } from './errors.js';
import { listPaySchedules, type PayScheduleView } from './paychecks.js';
import { myHousehold, type BillsContext } from './setupBills.js';

export interface SetupPaychecksView {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  schedules: PayScheduleView[];
}

/** Spec §3 step 3: the schedules, and today for their next paydays. */
export async function listSetupPaychecks(ctx: BillsContext): Promise<SetupPaychecksView> {
  const [household, schedules] = await Promise.all([myHousehold(ctx), listPaySchedules(ctx)]);
  return { today: today(ctx.clock, household.timezone).toString(), schedules };
}

export const removePaySchedule = (ctx: BillsContext, input: { id: string }) =>
  translated(async () => {
    await paySchedules.remove(ctx.db, ctx.household, input.id);
  });
