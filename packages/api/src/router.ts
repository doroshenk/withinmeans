import { initTRPC, TRPCError } from '@trpc/server';
import { acceptInviteInput, invitePartnerInput, signUpInput } from '@withinmeans/domain';
import { z } from 'zod';
import { acceptInvite, inviteDetails } from './acceptInvite.js';
import type { Context } from './context.js';
import { invitePartner, resendInvite } from './invitePartner.js';
import { signUp } from './signUp.js';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

const t = initTRPC.context<Context>().create({
  isDev: false,
  // Unhandled errors tell the browser nothing; the details go to the log (see handler.ts).
  errorFormatter({ shape }) {
    if (shape.data.code !== 'INTERNAL_SERVER_ERROR') return shape;
    return { ...shape, message: GENERIC_MESSAGE };
  },
});

const signedIn = t.middleware(({ ctx, next }) => {
  if (ctx.auth === undefined) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, auth: ctx.auth } });
});

export const protectedProcedure = t.procedure.use(signedIn);

/** Signed in and in a household. The household context comes from the Membership, never input. */
const inHousehold = t.middleware(({ ctx, next }) => {
  const { household, identity } = ctx;
  if (household === undefined || identity?.membership === undefined) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Join or create a household first.' });
  }
  const { membership } = identity;
  return next({ ctx: { ...ctx, household, identity: { ...identity, membership } } });
});

export const memberProcedure = protectedProcedure.use(inHousehold);

export const publicProcedure = t.procedure;

export const appRouter = t.router({
  /** Creates a login, a household and the owner's membership. Open to anyone; see signUp.ts. */
  signUp: publicProcedure.input(signUpInput).mutation(({ ctx, input }) => signUp(ctx, input)),

  /** Spec §3, accepting an invite: what the accept screen shows. The token is the credential. */
  inviteDetails: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(({ ctx, input }) => inviteDetails(ctx, input.token)),

  /** Spec §3, accepting an invite: the partner's own login and Membership. */
  acceptInvite: publicProcedure
    .input(acceptInviteInput)
    .mutation(({ ctx, input }) => acceptInvite(ctx, input)),

  /** Spec §3 step 3: stores the invite and emails the accept link. */
  invitePartner: memberProcedure
    .input(invitePartnerInput)
    .mutation(({ ctx, input }) => invitePartner(ctx, input)),

  /** Resend: a new link and a fresh 7 days; the old link stops working. */
  resendInvite: memberProcedure
    .input(z.object({ inviteId: z.uuid() }))
    .mutation(({ ctx, input }) => resendInvite(ctx, input.inviteId)),

  /** Who am I? A signed-in user may have no profile or no household yet. */
  me: protectedProcedure.query(({ ctx }) => ({
    user:
      ctx.identity === undefined
        ? null
        : { name: ctx.identity.user.name, email: ctx.identity.user.email },
    household:
      ctx.identity?.membership === undefined
        ? null
        : { name: ctx.identity.membership.householdName, role: ctx.identity.membership.role },
  })),
});

export type AppRouter = typeof appRouter;
