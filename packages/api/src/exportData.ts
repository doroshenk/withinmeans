import type { Database, HouseholdContext, HouseholdTables } from '@withinmeans/db';
import type { Clock } from '@withinmeans/domain';

export interface HouseholdDocument {
  version: 1;
  exportedAt: string;
  /** Today in the household's time zone; the download's file name uses it. */
  exportedOn: string;
  tables: HouseholdTables;
}

export async function exportData(_deps: {
  db: Database;
  clock: Clock;
  household: HouseholdContext;
}): Promise<HouseholdDocument> {
  throw new Error('not implemented');
}
