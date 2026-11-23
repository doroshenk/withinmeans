import type { Role } from '../context.js';
import type { Database } from '../db.js';

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

/**
 * The invitee is not a member yet, so there is no HouseholdContext: the secret token is the
 * credential (like `invites.findByToken`).
 */
export const acceptInvite = {
  /** The open (unused, unexpired) invite behind a token, with who invited and to what. */
  async preview(_db: Database, _token: string, _now: Date): Promise<InvitePreview | undefined> {
    throw new Error('not implemented');
  },

  /**
   * One transaction: the user, a Membership with the invite's role, and `accepted_at`.
   * An unknown, used or expired token is NotFound; a taken email or a full household is Conflict.
   */
  async accept(
    _db: Database,
    _input: AcceptInput,
  ): Promise<{ householdId: string; userId: string; role: 'full' | 'view' }> {
    throw new Error('not implemented');
  },
};
