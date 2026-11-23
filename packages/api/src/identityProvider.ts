import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  UsernameExistsException,
  type CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';

/** What the API needs from the login provider (Cognito in production). */
export interface IdentityProvider {
  /** Creates a login; resolves 'exists' (never throws) when the email already has one. */
  createLogin(email: string, password: string): Promise<{ sub: string } | 'exists'>;
  /** Undoes createLogin when the database step fails. */
  deleteLogin(email: string): Promise<void>;
}

/**
 * Sign-up goes through our API, not the pool's public SignUp, so the answer never reveals
 * whether an email has an account. The login is created already confirmed (no email is sent);
 * a "confirm your email" step is a later decision. Console: Cognito → User pools → Users.
 */
export function createCognitoIdentityProvider(opts: {
  userPoolId: string;
  client: Pick<CognitoIdentityProviderClient, 'send'>;
}): IdentityProvider {
  const { userPoolId, client } = opts;
  const deleteLogin = async (email: string) => {
    await client.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: email }));
  };
  return {
    deleteLogin,
    async createLogin(email, password) {
      let sub: string | undefined;
      try {
        const created = await client.send(
          new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            MessageAction: 'SUPPRESS',
            UserAttributes: [
              { Name: 'email', Value: email },
              { Name: 'email_verified', Value: 'true' },
            ],
          }),
        );
        sub = created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
      } catch (err) {
        if (err instanceof UsernameExistsException) return 'exists';
        throw err;
      }
      try {
        if (sub === undefined) throw new Error('Cognito returned no sub for the new user');
        await client.send(
          new AdminSetUserPasswordCommand({
            UserPoolId: userPoolId,
            Username: email,
            Password: password,
            Permanent: true,
          }),
        );
        return { sub };
      } catch (err) {
        await deleteLogin(email);
        throw err;
      }
    },
  };
}
