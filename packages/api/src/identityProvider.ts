import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

/** What the API needs from the login provider (Cognito in production). */
export interface IdentityProvider {
  /** Creates a login; resolves 'exists' (never throws) when the email already has one. */
  createLogin(email: string, password: string): Promise<{ sub: string } | 'exists'>;
  /** Undoes createLogin when the database step fails. */
  deleteLogin(email: string): Promise<void>;
}

export function createCognitoIdentityProvider(_opts: {
  userPoolId: string;
  client: Pick<CognitoIdentityProviderClient, 'send'>;
}): IdentityProvider {
  throw new Error('not implemented');
}
