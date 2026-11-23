/** What the screens need from the identity provider. The real one wraps Cognito (cognito.ts). */
export interface AuthClient {
  signIn(email: string, password: string, keepSignedIn: boolean): Promise<void>;
  signOut(): void;
  getAccessToken(): Promise<string | undefined>;
}
