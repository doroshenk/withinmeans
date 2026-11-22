import { initTRPC } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  me: t.procedure.query(() => {
    throw new Error('not implemented');
  }),
});

export type AppRouter = typeof appRouter;
