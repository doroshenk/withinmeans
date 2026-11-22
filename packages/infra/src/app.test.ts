import { describe, expect, it } from 'vitest';

describe('P0-05: CDK app entry point', () => {
  it('P0-05: loads and defines the CiStack without AWS credentials', async () => {
    delete process.env.CDK_DEFAULT_ACCOUNT;
    await expect(import('./app.js')).resolves.toBeDefined();
  });

  it('P0-05: loads when an account is signed in', async () => {
    process.env.CDK_DEFAULT_ACCOUNT = '111111111111';
    // Re-evaluate the module with a fresh query string so the account branch runs.
    const url = new URL('./app.ts?with-account', import.meta.url).href;
    await expect(import(/* @vite-ignore */ url)).resolves.toBeDefined();
    delete process.env.CDK_DEFAULT_ACCOUNT;
  });
});
