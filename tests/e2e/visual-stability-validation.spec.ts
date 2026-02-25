import { test, expect } from './fixtures/test-isolation';

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
      // Login via API to save time and set state
      const response = await apiRequest.post('/api/v1/auth/login', {
        data: TEST_USER,
      });
      const auth = await response.json();
      
      // Set the token in local storage or cookies as the app expects
      // Assuming typical token storage; adjust if app uses cookies only
      await page.addInitScript((token) => {
        localStorage.setItem('auth_token', token);
      }, auth.token);

      // Navigate to main application page
      await page.goto('/keimenon');
      // Wait for network idle to ensure assets are loaded
      await page.waitForLoadState('networkidle');
    });

    test('visual-stability-01-canvas-initial', async ({ page }) => {
      // Wait for canvas to be ready (look for specific canvas element or loader to disappear)
      await page.waitForSelector('canvas', { state: 'visible' });
      // Arbitrary wait for animation/physics to settle (if any)
      await page.waitForTimeout(2000);

      // Take snapshot of the entire page
      await expect(page).toHaveScreenshot('visual-stability-01-canvas-initial.png', {
        fullPage: false,
        maxDiffPixelRatio: 0.05, // Allow slight rendering differences
      });
    });

    test('visual-stability-02-header-visible', async ({ page }) => {
        // Focus on header area
        const header = page.locator('header').first();
        await expect(header).toBeVisible();
        
        await expect(page).toHaveScreenshot('visual-stability-02-header-visible.png', {
            clip: { x: 0, y: 0, width: 1280, height: 100 } // Approximate header area
        });
    });

    test('visual-stability-03-sidebar-present', async ({ page }) => {
        // Ensure sidebar is visible
        const sidebar = page.locator('aside, .sidebar').first();
        await expect(sidebar).toBeVisible();

        await expect(page).toHaveScreenshot('visual-stability-03-sidebar-present.png', {
            clip: { x: 0, y: 0, width: 300, height: 720 } // Approximate sidebar area
        });
    });
  });

  test.describe('Unauthenticated States', () => {
    test('visual-stability-login-01-initial', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
      
      await expect(page).toHaveScreenshot('visual-stability-login-01-initial.png');
    });

    test('visual-stability-login-02-form-visible', async ({ page }) => {
        await page.goto('/login');
        const form = page.locator('form');
        await expect(form).toBeVisible();
        
        await expect(page).toHaveScreenshot('visual-stability-login-02-form-visible.png');
    });
  });
});
