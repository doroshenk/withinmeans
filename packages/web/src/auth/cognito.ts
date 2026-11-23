import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js';
import type { AuthClient } from './types';

export interface CognitoConfig {
  userPoolId: string;
  clientId: string;
}

/**
 * The real AuthClient: Cognito SRP sign-in (the password never travels). "Keep me signed in"
 * stores the tokens in localStorage (the 30-day refresh token survives closing the browser);
 * otherwise they go in sessionStorage and end with the tab.
 */
export function createCognitoAuth(config: CognitoConfig): AuthClient {
  const poolFor = (storage: Storage) =>
    new CognitoUserPool({
      UserPoolId: config.userPoolId,
      ClientId: config.clientId,
      Storage: storage,
    });
  const persistent = poolFor(localStorage);
  const sessionOnly = poolFor(sessionStorage);

  return {
    signIn(email, password, keepSignedIn) {
      const pool = keepSignedIn ? persistent : sessionOnly;
      const other = keepSignedIn ? sessionOnly : persistent;
      other.getCurrentUser()?.signOut();
      const user = new CognitoUser({
        Username: email,
        Pool: pool,
        Storage: keepSignedIn ? localStorage : sessionStorage,
      });
      return new Promise<void>((resolve, reject) => {
        user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
          onSuccess: () => resolve(),
          onFailure: reject,
        });
      });
    },

    forgotPassword(email) {
      const user = new CognitoUser({ Username: email, Pool: persistent, Storage: localStorage });
      return new Promise<void>((resolve, reject) => {
        user.forgotPassword({ onSuccess: () => resolve(), onFailure: reject });
      });
    },

    resetPassword(email, code, newPassword) {
      const user = new CognitoUser({ Username: email, Pool: persistent, Storage: localStorage });
      return new Promise<void>((resolve, reject) => {
        user.confirmPassword(code, newPassword, { onSuccess: () => resolve(), onFailure: reject });
      });
    },

    signOut() {
      persistent.getCurrentUser()?.signOut();
      sessionOnly.getCurrentUser()?.signOut();
    },

    getAccessToken() {
      const user = persistent.getCurrentUser() ?? sessionOnly.getCurrentUser();
      if (!user) return Promise.resolve(undefined);
      return new Promise<string | undefined>((resolve) => {
        user.getSession((error: Error | null, session: CognitoUserSession | null) => {
          resolve(
            error || !session?.isValid() ? undefined : session.getAccessToken().getJwtToken(),
          );
        });
      });
    },
  };
}
