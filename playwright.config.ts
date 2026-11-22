import { defineConfig } from '@playwright/test';

/**
 * Smoke tests against a deployed stage (P0-13). `SMOKE_BASE_URL` says which one, e.g.
 * https://dev.within.doroshenk.com. They run from the deploy workflow, not from `pnpm test`.
 */
export default defineConfig({
  testDir: 'e2e',
  retries: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: { baseURL: process.env.SMOKE_BASE_URL, trace: 'retain-on-failure' },
});
