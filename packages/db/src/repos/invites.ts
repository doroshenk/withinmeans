import type { Selectable } from 'kysely';
import type { HouseholdContext } from '../context.js';
import type { Database, InvitesTable } from '../db.js';
import { notImplemented } from './notImplemented.js';

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
  create(_db: Database, _ctx: HouseholdContext, _input: NewInvite): Promise<Invite> {
    return notImplemented();
  },
  /** Not yet accepted (expired ones included: the UI shows them as expired). */
  listPending(_db: Database, _ctx: HouseholdContext): Promise<Invite[]> {
    return notImplemented();
  },
  revoke(_db: Database, _ctx: HouseholdContext, _inviteId: string): Promise<void> {
    return notImplemented();
  },
  /**
   * The one lookup without a HouseholdContext: the invitee is not a member yet, so the secret
   * token is the credential (like `identity.findByCognitoSub`).
   */
  findByToken(_db: Database, _token: string): Promise<Invite | undefined> {
    return notImplemented();
  },
};
