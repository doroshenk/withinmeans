import type { AuthClient } from '../auth/types';

export interface SignUpProps {
  auth: AuthClient;
  onSignedUp: () => void;
  onShowSignIn: () => void;
}

export function SignUp(_props: SignUpProps) {
  return null;
}
