import { test, expect } from './fixtures/testId';
import { login } from './helpers/login';

/**
 * Keimenon Operations Test
 *
 * Tests basic keimenon functionality and navigation.
 * Tagged with @smoke for quick validation.
 */

test.describe('Keimenon Operations', () => {
  test.describe.configure({ tag: '@smoke', timeout: 90000 });

  // Test credentials
  // FIXED: Updated password to match global setup (TestPass123!)
  // Visual evidence: test-results/keimenon-operations.../test-failed-1.png
  // Issue: Login failed with "Invalid email or password"
  // Root cause: Password mismatch between test (123456) and setup (TestPass123!)
  const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@admin.com';
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPass123!';

  test.beforeEach(async ({ page }) => {
    // Log in before each test using WebKit-friendly helper
    await login(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('should load keimenon page successfully', async ({ page }) => {
    // Verify we're on the keimenon page
    await expect(page).toHaveURL(/\/keimenon/);

    // Check for keimenon header/navigation
    const header = page.locator('header, nav, [role="banner"]').first();
    await expect(header).toBeVisible({ timeout: 10000 });
  });

  test('should display keimenon sidebar or navigation', async ({ page }) => {
    // Look for sidebar or navigation elements
    const sidebar = page.locator('aside, [role="navigation"], .sidebar').first();

    // Sidebar should be present (may be collapsed on mobile)
    await expect(sidebar).toBeAttached({ timeout: 10000 });
  });

  test('should have accessible keimenon content', async ({ page }) => {
    await expect(page).toHaveURL(/\/keimenon/, { timeout: 15000 });

    // Validate shell landmarks and visible interactive content.
    await expect(page.getByRole('banner')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('complementary').first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole('button', { name: /Upload Sources|Upload Files/i }).first()
    ).toBeVisible({
      timeout: 10000,
    });
  });
});
