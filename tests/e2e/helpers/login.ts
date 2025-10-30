/**
 * WebKit-friendly login helper
 *
 * Uses explicit click + fill + tab to ensure React onChange handlers
 * are properly triggered in all browsers (especially WebKit).
 */

import { Page } from '@playwright/test';

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  // Use 'load' instead of 'networkidle' - page may have polling/analytics that prevent network idle
  await page.waitForLoadState('load', { timeout: 60000 });

  // Use ID selectors for reliability across browsers
  const emailInput = page.locator('#email');
  const passwordInput = page.locator('#password');

  // Click to focus, then fill (helps with WebKit React onChange)
  await emailInput.click();
  await emailInput.fill(email);
  await emailInput.press('Tab'); // Trigger blur event

  await passwordInput.click();
  await passwordInput.fill(password);

  // Click the submit button
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect to canvas (increased timeout for parallel test execution)
  await page.waitForURL(/\/canvas/, { timeout: 60000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
}
