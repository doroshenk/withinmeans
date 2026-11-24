import type { HouseholdContext } from '../context.js';
import type { Database } from '../db.js';
import type { Month } from './months.js';

/** Spec §5.11: the one operation that opens a month. Idempotent; one transaction. */
export async function openMonth(
  _db: Database,
  _ctx: HouseholdContext,
  _ym: string,
  _startedAt: Date,
): Promise<{ month: Month; created: boolean }> {
  throw new Error('not implemented');
}
