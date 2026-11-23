import { SendEmailCommand, type SESv2Client } from '@aws-sdk/client-sesv2';
import { INVITE_TTL_DAYS } from '@withinmeans/domain';
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

/** The one sender address (ADR 0008): DKIM and DMARC live on this subdomain only. */
export const INVITE_FROM_ADDRESS = 'no-reply@within.doroshenk.com';

const ACCESS_TEXT = {
  full: 'Full access (you can add, edit and delete)',
  view: 'View only (you can see everything but not change it)',
} as const;

function longDate(instant: Temporal.Instant): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(instant.epochMilliseconds),
  );
}

/** Plain text on purpose: nothing to render, nothing that trackers can hide in. */
export function inviteMessage(email: InviteEmail): { subject: string; text: string } {
  const paragraphs = [
    `Hi ${email.inviteeName},`,
    `${email.inviterName} invited you to join "${email.householdName}" on Within Means, a shared household budget.`,
    `Your access: ${ACCESS_TEXT[email.role]}.`,
    email.note === '' ? undefined : `${email.inviterName} wrote: ${email.note}`,
    `Accept the invite and create your own login:\n${email.acceptUrl}`,
    `The link works for ${String(INVITE_TTL_DAYS)} days, until ${longDate(email.expiresAt)}. If you were not expecting this, you can ignore this email.`,
  ];
  return {
    subject: `${email.inviterName} invited you to Within Means`,
    text: paragraphs.filter((p) => p !== undefined).join('\n\n'),
  };
}

/**
 * Sends through Amazon SES. Console: SES → Identities (the within.doroshenk.com domain). In the
 * SES sandbox, only verified addresses can receive: verify both partners' addresses
 * (docs/runbooks/aws-account.md, Email).
 */
export function createSesEmailSender(opts: {
  client: Pick<SESv2Client, 'send'>;
  from: string;
}): InviteEmailSender {
  return {
    async sendInvite(email) {
      const { subject, text } = inviteMessage(email);
      await opts.client.send(
        new SendEmailCommand({
          FromEmailAddress: opts.from,
          Destination: { ToAddresses: [email.to] },
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: 'UTF-8' },
              Body: { Text: { Data: text, Charset: 'UTF-8' } },
            },
          },
        }),
      );
    },
  };
}
