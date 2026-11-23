import { Conflict, signUp as signUpRepo } from '@withinmeans/db';
import { monthOf, today, type SignUpInput } from '@withinmeans/domain';
import type { Context } from './context.js';

/** Always the same, whether or not the email already had an account. */
const CREATED = { status: 'created' } as const;

export async function signUp(
  ctx: Pick<Context, 'db' | 'identityProvider' | 'clock'>,
  input: SignUpInput,
): Promise<typeof CREATED> {
  const login = await ctx.identityProvider.createLogin(input.email, input.password);
  if (login === 'exists') return CREATED;
  try {
    await signUpRepo.createHousehold(ctx.db, {
      mode: input.mode,
      householdName: input.mode === 'partner' ? input.householdName : `${input.name}'s household`,
      userName: input.name,
      email: input.email,
      cognitoSub: login.sub,
      timezone: input.timeZone,
      firstMonth: monthOf(today(ctx.clock, input.timeZone)),
    });
  } catch (err) {
    await ctx.identityProvider.deleteLogin(input.email);
    // Our database already has this email: the same quiet answer as an existing login.
    if (err instanceof Conflict) return CREATED;
    throw err;
  }
  return CREATED;
}
