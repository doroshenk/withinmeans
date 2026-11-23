import type { AcceptInviteInput } from '@withinmeans/domain';
import type { AuthClient } from '../auth/types';

export interface InviteDetails {
  inviterName: string;
  householdName: string;
  inviteeName: string;
  email: string;
  role: 'full' | 'view';
  note: string;
}

export interface AcceptProps {
  auth: AuthClient;
  /** The secret from the invite link. */
  token: string;
  inviteDetails: (input: { token: string }) => Promise<InviteDetails>;
  acceptInvite: (input: AcceptInviteInput) => Promise<unknown>;
  onSignedIn: () => void;
  onShowSignIn: () => void;
}

export function Accept(_props: AcceptProps): never {
  throw new Error('not implemented');
}
