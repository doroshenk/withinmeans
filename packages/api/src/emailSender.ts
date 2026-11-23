import type { SESv2Client } from '@aws-sdk/client-sesv2';
import type { Temporal } from 'temporal-polyfill';

/** Everything an invite email says. There are no amounts anywhere in it, by design. */
export interface InviteEmail {
  to: string;
  inviteeName: string;
  inviterName: string;
  householdName: string;
  role: 'full' | 'view';
  note: string;
  acceptUrl: string;
  expiresAt: Temporal.Instant;
}

/** The API's port to email. SES in production (the only email we send); a fake in tests. */
export interface InviteEmailSender {
  sendInvite(email: InviteEmail): Promise<void>;
}

export const INVITE_FROM_ADDRESS = 'no-reply@within.doroshenk.com';

export function createSesEmailSender(_opts: {
  client: Pick<SESv2Client, 'send'>;
  from: string;
}): InviteEmailSender {
  throw new Error('not implemented');
}
