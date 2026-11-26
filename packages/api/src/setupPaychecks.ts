import type { PayScheduleView } from './paychecks.js';
import type { BillsContext } from './setupBills.js';

export interface SetupPaychecksView {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  schedules: PayScheduleView[];
}

export async function listSetupPaychecks(_ctx: BillsContext): Promise<SetupPaychecksView> {
  throw new Error('not implemented');
}

export async function removePaySchedule(_ctx: BillsContext, _input: { id: string }): Promise<void> {
  throw new Error('not implemented');
}
