import { TRPCError } from '@trpc/server';
import {
  assertCanWrite,
  Conflict,
  Forbidden,
  households,
  InvalidInput,
  invites,
  memberships,
  NotFound,
  type Invite,
} from '@withinmeans/db';
import {
  inviteDaysLeft,
  inviteExpiry,
  partnerEmailProblem,
  type InvitePartnerInput,
} from '@withinmeans/domain';
import { Temporal } from 'temporal-polyfill';
import type { Context } from './context.js';

/** What the screen shows about an invite. The secret token never leaves the server. */
export interface InviteStatus {
  id: string;
  name: string;
  email: string;
  status: 'pending';
  daysLeft: number;
}

/** A signed-in user who belongs to a household (the router checks before calling here). */
export type MemberContext = Pick<Context, 'db' | 'clock' | 'invites'> & {
  household: NonNullable<Context['household']>;
  identity: NonNullable<Context['identity']> & {
    membership: NonNullable<NonNullable<Context['identity']>['membership']>;
  };
};

/** Repository errors become the codes the screens understand. */
async function translated<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Forbidden) throw new TRPCError({ code: 'FORBIDDEN', message: err.message });
    if (err instanceof NotFound) throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
    if (err instanceof Conflict) throw new TRPCError({ code: 'CONFLICT', message: err.message });
    if (err instanceof InvalidInput) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
    }
    throw err;
  }
}

const expiryOf = (invite: Invite): Temporal.Instant =>
  Temporal.Instant.fromEpochMilliseconds(invite.expires_at.getTime());

function statusOf(invite: Invite, ctx: Pick<MemberContext, 'clock'>): InviteStatus {
  return {
    id: invite.id,
    name: invite.name,
    email: invite.email,
    status: 'pending',
    daysLeft: inviteDaysLeft(expiryOf(invite), ctx.clock),
  };
}

async function sendEmail(ctx: MemberContext, invite: Invite): Promise<void> {
  await ctx.invites.emailSender.sendInvite({
    to: invite.email,
    inviteeName: invite.name,
    inviterName: ctx.identity.user.name,
    householdName: ctx.identity.membership.householdName,
    role: invite.role,
    note: invite.note,
    acceptUrl: `${ctx.invites.appUrl}/accept?token=${encodeURIComponent(invite.token)}`,
    expiresAt: expiryOf(invite),
  });
}

const freshExpiry = (ctx: Pick<MemberContext, 'clock'>): Date =>
  new Date(inviteExpiry(ctx.clock).epochMilliseconds);

/** Spec §3 step 3. Stores the invite, then emails it; if the email fails nothing is left behind. */
export function invitePartner(
  ctx: MemberContext,
  input: InvitePartnerInput,
): Promise<InviteStatus> {
  return translated(async () => {
    assertCanWrite(ctx.household);
    const problem = partnerEmailProblem(ctx.identity.user.email, input.email);
    if (problem !== undefined) throw new TRPCError({ code: 'BAD_REQUEST', message: problem });
    // T20: a solo household has no partner, now or later.
    const household = await households.getMine(ctx.db, ctx.household);
    if (household?.mode === 'solo') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'A solo household has no partner.' });
    }
    if ((await memberships.list(ctx.db, ctx.household)).length >= 2) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Your household already has two members.' });
    }
    if ((await invites.listPending(ctx.db, ctx.household)).length > 0) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'An invite is already waiting. Use Resend instead.',
      });
    }
    const invite = await invites.create(ctx.db, ctx.household, {
      name: input.name,
      email: input.email,
      role: input.role,
      note: input.note,
      token: ctx.invites.newToken(),
      expiresAt: freshExpiry(ctx),
    });
    try {
      await sendEmail(ctx, invite);
    } catch (err) {
      await invites.revoke(ctx.db, ctx.household, invite.id);
      throw err;
    }
    return statusOf(invite, ctx);
  });
}

/** Resend: a new token and a fresh 7 days; the old link stops working. */
export function resendInvite(ctx: MemberContext, inviteId: string): Promise<InviteStatus> {
  return translated(async () => {
    const invite = await invites.reissue(ctx.db, ctx.household, inviteId, {
      token: ctx.invites.newToken(),
      expiresAt: freshExpiry(ctx),
    });
    await sendEmail(ctx, invite);
    return statusOf(invite, ctx);
  });
}
