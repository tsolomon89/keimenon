import { test, expect, Page } from '@playwright/test';
import { login } from './helpers/login';

/**
 * Visual Stability Validation Test
 *
 * This test validates the >95% visual stability claim by:
 * 1. Running the same test multiple times
 * 2. Capturing screenshots at each step
 * 3. Comparing screenshots across runs for consistency
 *
 * Run this test 10 times to validate visual stability:
 * npx playwright test visual-stability-validation.spec.ts --repeat-each=10
 */

// Visual regression configuration
const VISUAL_CONFIG = {
  threshold: 0.1, // 10% tolerance for dynamic content
  maxDiffPixels: 100,
  animations: 'disabled' as const,
};

// Helper function for consistent screenshot naming
async function captureBaseline(page: Page, step: string): Promise<void> {
  const screenshotName = `visual-stability-${step}.png`;
  await expect(page).toHaveScreenshot(screenshotName, VISUAL_CONFIG);
}

test.describe('Visual Stability Validation', () => {
  const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@admin.com';
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPass123!';

  // FIXME: Visual regression test failing due to dynamic content or animation timing
  // Screenshots don't match baselines, possibly due to timestamps, loading states, or animations
  // To fix: Increase threshold, mask dynamic areas, or stabilize animations before capture
  test('should maintain visual consistency across multiple runs', async ({ page }) => {
    // Login for this test (canvas requires auth)
    await login(page, TEST_EMAIL, TEST_PASSWORD);

    // Step 1: Initial canvas load
    // Use 'load' instead of 'networkidle' since canvas may poll for data
    await page.waitForLoadState('load');
    await page.waitForTimeout(2000); // Allow animations and initial data loading

    // 📸 Checkpoint 1: Canvas page initial state
    await captureBaseline(page, '01-canvas-initial');

    // Step 2: Check for header
    const header = page.locator('header, nav, [role="banner"]').first();
    await expect(header).toBeVisible({ timeout: 10000 });

    // 📸 Checkpoint 2: With header visible
    await captureBaseline(page, '02-header-visible');

    // Step 3: Check for sidebar/navigation
    const sidebar = page.locator('aside, [role="navigation"], .sidebar').first();
    await expect(sidebar).toBeAttached({ timeout: 10000 });

    // 📸 Checkpoint 3: With sidebar
    await captureBaseline(page, '03-sidebar-present');

    // Step 4: Check for content
    const contentCount = await page.locator('h1, h2, button, a').count();
    expect(contentCount).toBeGreaterThan(5);

    // 📸 Checkpoint 4: Full page with content
    await captureBaseline(page, '04-full-page');

    // Step 5: Scroll down (test scrolled state)
    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForTimeout(500);

    // 📸 Checkpoint 5: Scrolled state
    await captureBaseline(page, '05-scrolled-state');

    // Step 6: Scroll back up
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // 📸 Checkpoint 6: Back to top (should match checkpoint 4)
    await captureBaseline(page, '06-back-to-top');
  });

  // FIXME: Login page visual regression test failing - likely due to dynamic UI elements
  // Screenshots vary between runs, possibly due to loading states or conditional rendering
  // To fix: Ensure all dynamic elements are loaded/stabilized before taking screenshots
  test('should have consistent login page visuals', async ({ page, context }) => {
    // Navigate to login page first (needed to access localStorage)
    await page.goto('/login');

    // Now clear browser state (can access localStorage once on a real page)
    await context.clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Reload page with clean state
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 📸 Checkpoint 1: Login page
    await captureBaseline(page, 'login-01-initial');

    // Check form elements
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i);

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // 📸 Checkpoint 2: Login form visible
    await captureBaseline(page, 'login-02-form-visible');

    // Fill form (don't submit)
    await emailInput.fill(TEST_EMAIL);

    // 📸 Checkpoint 3: Email filled
    await captureBaseline(page, 'login-03-email-filled');

    await passwordInput.fill(TEST_PASSWORD);

    // 📸 Checkpoint 4: Both fields filled
    await captureBaseline(page, 'login-04-form-complete');
  });
});
