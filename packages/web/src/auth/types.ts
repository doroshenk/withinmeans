export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

/** What the screens need from the identity provider. The real one wraps Cognito (cognito.ts). */
export interface AuthClient {
  signIn(email: string, password: string, keepSignedIn: boolean): Promise<void>;
  signUp(input: SignUpInput): Promise<void>;
  signOut(): void;
  getIdToken(): Promise<string | undefined>;
}
