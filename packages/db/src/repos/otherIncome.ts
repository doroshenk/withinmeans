import type { OtherIncomeType } from '@withinmeans/domain';
import type { HouseholdContext } from '../context.js';
import type { Database } from '../db.js';

export interface OtherIncome {
  id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  source: string;
  type: OtherIncomeType;
  amount_cents: number;
  account_id: string | null;
  note: string | null;
}

export interface NewOtherIncome {
  /** 'YYYY-MM-DD' */
  date: string;
  source: string;
  type: OtherIncomeType;
  amountCents: number;
  /** The primary checking account when not given. */
  accountId?: string;
  note?: string;
}

export const otherIncome = {
  async listForMonth(_db: Database, _ctx: HouseholdContext, _ym: string): Promise<OtherIncome[]> {
    throw new Error('not implemented');
  },

  async listRecent(_db: Database, _ctx: HouseholdContext): Promise<OtherIncome[]> {
    throw new Error('not implemented');
  },

  async create(
    _db: Database,
    _ctx: HouseholdContext,
    _input: NewOtherIncome,
  ): Promise<OtherIncome> {
    throw new Error('not implemented');
  },

  async remove(_db: Database, _ctx: HouseholdContext, _id: string): Promise<void> {
    throw new Error('not implemented');
  },
};
