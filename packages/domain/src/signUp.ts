export const MIN_PASSWORD_LENGTH = 8;

export interface SignUpInput {
  mode: 'solo' | 'partner';
  name: string;
  email: string;
  password: string;
  householdName?: string;
  timeZone: string;
}

export const signUpInput = {
  safeParse(_input: unknown): { success: boolean; data?: SignUpInput } {
    throw new Error('not implemented');
  },
};
