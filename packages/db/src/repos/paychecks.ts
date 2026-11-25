import type { Selectable } from 'kysely';
import type { HouseholdContext } from '../context.js';
import type { Database, PaychecksTable } from '../db.js';

export type Paycheck = Selectable<PaychecksTable>;

export const paychecks = {
  /** The paychecks expected in month `ym`, by date. */
  async listForMonth(_db: Database, _ctx: HouseholdContext, _ym: string): Promise<Paycheck[]> {
    throw new Error('not implemented');
  },

  async markReceived(
    _db: Database,
    _ctx: HouseholdContext,
    _id: string,
    _received: { receivedCents: number; receivedDate: string },
  ): Promise<void> {
    throw new Error('not implemented');
  },
};
