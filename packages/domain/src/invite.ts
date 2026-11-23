import { z } from 'zod';
import type { Temporal } from 'temporal-polyfill';
import type { Clock } from './clock';

export const INVITE_TTL_DAYS = 7;
export const PARTNER_OWN_EMAIL_MESSAGE = "Use your partner's own email, not yours.";

export const invitePartnerInput = z.any() as z.ZodType<{
  name: string;
  email: string;
  role: 'full' | 'view';
  note: string;
}>;
export type InvitePartnerInput = z.infer<typeof invitePartnerInput>;

export function partnerEmailProblem(_ownEmail: string, _partnerEmail: string): string | undefined {
  throw new Error('not implemented');
}

export function inviteExpiry(_clock: Clock): Temporal.Instant {
  throw new Error('not implemented');
}

export function inviteDaysLeft(_expiresAt: Temporal.Instant, _clock: Clock): number {
  throw new Error('not implemented');
}
