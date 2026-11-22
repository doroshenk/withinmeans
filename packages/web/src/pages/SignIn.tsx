import type { AuthClient } from '../auth/types';

export interface SignInProps {
  auth: AuthClient;
  onSignedIn: () => void;
  onShowSignUp: () => void;
}

export function SignIn(_props: SignInProps) {
  return null;
}
