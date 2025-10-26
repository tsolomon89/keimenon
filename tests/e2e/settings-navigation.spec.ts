import { test, expect } from './fixtures/testId';

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
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'admin123';

  test.beforeEach(async ({ page }) => {
    // Log in before each test
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for redirect to canvas
    await page.waitForURL(/\/canvas/, { timeout: 20000 });
    await page.waitForLoadState('domcontentloaded');
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
