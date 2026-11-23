import type { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import type { Clock } from './clock';

/** Spec §3: an invite lasts 7 days; Resend starts a fresh 7. */
export const INVITE_TTL_DAYS = 7;
export const PARTNER_OWN_EMAIL_MESSAGE = "Use your partner's own email, not yours.";

const HOURS_PER_DAY = 24;

/** Spec §3 step 3: the partner's first name, email, access level and an optional note. */
export const invitePartnerInput = z.object({
  name: z.string().trim().min(1, "Enter your partner's first name."),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  role: z.enum(['full', 'view']),
  note: z.string().trim().max(500, 'Keep the note under 500 characters.').default(''),
});

export type InvitePartnerInput = z.infer<typeof invitePartnerInput>;

const normalise = (email: string): string => email.trim().toLowerCase();

/** Spec §3 / T19: the partner needs their own email, never the inviter's. */
export function partnerEmailProblem(ownEmail: string, partnerEmail: string): string | undefined {
  return normalise(ownEmail) === normalise(partnerEmail) ? PARTNER_OWN_EMAIL_MESSAGE : undefined;
}

export function inviteExpiry(clock: Clock): Temporal.Instant {
  return clock.now().add({ hours: INVITE_TTL_DAYS * HOURS_PER_DAY });
}

/** Whole days left, rounded up (6 hours left is "1 day"); 0 once it has expired. */
export function inviteDaysLeft(expiresAt: Temporal.Instant, clock: Clock): number {
  const hours = clock.now().until(expiresAt, { largestUnit: 'hour' }).total('hour');
  return Math.max(0, Math.ceil(hours / HOURS_PER_DAY));
}
