import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { fixedClock } from './clock';
import {
  INVITE_TTL_DAYS,
  inviteDaysLeft,
  inviteExpiry,
  invitePartnerInput,
  partnerEmailProblem,
  PARTNER_OWN_EMAIL_MESSAGE,
} from './invite';

const NOW = Temporal.Instant.from('2026-11-18T12:00:00Z');
const clock = fixedClock(NOW);
const valid = { name: 'Pat', email: 'pat@example.com', role: 'full', note: '' };

describe('invitePartnerInput (spec §3 step 3)', () => {
  it('P1-03: takes a name, email, access level and an optional note', () => {
    const ok = invitePartnerInput.safeParse({
      name: ' Pat ',
      email: ' Pat@Example.com ',
      role: 'view',
    });
    expect(ok.success).toBe(true);
    expect(ok.data).toEqual({ name: 'Pat', email: 'pat@example.com', role: 'view', note: '' });
  });

  it('P1-03: access is Full access or View only, nothing else', () => {
    expect(invitePartnerInput.safeParse({ ...valid, role: 'owner' }).success).toBe(false);
    expect(invitePartnerInput.safeParse({ ...valid, role: undefined }).success).toBe(false);
  });

  it('P1-03: needs a name and a valid email', () => {
    const noName = invitePartnerInput.safeParse({ ...valid, name: '  ' });
    expect(noName.error?.issues[0]?.message).toBe("Enter your partner's first name.");
    const badEmail = invitePartnerInput.safeParse({ ...valid, email: 'pat' });
    expect(badEmail.error?.issues[0]?.message).toBe('Enter a valid email address.');
  });

  it('P1-03: the note is trimmed and capped at 500 characters', () => {
    expect(invitePartnerInput.parse({ ...valid, note: '  Hi!  ' }).note).toBe('Hi!');
    expect(invitePartnerInput.safeParse({ ...valid, note: 'x'.repeat(500) }).success).toBe(true);
    expect(invitePartnerInput.safeParse({ ...valid, note: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('partnerEmailProblem', () => {
  it('T19: an invite to the user\'s own email is rejected with "Use your partner\'s own email…"', () => {
    expect(partnerEmailProblem('sam@example.com', 'sam@example.com')).toBe(
      PARTNER_OWN_EMAIL_MESSAGE,
    );
    expect(PARTNER_OWN_EMAIL_MESSAGE.startsWith("Use your partner's own email")).toBe(true);
  });

  it('T19: ignores case and surrounding spaces', () => {
    expect(partnerEmailProblem('Sam@Example.com', ' sam@example.COM ')).toBe(
      PARTNER_OWN_EMAIL_MESSAGE,
    );
  });

  it("P1-03: another person's email is fine", () => {
    expect(partnerEmailProblem('sam@example.com', 'pat@example.com')).toBeUndefined();
  });
});

describe('invite expiry', () => {
  it('P1-03: an invite lasts 7 days from now', () => {
    expect(INVITE_TTL_DAYS).toBe(7);
    expect(inviteExpiry(clock).toString()).toBe('2026-11-25T12:00:00Z');
  });

  it('P1-03: days left counts whole days, rounding up, and never goes below zero', () => {
    expect(inviteDaysLeft(inviteExpiry(clock), clock)).toBe(7);
    expect(inviteDaysLeft(NOW.add({ hours: 25 }), clock)).toBe(2);
    expect(inviteDaysLeft(NOW.add({ hours: 1 }), clock)).toBe(1);
    expect(inviteDaysLeft(NOW, clock)).toBe(0);
    expect(inviteDaysLeft(NOW.subtract({ hours: 5 }), clock)).toBe(0);
  });
});
