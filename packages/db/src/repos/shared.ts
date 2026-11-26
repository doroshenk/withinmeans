import type { Transaction } from 'kysely';
import { Conflict, InvalidInput, NotFound, type HouseholdContext } from '../context.js';
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
  isolation?: 'repeatable read',
): Promise<T> {
  return withRetry(
    () => {
      const trx = db.transaction();
      return (isolation === undefined ? trx : trx.setIsolationLevel(isolation)).execute(fn);
    },
    { maxTries: 5 },
  );
}

/** An update or delete that matched nothing means the id is not in the caller's household. */
export function mustHaveChanged(affected: bigint | undefined, what: string): void {
  if (affected === undefined || affected === 0n) throw new NotFound(`${what} not found`);
}

/**
 * Spec §5.11: closed months are read-only. Runs inside the caller's transaction and locks the
 * Month row, so that closing the month at the same moment can't slip past this check. A month
 * that was never opened has no row and is not closed.
 */
export async function assertMonthNotClosed(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  ym: string,
): Promise<void> {
  const month = await trx
    .selectFrom('months')
    .select('status')
    .where('household_id', '=', ctx.householdId)
    .where('ym', '=', ym)
    .forUpdate()
    .executeTakeFirst();
  if (month?.status === 'closed') throw new Conflict('That month is closed');
}

/** The account asked for, which must be the household's, or else its primary checking account. */
export async function depositAccountId(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  accountId: string | undefined,
): Promise<string | null> {
  const query = trx.selectFrom('accounts').select('id').where('household_id', '=', ctx.householdId);
  if (accountId === undefined) {
    const primary = await query
      .where('is_primary_checking', '=', true)
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    return primary?.id ?? null;
  }
  const found = await query.where('id', '=', accountId).executeTakeFirst();
  if (found === undefined) throw new NotFound('Account not found');
  return found.id;
}

/** Money lands in an account still in use, and not in a brokerage account. */
export async function incomeAccountId(
  trx: Transaction<DB>,
  ctx: HouseholdContext,
  asked: string | undefined,
): Promise<string | null> {
  const id = await depositAccountId(trx, ctx, asked);
  if (id === null) return null;
  const account = await trx
    .selectFrom('accounts')
    .select(['type', 'archived_at'])
    .where('household_id', '=', ctx.householdId)
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  if (account.archived_at !== null || account.type === 'brokerage') {
    throw new InvalidInput('Pick a checking, savings or cash account');
  }
  return id;
}
