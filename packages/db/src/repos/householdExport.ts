import type { HouseholdContext } from '../context.js';
import type { Database } from '../db.js';
import { inTransaction } from './shared.js';

/** One array of rows per household-scoped table, keyed by the table's name. */
export type HouseholdTables = Record<string, Record<string, unknown>[]>;

/** The user id in a job's context: no person is acting. */
const NO_USER = '00000000-0000-0000-0000-000000000000';

export const householdExport = {
  /**
   * Spec §8: everything the household owns, read from one snapshot. Every new table with a
   * `household_id` must be added here (householdExport.test.ts fails until it is). Secrets stay
   * out: invite tokens and Cognito ids.
   */
  async read(db: Database, ctx: HouseholdContext): Promise<HouseholdTables> {
    return inTransaction(
      db,
      async (trx) => {
        const h = ctx.householdId;
        const all = (
          table:
            | 'months'
            | 'categories'
            | 'accounts'
            | 'balance_snapshots'
            | 'recurring_bills'
            | 'setup_progress'
            | 'bills'
            | 'pay_schedules'
            | 'paychecks'
            | 'other_income',
        ) => trx.selectFrom(table).selectAll().where('household_id', '=', h).execute();
        // One at a time: a transaction has a single connection.
        return {
          households: await trx.selectFrom('households').selectAll().where('id', '=', h).execute(),
          memberships: await trx
            .selectFrom('memberships')
            .innerJoin('users', 'users.id', 'memberships.user_id')
            .selectAll('memberships')
            .select(['users.name', 'users.email'])
            .where('memberships.household_id', '=', h)
            .execute(),
          invites: await trx
            .selectFrom('invites')
            .select([
              'id',
              'household_id',
              'name',
              'email',
              'role',
              'note',
              'expires_at',
              'accepted_at',
              'invited_by',
              'created_at',
            ])
            .where('household_id', '=', h)
            .execute(),
          months: await all('months'),
          categories: await all('categories'),
          accounts: await all('accounts'),
          balance_snapshots: await all('balance_snapshots'),
          recurring_bills: await all('recurring_bills'),
          setup_progress: await all('setup_progress'),
          bills: await all('bills'),
          pay_schedules: await all('pay_schedules'),
          paychecks: await all('paychecks'),
          other_income: await all('other_income'),
        };
      },
      'repeatable read',
    );
  },

  /**
   * Every household, for the nightly export job only: it runs with no signed-in user, so there is
   * no Membership to build a context from. The contexts are `view`, so they cannot write. Never
   * call this while handling a request.
   */
  async listContexts(db: Database): Promise<HouseholdContext[]> {
    const rows = await db.selectFrom('households').select('id').orderBy('id').execute();
    return rows.map(({ id }) => ({ householdId: id, userId: NO_USER, role: 'view' }));
  },
};
