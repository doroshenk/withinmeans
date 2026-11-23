import type { Selectable } from 'kysely';
import { assertCanWrite, type HouseholdContext } from '../context.js';
import type { Database, InvitesTable } from '../db.js';
import { cleanName, mustHaveChanged, orConflict } from './shared.js';

export type Invite = Selectable<InvitesTable>;

export interface NewInvite {
  name: string;
  email: string;
  role: 'full' | 'view';
  note: string;
  token: string;
  expiresAt: Date;
}

export const invites = {
  async create(db: Database, ctx: HouseholdContext, input: NewInvite): Promise<Invite> {
    assertCanWrite(ctx);
    const name = cleanName(input.name);
    return orConflict(
      () =>
        db
          .insertInto('invites')
          .values({
            household_id: ctx.householdId,
            name,
            email: input.email.trim(),
            role: input.role,
            note: input.note,
            token: input.token,
            expires_at: input.expiresAt,
            accepted_at: null,
            invited_by: ctx.userId,
          })
          .returningAll()
          .executeTakeFirstOrThrow(),
      'That invite token is already in use',
    );
  },

  /** Not yet accepted (expired ones included: the UI shows them as expired). */
  async listPending(db: Database, ctx: HouseholdContext): Promise<Invite[]> {
    return db
      .selectFrom('invites')
      .selectAll()
      .where('household_id', '=', ctx.householdId)
      .where('accepted_at', 'is', null)
      .orderBy('created_at')
      .orderBy('id')
      .execute();
  },

  async revoke(db: Database, ctx: HouseholdContext, inviteId: string): Promise<void> {
    assertCanWrite(ctx);
    const result = await db
      .deleteFrom('invites')
      .where('id', '=', inviteId)
      .where('household_id', '=', ctx.householdId)
      .executeTakeFirst();
    mustHaveChanged(result.numDeletedRows, 'Invite');
  },

  /**
   * The one lookup without a HouseholdContext: the invitee is not a member yet, so the secret
   * token is the credential (like `identity.findByCognitoSub`).
   */
  async findByToken(db: Database, token: string): Promise<Invite | undefined> {
    return db.selectFrom('invites').selectAll().where('token', '=', token).executeTakeFirst();
  },
};
