import { TRPCError } from '@trpc/server';
import { acceptInvite as acceptInviteRepo, Conflict, NotFound } from '@withinmeans/db';
import type { InvitePreview } from '@withinmeans/db';
import type { AcceptInviteInput } from '@withinmeans/domain';
import type { Context } from './context.js';

export const INVITE_GONE_MESSAGE = 'This invite link has expired or was already used.';
/** The same words whether the email has a login, or only our database knows it. */
export const ACCEPT_FAILED_MESSAGE =
  "We couldn't create that login. Try a different email, or sign in if you already have an account.";

const now = (ctx: Pick<Context, 'clock'>): Date => new Date(ctx.clock.now().epochMilliseconds);

const gone = (): TRPCError => new TRPCError({ code: 'NOT_FOUND', message: INVITE_GONE_MESSAGE });

/** Spec §3: what the accept screen shows. Only the secret token is the credential. */
export async function inviteDetails(
  ctx: Pick<Context, 'db' | 'clock'>,
  token: string,
): Promise<InvitePreview> {
  const preview = await acceptInviteRepo.preview(ctx.db, token, now(ctx));
  if (preview === undefined) throw gone();
  return preview;
}

/** Spec §3: the partner's own login, then a Membership with the invited role. */
export async function acceptInvite(
  ctx: Pick<Context, 'db' | 'clock' | 'identityProvider'>,
  input: AcceptInviteInput,
): Promise<{ status: 'joined' }> {
  // Check the link first so a dead link never creates a login.
  await inviteDetails(ctx, input.token);
  const login = await ctx.identityProvider.createLogin(input.email, input.password);
  if (login === 'exists') {
    throw new TRPCError({ code: 'CONFLICT', message: ACCEPT_FAILED_MESSAGE });
  }
  try {
    await acceptInviteRepo.accept(ctx.db, {
      token: input.token,
      now: now(ctx),
      userName: input.name,
      email: input.email,
      cognitoSub: login.sub,
    });
  } catch (err) {
    await ctx.identityProvider.deleteLogin(input.email);
    if (err instanceof NotFound) throw gone();
    if (err instanceof Conflict) {
      throw new TRPCError({ code: 'CONFLICT', message: ACCEPT_FAILED_MESSAGE });
    }
    throw err;
  }
  return { status: 'joined' };
}
