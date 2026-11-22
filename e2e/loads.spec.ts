import { expect, test } from '@playwright/test';

// Prod has no test user (real people only), so the prod smoke test checks the site loads
// and shows the sign-in form.
test('P0-13: the site loads and shows the sign-in form', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
