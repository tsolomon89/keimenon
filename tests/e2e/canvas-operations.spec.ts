import { test, expect } from './fixtures/testId';

/**
 * Canvas Operations Test
 *
 * Tests basic canvas functionality and navigation.
 * Tagged with @smoke for quick validation.
 */

test.describe('Canvas Operations', () => {
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

    // Wait for redirect to canvas (uses global 30s timeout)
    await page.waitForURL(/\/canvas/);
    await page.waitForLoadState('domcontentloaded');
  });

  test('should load canvas page successfully', async ({ page }) => {
    // Verify we're on the canvas page
    await expect(page).toHaveURL(/\/canvas/);

    // Check for canvas header/navigation
    const header = page.locator('header, nav, [role="banner"]').first();
    await expect(header).toBeVisible({ timeout: 10000 });
  });

  test('should display canvas sidebar or navigation', async ({ page }) => {
    // Look for sidebar or navigation elements
    const sidebar = page.locator('aside, [role="navigation"], .sidebar').first();

    // Sidebar should be present (may be collapsed on mobile)
    await expect(sidebar).toBeAttached({ timeout: 10000 });
  });

  test('should have accessible canvas content', async ({ page }) => {
    // Canvas page should have some visible content
    // Look for any heading or interactive element
    const hasContent = await page.locator('h1, h2, button, a, div').count();

    // Should have multiple elements (page loaded with content)
    expect(hasContent).toBeGreaterThan(5);
  });
});
