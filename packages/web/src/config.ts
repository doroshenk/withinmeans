export interface AppConfig {
  userPoolId: string;
  clientId: string;
}

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; missing: string[] };

export function loadConfig(_env: {
  VITE_USER_POOL_ID?: string | undefined;
  VITE_USER_POOL_CLIENT_ID?: string | undefined;
}): ConfigResult {
  throw new Error('not implemented');
}
