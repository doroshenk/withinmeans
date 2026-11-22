export interface TokenVerifier {
  /** Resolves with the token's claims, or rejects if the token is forged or expired. */
  verify(token: string): Promise<{ sub: string }>;
}

export function createCognitoVerifier(_opts: {
  userPoolId: string;
  clientId: string;
}): TokenVerifier {
  throw new Error('not implemented');
}
