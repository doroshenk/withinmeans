import {
  householdExport,
  households,
  NotFound,
  type Database,
  type HouseholdContext,
  type HouseholdTables,
} from '@withinmeans/db';
import { today, type Clock } from '@withinmeans/domain';

export interface HouseholdDocument {
  version: 1;
  exportedAt: string;
  /** Today in the household's time zone; the download's file name uses it. */
  exportedOn: string;
  tables: HouseholdTables;
}

/** The household's full JSON export: what "Download my data" returns and the nightly job stores. */
export async function exportData(deps: {
  db: Database;
  clock: Clock;
  household: HouseholdContext;
}): Promise<HouseholdDocument> {
  const { db, clock, household } = deps;
  const mine = await households.getMine(db, household);
  if (mine === undefined) throw new NotFound('Household not found');
  return {
    version: 1,
    exportedAt: clock.now().toString(),
    exportedOn: today(clock, mine.timezone).toString(),
    tables: await householdExport.read(db, household),
  };
}
