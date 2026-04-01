import { test, expect } from './fixtures/test-isolation';
import { loginTokenWithRetry } from './helpers/login-token';

const MOTION_STABILIZER_CSS = `
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}
`;

async function bootstrapAuthenticatedSession(
  page: any,
  apiRequest: any,
  credentials: {
    email: string;
    password: string;
  }
) {
  const token = await loginTokenWithRetry(apiRequest, credentials);

  // Prime a same-origin document before writing localStorage.
  await page.goto('/login', { waitUntil: 'commit' });
  await page.evaluate((authToken: string) => {
    localStorage.setItem('keimenon_token', authToken);
    localStorage.removeItem('temp_auth_token');
  }, token);

  await page.goto('/keimenon', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: MOTION_STABILIZER_CSS });
  await page.waitForSelector('header.h-14', { state: 'visible', timeout: 20000 });
}

/**
 * Visual Stability Validation
 *
 * This suite verifies that the application's visual appearance has not regressed.
 * It uses Playwright's built-in screenshot comparison to check against
 * known-good snapshots stored in `visual-stability-validation.spec.ts-snapshots`.
 *
 * Covered Scenarios:
 * 1. Initial Canvas State
 * 2. Header & Navigation visibility
 * 3. Sidebar State
 * 4. Login Page States
 */

test.describe('Visual Stability Validation', () => {
  // Use a predictable viewport size to match snapshots
  test.use({ viewport: { width: 1280, height: 720 } });

  // Login credentials (standard test user)
  const TEST_USER = {
    email: 'admin@admin.com',
    password: 'TestPass123!',
  };

  test.describe('Authenticated States', () => {
    test.beforeEach(async ({ page, apiRequest }) => {
      await bootstrapAuthenticatedSession(page, apiRequest, TEST_USER);
    });

    test('visual-stability-01-canvas-initial', async ({ page }) => {
      // Shell and viewport empty-state are the stable readiness signals in current UI.
      await page.waitForSelector('header.h-14', { state: 'visible', timeout: 15000 });
      await expect(
        page.getByRole('heading', { name: /welcome to keimenon/i }).first()
      ).toBeVisible();
      // Arbitrary wait for animations to settle
      await page.waitForTimeout(2000);

      // Take snapshot of the entire page
      await expect(page).toHaveScreenshot('visual-stability-01-canvas-initial.png', {
        animations: 'disabled',
        fullPage: false,
        maxDiffPixelRatio: 0.05, // Allow slight rendering differences
      });
    });

    test('visual-stability-02-header-visible', async ({ page }) => {
      // Focus on the keimenon app-shell header (not generic semantic header fallback).
      const header = page.locator('header.h-14.border-b.border-slate-800').first();
      await expect(header).toBeVisible({ timeout: 15000 });

      await expect(page).toHaveScreenshot('visual-stability-02-header-visible.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.05,
      });
    });

    test('visual-stability-03-sidebar-present', async ({ page }) => {
      // Ensure at least one app-shell sidebar is visible.
      const sidebar = page.locator('aside.border-r, aside.border-l').first();
      await expect(sidebar).toBeVisible({ timeout: 15000 });

      await expect(page).toHaveScreenshot('visual-stability-03-sidebar-present.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe('Unauthenticated States', () => {
    test('visual-stability-login-01-initial', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
      await page.addStyleTag({ content: MOTION_STABILIZER_CSS });

      await expect(page).toHaveScreenshot('visual-stability-login-01-initial.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.05,
      });
    });

    test('visual-stability-login-02-form-visible', async ({ page }) => {
      await page.goto('/login');
      const form = page.locator('form');
      await expect(form).toBeVisible();
      await page.addStyleTag({ content: MOTION_STABILIZER_CSS });

      await expect(page).toHaveScreenshot('visual-stability-login-02-form-visible.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.05,
      });
    });
  });
});
