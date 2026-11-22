import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('returns the pool and client ids when both are set', () => {
    expect(loadConfig({ VITE_USER_POOL_ID: 'pool', VITE_USER_POOL_CLIENT_ID: 'client' })).toEqual({
      ok: true,
      config: { userPoolId: 'pool', clientId: 'client' },
    });
  });

  it('names both variables when neither is set', () => {
    expect(loadConfig({})).toEqual({
      ok: false,
      missing: ['VITE_USER_POOL_ID', 'VITE_USER_POOL_CLIENT_ID'],
    });
  });

  it('names only the one that is missing, and treats an empty value as missing', () => {
    expect(loadConfig({ VITE_USER_POOL_ID: 'pool', VITE_USER_POOL_CLIENT_ID: '' })).toEqual({
      ok: false,
      missing: ['VITE_USER_POOL_CLIENT_ID'],
    });
  });
});
