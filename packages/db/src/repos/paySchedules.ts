import type { PayFrequency } from '@withinmeans/domain';
import type { Selectable } from 'kysely';
import type { HouseholdContext } from '../context.js';
import type { Database, PaySchedulesTable } from '../db.js';

export type PaySchedule = Selectable<PaySchedulesTable>;

export interface NewPaySchedule {
  name: string;
  frequency: PayFrequency;
  /** 'YYYY-MM-DD' */
  anchorDate: string;
  /** Semimonthly only; the 1st and 15th when not given. */
  semimonthlyDays?: readonly [number, number];
  usualCents: number;
  /** The primary checking account when not given. */
  accountId?: string;
}

export const paySchedules = {
  async list(_db: Database, _ctx: HouseholdContext): Promise<PaySchedule[]> {
    throw new Error('not implemented');
  },

  async create(
    _db: Database,
    _ctx: HouseholdContext,
    _input: NewPaySchedule,
  ): Promise<PaySchedule> {
    throw new Error('not implemented');
  },

  async stop(_db: Database, _ctx: HouseholdContext, _id: string, _today: string): Promise<void> {
    throw new Error('not implemented');
  },

  async restart(_db: Database, _ctx: HouseholdContext, _id: string, _today: string): Promise<void> {
    throw new Error('not implemented');
  },
};
