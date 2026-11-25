import type { Database } from '@withinmeans/db';
import type { Clock } from '@withinmeans/domain';
import type { ExportStore } from './exportStore.js';
import type { Logger } from './logger.js';

export interface ExportJobDeps {
  db: Database;
  clock: Clock;
  store: ExportStore;
  logger: Logger;
}

export async function runExportJob(_deps: ExportJobDeps): Promise<{ exported: number }> {
  throw new Error('not implemented');
}
