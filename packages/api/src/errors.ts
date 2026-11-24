import { TRPCError } from '@trpc/server';
import { Conflict, Forbidden, InvalidInput, NotFound } from '@withinmeans/db';

/** Repository errors become the codes the screens understand. */
export async function translated<T>(fn: () => Promise<T>): Promise<T> {
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
