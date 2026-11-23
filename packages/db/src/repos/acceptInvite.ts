import { Conflict, NotFound, type Role } from '../context.js';
import type { Database } from '../db.js';
import { inTransaction, orConflict } from './shared.js';

export interface InvitePreview {
  inviterName: string;
  householdName: string;
  inviteeName: string;
  email: string;
  role: Extract<Role, 'full' | 'view'>;
  note: string;
}

export interface AcceptInput {
  token: string;
  now: Date;
  userName: string;
  email: string;
  cognitoSub: string;
}

const MAX_MEMBERS = 2;

/**
 * The invitee is not a member yet, so there is no HouseholdContext: the secret token is the
 * credential (like `invites.findByToken`).
 */
export const acceptInvite = {
  /** The open (unused, unexpired) invite behind a token, with who invited and to what. */
  async preview(db: Database, token: string, now: Date): Promise<InvitePreview | undefined> {
    const row = await db
      .selectFrom('invites')
      .innerJoin('households', 'households.id', 'invites.household_id')
      .innerJoin('users', 'users.id', 'invites.invited_by')
      .select([
        'users.name as inviterName',
        'households.name as householdName',
        'invites.name as inviteeName',
        'invites.email as email',
        'invites.role as role',
        'invites.note as note',
      ])
      .where('invites.token', '=', token)
      .where('invites.accepted_at', 'is', null)
      .where('invites.expires_at', '>', now)
      .executeTakeFirst();
    return row;
  },

  /**
   * One transaction: the user, a Membership with the invite's role, and `accepted_at`.
   * An unknown, used or expired token is NotFound; a taken email or a full household is Conflict.
   */
  async accept(
    db: Database,
    input: AcceptInput,
  ): Promise<{ householdId: string; userId: string; role: 'full' | 'view' }> {
    return orConflict(
      () =>
        inTransaction(db, async (trx) => {
          // Claiming the invite first: a second use of the token matches no row.
          const invite = await trx
            .updateTable('invites')
            .set({ accepted_at: input.now })
            .where('token', '=', input.token)
            .where('accepted_at', 'is', null)
            .where('expires_at', '>', input.now)
            .returning(['household_id', 'role'])
            .executeTakeFirst();
          if (invite === undefined) throw new NotFound('Invite not found');
          const members = await trx
            .selectFrom('memberships')
            .select('user_id')
            .where('household_id', '=', invite.household_id)
            .execute();
          if (members.length >= MAX_MEMBERS) throw new Conflict('The household is full');
          const user = await trx
            .insertInto('users')
            .values({
              email: input.email.trim().toLowerCase(),
              name: input.userName,
              cognito_sub: input.cognitoSub,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          await trx
            .insertInto('memberships')
            .values({ household_id: invite.household_id, user_id: user.id, role: invite.role })
            .execute();
          return { householdId: invite.household_id, userId: user.id, role: invite.role };
        }),
      'That email or login is already registered',
    );
  },
};
