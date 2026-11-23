import type { Transaction } from 'kysely';
import { Conflict, InvalidInput, NotFound } from '../context.js';
import type { Database, DB } from '../db.js';
import { withRetry } from '../retry.js';

const YM = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const DATE = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

export function assertYm(ym: string, what = 'month'): void {
  if (!YM.test(ym)) throw new InvalidInput(`${what} must look like 2026-11`);
}

export function assertDate(date: string): void {
  if (!DATE.test(date)) throw new InvalidInput('date must look like 2026-11-18');
}

export function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) throw new InvalidInput('money must be whole cents');
}

/** Trims; an empty name is invalid. */
export function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') throw new InvalidInput('name cannot be empty');
  return trimmed;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
}

/** Runs `fn`, turning a unique-constraint failure into Conflict. */
export async function orConflict<T>(fn: () => Promise<T>, message: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) throw new Conflict(message);
    throw err;
  }
}

/** One transaction inside the retry wrapper (DSQL uses optimistic concurrency). */
export function inTransaction<T>(
  db: Database,
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  return withRetry(() => db.transaction().execute(fn), { maxTries: 5 });
}

/** An update or delete that matched nothing means the id is not in the caller's household. */
export function mustHaveChanged(affected: bigint | undefined, what: string): void {
  if (affected === undefined || affected === 0n) throw new NotFound(`${what} not found`);
}
