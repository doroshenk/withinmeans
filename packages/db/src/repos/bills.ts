import type { Selectable } from 'kysely';
import type { HouseholdContext } from '../context.js';
import type { BillsTable, Database } from '../db.js';

export type Bill = Selectable<BillsTable>;

/** A month's bill, with its recurring bill's autopay (false for a one-time bill). */
export type ListedBill = Bill & { autopay: boolean };

export interface BillChange {
  name: string;
  amountCents: number;
  /** 'YYYY-MM-DD' */
  dueDate: string;
  categoryId: string;
}

export type NewBill = BillChange & { paid: boolean };

const notImplemented = (): never => {
  throw new Error('not implemented');
};

export const bills = {
  async listForMonth(_db: Database, _ctx: HouseholdContext, _ym: string): Promise<ListedBill[]> {
    return notImplemented();
  },

  async create(
    _db: Database,
    _ctx: HouseholdContext,
    _input: NewBill,
    _now: Date = new Date(),
  ): Promise<Bill> {
    return notImplemented();
  },

  async update(
    _db: Database,
    _ctx: HouseholdContext,
    _id: string,
    _change: BillChange,
  ): Promise<void> {
    return notImplemented();
  },

  async setPaid(
    _db: Database,
    _ctx: HouseholdContext,
    _id: string,
    _paid: boolean,
    _at: Date,
  ): Promise<void> {
    return notImplemented();
  },

  async remove(_db: Database, _ctx: HouseholdContext, _id: string): Promise<void> {
    return notImplemented();
  },
};
