import { expect, test } from '@playwright/test';

// The dev test user is created by hand in Cognito; its login lives in GitHub secrets, never here.
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;

test('P0-13: Playwright smoke: sign in with a dev test user and see "Hello"', async ({ page }) => {
  if (!email || !password) throw new Error('Set SMOKE_EMAIL and SMOKE_PASSWORD');

  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: /^Hello/ })).toBeVisible();
});
