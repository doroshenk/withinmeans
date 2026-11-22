import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';

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

export const appRouter = t.router({
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
