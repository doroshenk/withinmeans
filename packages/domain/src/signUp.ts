import { z } from 'zod';

export const MIN_PASSWORD_LENGTH = 8;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The login fields shared by sign-up and accepting an invite. */
export const loginFields = {
  name: z.string().trim().min(1, 'Enter your first name.'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(MIN_PASSWORD_LENGTH, 'Your password needs at least 8 characters.'),
};

const base = {
  ...loginFields,
  timeZone: z.string().refine(isTimeZone, 'Unknown time zone.'),
};

/**
 * Spec §3 steps 1–2: who is managing the money, and the login. Partner mode also needs the
 * household name; a solo household is named after the user by the caller.
 */
export const signUpInput = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('solo'), ...base }),
  z.object({
    mode: z.literal('partner'),
    householdName: z.string().trim().min(1, 'Give your household a name.'),
    ...base,
  }),
]);

export type SignUpInput = z.infer<typeof signUpInput>;
