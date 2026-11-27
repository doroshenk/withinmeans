import { accounts, months, paychecks, paySchedules } from '@withinmeans/db';
import {
  AVERAGE_PAYCHECKS,
  averageReceivedCents,
  monthlyPayCents,
  monthPaycheckPreview,
  type addPayScheduleInput,
  type PayFrequency,
  type updatePayScheduleInput,
} from '@withinmeans/domain';
import type { z } from 'zod';
import { translated } from './errors.js';
import { householdToday } from './householdToday.js';
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
    const row = await paySchedules.create(ctx.db, ctx.household, newSchedule(input));
    return { id: row.id };
  });

export const stopPaySchedule = (ctx: Ctx, input: { id: string }) =>
  translated(async () => {
    await paySchedules.stop(ctx.db, ctx.household, input.id, await householdToday(ctx));
  });

export const restartPaySchedule = (ctx: Ctx, input: { id: string }) =>
  translated(async () => {
    await paySchedules.restart(ctx.db, ctx.household, input.id, await householdToday(ctx));
  });

export interface PagePaycheck {
  /** Null in a preview of a month not started. */
  id: string | null;
  scheduleId: string;
  scheduleName: string;
  /** The account the schedule pays into. */
  accountName: string | null;
  expectedDate: string;
  expectedCents: number;
  receivedDate: string | null;
  receivedCents: number | null;
}

export interface PaychecksPageView {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  /** The month shown. */
  ym: string;
  status: 'open' | 'closed' | 'not-started';
  paychecks: PagePaycheck[];
  schedules: (PayScheduleView & { accountName: string | null; averageCents: number | null })[];
  /** The accounts pay can be deposited into. */
  accounts: { id: string; name: string; isPrimary: boolean }[];
}

/** A schedule's input as the repository takes it: nothing optional is passed as undefined. */
function newSchedule(input: z.infer<typeof addPayScheduleInput>) {
  const { semimonthlyDays, accountId, ...rest } = input;
  return {
    ...rest,
    ...(semimonthlyDays !== undefined && { semimonthlyDays }),
    ...(accountId !== undefined && { accountId }),
  };
}

/** The paychecks a month not started yet will expect, with each schedule's name. */
function previewPaychecks(schedules: PayScheduleView[], ym: string, today: string) {
  return monthPaycheckPreview(schedules, ym, today).map((p) => ({
    id: null,
    ...p,
    scheduleName: schedules.find((s) => s.id === p.scheduleId)?.name ?? '',
    receivedDate: null,
    receivedCents: null,
  }));
}

/** Looks up an account's name, even one since removed. */
function accountNamer(all: { id: string; name: string }[]) {
  const names = new Map(all.map((a) => [a.id, a.name]));
  return (id: string | null): string | null => (id === null ? null : (names.get(id) ?? null));
}

/** Each paycheck with the account its schedule pays into. */
function withAccountNames(
  rows: Omit<PagePaycheck, 'accountName'>[],
  schedules: PayScheduleView[],
  accountName: (id: string | null) => string | null,
): PagePaycheck[] {
  return rows.map((p) => ({
    ...p,
    accountName: accountName(schedules.find((s) => s.id === p.scheduleId)?.accountId ?? null),
  }));
}

/** A month's paychecks as a page shows them: stored ones, or a preview if it isn't started. */
export async function pagePaychecks(
  ctx: Ctx,
  ym: string,
  started: boolean,
  today: string,
): Promise<PagePaycheck[]> {
  const [stored, schedules, allAccounts] = await Promise.all([
    listPaychecks(ctx, ym),
    listPaySchedules(ctx),
    accounts.list(ctx.db, ctx.household, { includeArchived: true }),
  ]);
  const rows = started ? stored : previewPaychecks(schedules, ym, today);
  return withAccountNames(rows, schedules, accountNamer(allAccounts));
}

/** Spec §6.4: a month's paychecks (a preview if it isn't started), schedules and accounts. */
export async function paychecksPage(ctx: Ctx, ym?: string): Promise<PaychecksPageView> {
  const date = await householdToday(ctx);
  const shown = ym ?? date.slice(0, 7);
  const [month, stored, schedules, allAccounts] = await Promise.all([
    months.get(ctx.db, ctx.household, shown),
    listPaychecks(ctx, shown),
    listPaySchedules(ctx),
    accounts.list(ctx.db, ctx.household, { includeArchived: true }),
  ]);
  const accountName = accountNamer(allAccounts);

  const rows = month === undefined ? previewPaychecks(schedules, shown, date) : stored;

  return {
    today: date,
    ym: shown,
    status: month === undefined ? 'not-started' : month.status,
    paychecks: withAccountNames(rows, schedules, accountName),
    schedules: await Promise.all(
      schedules.map(async (s) => {
        const latest = await paychecks.listReceived(ctx.db, ctx.household, s.id, AVERAGE_PAYCHECKS);
        return {
          ...s,
          accountName: accountName(s.accountId),
          averageCents: averageReceivedCents(
            latest.map((p) => ({
              receivedDate: p.received_date,
              // Only received paychecks are listed, so there is always an amount.
              receivedCents: Number(p.received_cents),
            })),
          ),
        };
      }),
    ),
    accounts: allAccounts
      .filter((a) => a.archived_at === null && a.type !== 'brokerage')
      .map((a) => ({ id: a.id, name: a.name, isPrimary: a.is_primary_checking })),
  };
}

export const updatePaySchedule = (ctx: Ctx, input: z.infer<typeof updatePayScheduleInput>) =>
  translated(async () => {
    const { id, ...schedule } = input;
    const date = await householdToday(ctx);
    await paySchedules.update(ctx.db, ctx.household, id, newSchedule(schedule), date);
  });

export const unmarkPaycheckReceived = (ctx: Ctx, input: { id: string }) =>
  translated(async () => {
    await paychecks.unmarkReceived(ctx.db, ctx.household, input.id, await householdToday(ctx));
  });

export const markPaycheckReceived = (
  ctx: Ctx,
  input: { id: string; receivedCents: number; receivedDate: string },
) =>
  translated(async () => {
    const { id, ...received } = input;
    await paychecks.markReceived(ctx.db, ctx.household, id, received);
  });
