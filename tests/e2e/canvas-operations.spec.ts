import { test, expect } from './fixtures/testId';
import { login } from './helpers/login';

/**
 * Canvas Operations Test
 *
 * Tests basic canvas functionality and navigation.
 * Tagged with @smoke for quick validation.
 */

test.describe('Canvas Operations', () => {
  test.describe.configure({ tag: '@smoke' });

  // Test credentials
  // FIXED: Updated password to match global setup (TestPass123!)
  // Visual evidence: test-results/canvas-operations.../test-failed-1.png
  // Issue: Login failed with "Invalid email or password"
  // Root cause: Password mismatch between test (123456) and setup (TestPass123!)
  const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@admin.com';
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPass123!';

  test.beforeEach(async ({ page }) => {
    // Log in before each test using WebKit-friendly helper
    await login(page, TEST_EMAIL, TEST_PASSWORD);
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
