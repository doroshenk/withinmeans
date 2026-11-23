import type { Selectable } from 'kysely';
import type { HouseholdContext } from '../context.js';
import type { Database, RecurringBillsTable } from '../db.js';
import { notImplemented } from './notImplemented.js';

export type RecurringBill = Selectable<RecurringBillsTable>;

export interface NewRecurringBill {
  name: string;
  estimateCents: number;
  dueDay: number;
  categoryId: string;
  autopay: boolean;
  accountId?: string;
  startYm: string;
  endYm?: string;
}

export const recurringBills = {
  list(_db: Database, _ctx: HouseholdContext): Promise<RecurringBill[]> {
    return notImplemented();
  },
  create(_db: Database, _ctx: HouseholdContext, _input: NewRecurringBill): Promise<RecurringBill> {
    return notImplemented();
  },
  update(
    _db: Database,
    _ctx: HouseholdContext,
    _id: string,
    _patch: Partial<Omit<NewRecurringBill, 'startYm' | 'endYm'>>,
  ): Promise<void> {
    return notImplemented();
  },
  /** Ends the bill from `endYm`; past months keep their rows. */
  end(_db: Database, _ctx: HouseholdContext, _id: string, _endYm: string): Promise<void> {
    return notImplemented();
  },
};
