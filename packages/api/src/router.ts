import { initTRPC, TRPCError } from '@trpc/server';
import { invitePartnerInput, signUpInput } from '@withinmeans/domain';
import { z } from 'zod';
import type { Context } from './context.js';
import { signUp } from './signUp.js';

export interface InviteStatus {
  id: string;
  name: string;
  email: string;
  status: 'pending';
  daysLeft: number;
}

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

export const publicProcedure = t.procedure;

export const appRouter = t.router({
  /** Creates a login, a household and the owner's membership. Open to anyone; see signUp.ts. */
  signUp: publicProcedure.input(signUpInput).mutation(({ ctx, input }) => signUp(ctx, input)),

  invitePartner: protectedProcedure
    .input(invitePartnerInput)
    .mutation((): Promise<InviteStatus> => {
      throw new Error('not implemented');
    }),

  resendInvite: protectedProcedure
    .input(z.object({ inviteId: z.uuid() }))
    .mutation((): Promise<InviteStatus> => {
      throw new Error('not implemented');
    }),

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
