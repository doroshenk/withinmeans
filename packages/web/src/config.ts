export interface AppConfig {
  userPoolId: string;
  clientId: string;
}

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; missing: string[] };

/** Reads the build-time variables that say which Cognito pool to sign in to. */
export function loadConfig(env: {
  VITE_USER_POOL_ID?: string | undefined;
  VITE_USER_POOL_CLIENT_ID?: string | undefined;
}): ConfigResult {
  const userPoolId = env.VITE_USER_POOL_ID;
  const clientId = env.VITE_USER_POOL_CLIENT_ID;
  if (!userPoolId || !clientId) {
    return {
      ok: false,
      missing: [
        ...(userPoolId ? [] : ['VITE_USER_POOL_ID']),
        ...(clientId ? [] : ['VITE_USER_POOL_CLIENT_ID']),
      ],
    };
  }
  return { ok: true, config: { userPoolId, clientId } };
}
