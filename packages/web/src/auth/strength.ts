export type Strength = 0 | 1 | 2 | 3 | 4;

export const MIN_PASSWORD_LENGTH = 8;

/**
 * The 4-step meter (spec §3). Under 8 characters is 1 (not allowed); 8 or more is 2; a mix of
 * letters and digits or symbols adds a step; 12 or more characters adds another.
 */
export function passwordStrength(password: string): Strength {
  if (password.length === 0) return 0;
  if (password.length < MIN_PASSWORD_LENGTH) return 1;
  const mixed = /[A-Za-z]/.test(password) && /[^A-Za-z]/.test(password);
  return (2 + (mixed ? 1 : 0) + (password.length >= 12 ? 1 : 0)) as Strength;
}
