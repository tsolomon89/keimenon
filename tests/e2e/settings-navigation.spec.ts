import { test, expect } from './fixtures/testId';
import { login } from './helpers/login';

/**
 * Settings Navigation Test
 *
 * Tests navigation to and within the settings page.
 * Tagged with @smoke for quick validation.
 */

test.describe('Settings Navigation', () => {
  test.describe.configure({ tag: '@smoke' });

  // Test credentials
  const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@admin.com';
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || '123456';

  test.beforeEach(async ({ page }) => {
    // Login using WebKit-friendly helper
    await login(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('should navigate to settings page', async ({ page }) => {
    // Navigate directly to settings
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // Verify we're on the settings page
    await expect(page).toHaveURL(/\/settings/, { timeout: 10000 });
  });

  test('should display settings page content', async ({ page }) => {
    // Navigate to settings
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // Look for settings-related content
    // This might be tabs, sections, or cards
    const settingsContent = page.locator('main, [role="main"], .settings-content, h1, h2').first();

    await expect(settingsContent).toBeVisible({ timeout: 10000 });
  });

  test('authenticated user can access settings directly', async ({ page }) => {
    // Already logged in from beforeEach

    // Navigate to settings
    await page.goto('/settings');

    // Should not redirect to login
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/settings/, { timeout: 10000 });
  });
});
