import { householdExport, type Database } from '@withinmeans/db';
import type { Clock } from '@withinmeans/domain';
import { exportData } from './exportData.js';
import type { ExportStore } from './exportStore.js';
import type { Logger } from './logger.js';
import { redactDigits } from './redact.js';

export interface ExportJobDeps {
  db: Database;
  clock: Clock;
  store: ExportStore;
  logger: Logger;
}

/**
 * The nightly backup export (ADR 0014): one object per household, always under the same key, so
 * the bucket's versions are the history. One household failing doesn't stop the rest; the run
 * then throws, so it counts as a Lambda error.
 */
export async function runExportJob(deps: ExportJobDeps): Promise<{ exported: number }> {
  const { db, clock, store, logger } = deps;
  const all = await householdExport.listContexts(db);
  let failed = 0;
  for (const household of all) {
    const { householdId } = household;
    try {
      const document = await exportData({ db, clock, household });
      await store.put(`households/${householdId}.json`, JSON.stringify(document));
    } catch (err) {
      failed += 1;
      const { name, message } = err instanceof Error ? err : new Error(String(err));
      logger.error('household export failed', {
        householdId,
        name,
        message: redactDigits(message),
      });
    }
  }
  logger.info('export finished', { exported: all.length - failed, failed });
  if (failed > 0) throw new Error(`${failed} of ${all.length} household exports failed`);
  return { exported: all.length };
}
