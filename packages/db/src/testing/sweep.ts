import type { Database } from '../db.js';

export async function sweepTestSchemas(_db: Database, _keep: string[] = []): Promise<string[]> {
  throw new Error('not implemented');
}
