import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { Jwks } from 'aws-jwt-verify/jwk';

export interface TokenVerifier {
  /** Resolves with the token's claims, or rejects if the token is forged or expired. */
  verify(token: string): Promise<{ sub: string }>;
}

/**
 * Checks the signature (against the pool's public keys, fetched once and cached), the issuer,
 * the expiry and that the token was issued to our app client. No paid authorizer (ADR 0003).
 */
export function createCognitoVerifier(opts: {
  userPoolId: string;
  clientId: string;
  /** Pre-load the pool's public keys (tests); otherwise they are fetched on first use. */
  jwks?: Jwks;
}): TokenVerifier {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: opts.userPoolId,
    clientId: opts.clientId,
    tokenUse: 'access',
  });
  if (opts.jwks !== undefined) verifier.cacheJwks(opts.jwks);
  return {
    async verify(token) {
      const { sub } = await verifier.verify(token);
      return { sub };
    },
  };
}
