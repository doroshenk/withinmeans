/** What the screens need from the identity provider. The real one wraps Cognito (cognito.ts). */
export interface AuthClient {
  signIn(email: string, password: string, keepSignedIn: boolean): Promise<void>;
  /** Cognito emails a reset code. Resolves the same whether or not the address has an account. */
  forgotPassword(email: string): Promise<void>;
  /** Sets a new password using the emailed code. */
  resetPassword(email: string, code: string, newPassword: string): Promise<void>;
  signOut(): void;
  getAccessToken(): Promise<string | undefined>;
  /** The email of the signed-in session. Only for showing who is signed in. */
  getEmail?(): Promise<string | undefined>;
}
