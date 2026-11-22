import { describe, expect, it } from 'vitest';
import config from '../vite.config';

describe('vite config', () => {
  // amazon-cognito-identity-js reads Node's `global`; browsers only have `globalThis`.
  // Without this the app crashes on load with "global is not defined" (a blank page).
  it('maps `global` to `globalThis` so the Cognito library runs in the browser', () => {
    expect(config.define).toMatchObject({ global: 'globalThis' });
  });
});
