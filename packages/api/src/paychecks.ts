import { households, paychecks, paySchedules } from '@withinmeans/db';
import {
  monthlyPayCents,
  today,
  type addPayScheduleInput,
  type PayFrequency,
} from '@withinmeans/domain';
import type { z } from 'zod';
import { translated } from './errors.js';
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

/** Spec §5.9: every schedule, running and stopped. */
export async function listPaySchedules(ctx: Ctx): Promise<PayScheduleView[]> {
  const rows = await paySchedules.list(ctx.db, ctx.household);
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    frequency: s.frequency,
    anchorDate: s.anchor_date,
    semimonthlyDays:
      s.semimonthly_day_1 === null || s.semimonthly_day_2 === null
        ? null
        : [s.semimonthly_day_1, s.semimonthly_day_2],
    usualCents: Number(s.usual_cents),
    accountId: s.account_id,
    endedOn: s.ended_on,
  }));
}

/** Take-home pay in a typical month; null when no schedule is running. */
export async function takeHomeCents(ctx: Ctx): Promise<number | null> {
  return monthlyPayCents(await listPaySchedules(ctx));
}

/** The month's paychecks by date, each with its schedule's name. */
export async function listPaychecks(ctx: Ctx, ym: string): Promise<PaycheckView[]> {
  const [rows, schedules] = await Promise.all([
    paychecks.listForMonth(ctx.db, ctx.household, ym),
    paySchedules.list(ctx.db, ctx.household),
  ]);
  const names = new Map(schedules.map((s) => [s.id, s.name]));
  return rows.map((p) => ({
    id: p.id,
    scheduleId: p.schedule_id,
    scheduleName: names.get(p.schedule_id) ?? '',
    expectedDate: p.expected_date,
    expectedCents: Number(p.expected_cents),
    receivedDate: p.received_date,
    receivedCents: p.received_cents === null ? null : Number(p.received_cents),
  }));
}

export const addPaySchedule = (ctx: Ctx, input: z.infer<typeof addPayScheduleInput>) =>
  translated(async () => {
    const { semimonthlyDays, accountId, ...rest } = input;
    const row = await paySchedules.create(ctx.db, ctx.household, {
      ...rest,
      ...(semimonthlyDays !== undefined && { semimonthlyDays }),
      ...(accountId !== undefined && { accountId }),
    });
    return { id: row.id };
  });

/** Today's date in the household's time zone. */
async function householdToday(ctx: Ctx): Promise<string> {
  const household = await households.getMine(ctx.db, ctx.household);
  if (household === undefined) throw new Error('Household not found');
  return today(ctx.clock, household.timezone).toString();
}

export const stopPaySchedule = (ctx: Ctx, input: { id: string }) =>
  translated(async () => {
    await paySchedules.stop(ctx.db, ctx.household, input.id, await householdToday(ctx));
  });

export const restartPaySchedule = (ctx: Ctx, input: { id: string }) =>
  translated(async () => {
    await paySchedules.restart(ctx.db, ctx.household, input.id, await householdToday(ctx));
  });

export const markPaycheckReceived = (
  ctx: Ctx,
  input: { id: string; receivedCents: number; receivedDate: string },
) =>
  translated(async () => {
    const { id, ...received } = input;
    await paychecks.markReceived(ctx.db, ctx.household, id, received);
  });
