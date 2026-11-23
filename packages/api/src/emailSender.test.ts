import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { createSesEmailSender, INVITE_FROM_ADDRESS, type InviteEmail } from './emailSender.js';

const email: InviteEmail = {
  to: 'pat@example.test',
  inviteeName: 'Pat',
  inviterName: 'Sam',
  householdName: 'The Examples',
  role: 'view',
  note: 'See you inside!',
  acceptUrl: 'https://app.test/accept?token=abc',
  expiresAt: Temporal.Instant.from('2026-11-25T12:00:00Z'),
};

async function sendOne(over: Partial<InviteEmail> = {}) {
  const sent: SendEmailCommand[] = [];
  const sender = createSesEmailSender({
    from: INVITE_FROM_ADDRESS,
    client: {
      send: ((command: SendEmailCommand) => {
        sent.push(command);
        return Promise.resolve({});
      }) as never,
    },
  });
  await sender.sendInvite({ ...email, ...over });
  expect(sent).toHaveLength(1);
  const [command] = sent;
  if (command === undefined) throw new Error('nothing was sent');
  return command.input;
}

describe('P1-03: SES invite email', () => {
  it('P1-03: is sent from no-reply@within.doroshenk.com to the invited address only', async () => {
    const input = await sendOne();
    expect(INVITE_FROM_ADDRESS).toBe('no-reply@within.doroshenk.com');
    expect(input.FromEmailAddress).toBe('no-reply@within.doroshenk.com');
    expect(input.Destination).toEqual({ ToAddresses: ['pat@example.test'] });
  });

  it('P1-03: names who invited them, the household, the access level, the note and the accept link', async () => {
    const input = await sendOne();
    const subject = input.Content?.Simple?.Subject?.Data ?? '';
    const body = input.Content?.Simple?.Body?.Text?.Data ?? '';
    expect(subject).toContain('Sam');
    expect(body).toContain('Pat');
    expect(body).toContain('The Examples');
    expect(body).toContain('View only');
    expect(body).toContain('See you inside!');
    expect(body).toContain('https://app.test/accept?token=abc');
    expect(body).toContain('November 25, 2026');
  });

  it('P1-03: full access reads as Full access, and an empty note leaves no empty gap for it', async () => {
    const body = (await sendOne({ role: 'full', note: '' })).Content?.Simple?.Body?.Text?.Data;
    expect(body).toContain('Full access');
    expect(body).not.toContain('View only');
    expect(body).not.toMatch(/\n\n\n/);
  });

  it('P1-03: never mentions money', async () => {
    const body = (await sendOne()).Content?.Simple?.Body?.Text?.Data ?? '';
    expect(body).not.toMatch(/\$|cents|balance/i);
  });
});
