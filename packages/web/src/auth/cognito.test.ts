import { beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in for amazon-cognito-identity-js: records what the app asks Cognito to do.
const state = vi.hoisted(() => ({
  users: [] as { username: string; storage: Storage }[],
  authResult: 'success' as 'success' | Error,
  currentUser: new Map<Storage, unknown>(),
  signedOut: [] as Storage[],
  resetResult: 'success' as 'success' | Error,
  resetCalls: [] as unknown[][],
  session: { valid: true, token: 'access-token' } as
    { valid: boolean; token: string } | Error | null,
}));

vi.mock('amazon-cognito-identity-js', () => {
  class AuthenticationDetails {
    constructor(public data: unknown) {}
  }
  class CognitoUserPool {
    constructor(public data: { Storage: Storage }) {}
    getCurrentUser() {
      return (state.currentUser.get(this.data.Storage) as object | undefined) ?? null;
    }
  }
  class CognitoUser {
    constructor(public data: { Username: string; Storage: Storage }) {
      state.users.push({ username: data.Username, storage: data.Storage });
    }
    authenticateUser(
      _details: unknown,
      callbacks: { onSuccess: () => void; onFailure: (e: Error) => void },
    ) {
      if (state.authResult === 'success') callbacks.onSuccess();
      else callbacks.onFailure(state.authResult);
    }
    forgotPassword(callbacks: { onSuccess: () => void; onFailure: (e: Error) => void }) {
      state.resetCalls.push(['forgot', this.data.Username]);
      if (state.resetResult === 'success') callbacks.onSuccess();
      else callbacks.onFailure(state.resetResult);
    }
    confirmPassword(
      code: string,
      password: string,
      callbacks: { onSuccess: () => void; onFailure: (e: Error) => void },
    ) {
      state.resetCalls.push(['confirm', this.data.Username, code, password]);
      if (state.resetResult === 'success') callbacks.onSuccess();
      else callbacks.onFailure(state.resetResult);
    }
  }
  return { AuthenticationDetails, CognitoUser, CognitoUserPool };
});

import { createCognitoAuth } from './cognito';

function fakeCurrentUser(storage: Storage) {
  const user = {
    signOut: () => state.signedOut.push(storage),
    getSession: (cb: (e: Error | null, s: unknown) => void) => {
      const s = state.session;
      if (s instanceof Error) cb(s, null);
      else if (s === null) cb(null, null);
      else
        cb(null, {
          isValid: () => s.valid,
          getAccessToken: () => ({ getJwtToken: () => s.token }),
        });
    },
  };
  state.currentUser.set(storage, user);
}

beforeEach(() => {
  state.users = [];
  state.authResult = 'success';
  state.currentUser = new Map();
  state.signedOut = [];
  state.resetResult = 'success';
  state.resetCalls = [];
  state.session = { valid: true, token: 'access-token' };
});

const auth = () => createCognitoAuth({ userPoolId: 'pool', clientId: 'client' });

describe('createCognitoAuth', () => {
  it('keeps tokens in localStorage when "keep me signed in" is on', async () => {
    await auth().signIn('sam@example.com', 'pw', true);

    expect(state.users[0]).toEqual({ username: 'sam@example.com', storage: localStorage });
  });

  it('keeps tokens in sessionStorage otherwise', async () => {
    await auth().signIn('sam@example.com', 'pw', false);

    expect(state.users[0]?.storage).toBe(sessionStorage);
  });

  it('signs out of the other storage first so only one session exists', async () => {
    fakeCurrentUser(sessionStorage);

    await auth().signIn('sam@example.com', 'pw', true);

    expect(state.signedOut).toEqual([sessionStorage]);
  });

  it('rejects with the Cognito error when sign-in fails', async () => {
    state.authResult = Object.assign(new Error('bad'), { name: 'NotAuthorizedException' });

    await expect(auth().signIn('a@b.c', 'pw', false)).rejects.toMatchObject({
      name: 'NotAuthorizedException',
    });
  });

  it('signs out of both storages', () => {
    fakeCurrentUser(localStorage);
    fakeCurrentUser(sessionStorage);

    auth().signOut();

    expect(state.signedOut).toEqual([localStorage, sessionStorage]);
  });

  it('returns the access token of a valid saved session', async () => {
    fakeCurrentUser(localStorage);

    expect(await auth().getAccessToken()).toBe('access-token');
  });

  it('finds a session-only user too', async () => {
    fakeCurrentUser(sessionStorage);

    expect(await auth().getAccessToken()).toBe('access-token');
  });

  it('returns undefined with no saved user', async () => {
    expect(await auth().getAccessToken()).toBeUndefined();
  });

  it.each([
    ['an expired session', { valid: false, token: 'x' }],
    ['a session error', new Error('refresh failed')],
    ['no session', null],
  ])('returns undefined for %s', async (_name, session) => {
    state.session = session;
    fakeCurrentUser(localStorage);

    expect(await auth().getAccessToken()).toBeUndefined();
  });

  it('P1-05: forgotPassword asks Cognito to email a code', async () => {
    await auth().forgotPassword('sam@example.com');

    expect(state.resetCalls).toEqual([['forgot', 'sam@example.com']]);
  });

  it('P1-05: resetPassword confirms with the code and new password', async () => {
    await auth().resetPassword('sam@example.com', '123456', 'abcd1234');

    expect(state.resetCalls).toEqual([['confirm', 'sam@example.com', '123456', 'abcd1234']]);
  });

  it('P1-05: reset failures reject with the Cognito error', async () => {
    state.resetResult = Object.assign(new Error('bad'), { name: 'CodeMismatchException' });

    await expect(auth().forgotPassword('a@b.c')).rejects.toMatchObject({
      name: 'CodeMismatchException',
    });
    await expect(auth().resetPassword('a@b.c', '1', 'pw')).rejects.toMatchObject({
      name: 'CodeMismatchException',
    });
  });
});

describe('P2-15: the email of the saved session', () => {
  const saved = (payload: Record<string, unknown> | Error, valid = true) =>
    state.currentUser.set(localStorage, {
      getSession: (cb: (e: Error | null, s: unknown) => void) => {
        if (payload instanceof Error) cb(payload, null);
        else cb(null, { isValid: () => valid, getIdToken: () => ({ payload }) });
      },
    });

  it('reads it from the ID token', async () => {
    saved({ email: 'sam@example.test' });

    expect(await auth().getEmail?.()).toBe('sam@example.test');
  });

  it.each([
    ['no saved user', undefined],
    ['a token without one', {}],
    ['a session error', new Error('refresh failed')],
  ])('is undefined with %s', async (_name, payload) => {
    if (payload !== undefined) saved(payload);

    expect(auth().getEmail).toBeTypeOf('function');
    expect(await auth().getEmail?.()).toBeUndefined();
  });

  it('is undefined for an expired session', async () => {
    saved({ email: 'sam@example.test' }, false);

    expect(auth().getEmail).toBeTypeOf('function');
    expect(await auth().getEmail?.()).toBeUndefined();
  });
});
