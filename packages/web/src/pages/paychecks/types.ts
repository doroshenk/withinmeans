import type { PayFrequency } from '@withinmeans/domain';
import type { MonthStatus } from '../../shell/MonthNavigator';
import type { OtherIncomeClient } from '../PaychecksPage';

export interface PageSchedule {
  id: string;
  name: string;
  frequency: PayFrequency;
  anchorDate: string;
  semimonthlyDays: [number, number] | null;
  usualCents: number;
  accountId: string | null;
  /** Null while the schedule runs. */
  endedOn: string | null;
  accountName: string | null;
  /** The average of the last 6 received; null before the first. */
  averageCents: number | null;
}

export interface PageRow {
  /** Null in a preview of a month not started. */
  id: string | null;
  scheduleId: string;
  scheduleName: string;
  accountName: string | null;
  expectedDate: string;
  expectedCents: number;
  receivedDate: string | null;
  receivedCents: number | null;
}

export interface PaychecksData {
  /** "YYYY-MM-DD" in the household's time zone. */
  today: string;
  ym: string;
  status: MonthStatus;
  paychecks: PageRow[];
  schedules: PageSchedule[];
  accounts: { id: string; name: string; isPrimary: boolean }[];
}

export interface ScheduleInput {
  name: string;
  frequency: PayFrequency;
  anchorDate: string;
  semimonthlyDays?: [number, number];
  usualCents: number;
  accountId?: string;
}

type ById = { mutate: (input: { id: string }) => Promise<unknown> };

export interface PaychecksPageClient extends OtherIncomeClient {
  paychecksPage: { query: (input: { ym?: string }) => Promise<PaychecksData> };
  addPaySchedule: { mutate: (input: ScheduleInput) => Promise<unknown> };
  updatePaySchedule: { mutate: (input: ScheduleInput & { id: string }) => Promise<unknown> };
  stopPaySchedule: ById;
  restartPaySchedule: ById;
  markPaycheckReceived: {
    mutate: (input: {
      id: string;
      receivedCents: number;
      receivedDate: string;
    }) => Promise<unknown>;
  };
  unmarkPaycheckReceived: ById;
}
