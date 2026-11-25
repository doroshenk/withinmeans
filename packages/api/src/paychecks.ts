import type { PayFrequency } from '@withinmeans/domain';
import type { MemberContext } from './invitePartner.js';

type Ctx = Pick<MemberContext, 'db' | 'household' | 'clock'>;

export interface PayScheduleView {
  id: string;
  name: string;
  frequency: PayFrequency;
  anchorDate: string;
  semimonthlyDays: [number, number] | null;
  usualCents: number;
  accountId: string | null;
  endedOn: string | null;
}

export interface PaycheckView {
  id: string;
  scheduleId: string;
  scheduleName: string;
  expectedDate: string;
  expectedCents: number;
  receivedDate: string | null;
  receivedCents: number | null;
}

export async function listPaySchedules(_ctx: Ctx): Promise<PayScheduleView[]> {
  throw new Error('not implemented');
}

export async function listPaychecks(_ctx: Ctx, _ym: string): Promise<PaycheckView[]> {
  throw new Error('not implemented');
}

export async function addPaySchedule(_ctx: Ctx, _input: unknown): Promise<{ id: string }> {
  throw new Error('not implemented');
}

export async function stopPaySchedule(_ctx: Ctx, _input: unknown): Promise<void> {
  throw new Error('not implemented');
}

export async function restartPaySchedule(_ctx: Ctx, _input: unknown): Promise<void> {
  throw new Error('not implemented');
}

export async function markPaycheckReceived(_ctx: Ctx, _input: unknown): Promise<void> {
  throw new Error('not implemented');
}
