import type { AuthClient } from '../auth/types';

export interface ForgotPasswordProps {
  auth: AuthClient;
  /** Back to the sign-in screen (cancel, or after the password is changed). */
  onBack: () => void;
}

export function ForgotPassword(_props: ForgotPasswordProps): never {
  throw new Error('not implemented');
}
