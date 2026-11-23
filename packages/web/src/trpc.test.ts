import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient } from './auth/types';
import { createApiClient } from './trpc';

function authWithToken(token: string | undefined): AuthClient {
  return {
    signIn: vi.fn(),
    signOut: vi.fn(),
    forgotPassword: vi.fn(() => Promise.resolve()),
    resetPassword: vi.fn(() => Promise.resolve()),
    getAccessToken: vi.fn(() => Promise.resolve(token)),
  };
}

function stubFetch() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify([{ result: { data: { user: null, household: null } } }]), {
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('createApiClient', () => {
  it('calls /api with the access token as a Bearer header', async () => {
    const fetchMock = stubFetch();

    await createApiClient(authWithToken('abc.def')).me.query();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/me');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer abc.def');
  });

  it('sends no Authorization header when signed out', async () => {
    const fetchMock = stubFetch();

    await createApiClient(authWithToken(undefined)).me.query();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('authorization')).toBeNull();
  });
});
