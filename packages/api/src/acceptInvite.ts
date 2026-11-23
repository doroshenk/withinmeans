import type { InvitePreview } from '@withinmeans/db';
import type { AcceptInviteInput } from '@withinmeans/domain';
import type { Context } from './context.js';

export const INVITE_GONE_MESSAGE = 'This invite link has expired or was already used.';
export const ACCEPT_FAILED_MESSAGE =
  "We couldn't create that login. Try a different email, or sign in if you already have an account.";

/** Spec §3: what the accept screen shows. Only the secret token is the credential. */
export function inviteDetails(
  _ctx: Pick<Context, 'db' | 'clock'>,
  _token: string,
): Promise<InvitePreview> {
  throw new Error('not implemented');
}

/** Spec §3: the partner's own login, then a Membership with the invited role. */
export function acceptInvite(
  _ctx: Pick<Context, 'db' | 'clock' | 'identityProvider'>,
  _input: AcceptInviteInput,
): Promise<{ status: 'joined' }> {
  throw new Error('not implemented');
}
