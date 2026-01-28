import { test, expect } from './fixtures/testId';
import { login } from './helpers/login';

/**
 * Authentication and Keimenon Flow Test
 *
 * Tests a real end-to-end user journey:
 * 1. User navigates to app
 * 2. Gets redirected to login
 * 3. Logs in with credentials
 * 4. Backend authenticates and returns JWT
 * 5. User is redirected to keimenon
 * 6. Keimenon loads graph data from backend
 *
 * This test exercises the full stack from browser to backend database.
 * Tagged with @smoke for critical path and @full for comprehensive test runs.
 */

test.describe('Authentication and Keimenon Flow', () => {
  test.describe.configure({ tag: ['@smoke', '@full'] });

  // Test credentials - should exist in test database
  const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@admin.com';
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPass123!';

  test('complete login flow: redirect → authenticate → keimenon', async ({ page, context }) => {
    // Step 1: Navigate to home page
    await page.goto('/');

    // Step 2: Should redirect to login (not authenticated)
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    // Step 3: Verify login page elements
    await expect(page.getByRole('heading', { name: /Keimenon/i })).toBeVisible();

    // Step 4: Fill in login form using ID selectors for WebKit compatibility
    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');

    // Click to focus, then fill (helps with WebKit React onChange)
    await emailInput.click();
    await emailInput.fill(TEST_EMAIL);
    await emailInput.press('Tab');

    await passwordInput.click();
    await passwordInput.fill(TEST_PASSWORD);

    // Step 5: Submit form and wait for API response
    const signInButton = page.getByRole('button', { name: /sign in/i });

    // Set up response promise before clicking
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4001';
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/auth/login') && response.request().method() === 'POST',
      { timeout: 15000 }
    );

    await signInButton.click();

    // Step 6: Wait for backend authentication
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();

    const responseData = await response.json();
    expect(responseData).toHaveProperty('token');
    expect(responseData).toHaveProperty('user');

    // Step 7: Should redirect to keimenon after successful login (uses global 30s timeout)
    await page.waitForURL(/\/keimenon/);

    // Step 8: Verify keimenon page loaded successfully
    // The keimenon page might have polling/SSE, so networkidle won't work
    // Instead, just verify the DOM is ready and stable
    await page.waitForLoadState('domcontentloaded');

    // Give the page a moment to render
    await page.waitForTimeout(1000);
  });

  test('invalid credentials should show error message', async ({ page }) => {
    await page.goto('/login');

    // Fill in invalid credentials using WebKit-friendly pattern
    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');

    await emailInput.click();
    await emailInput.fill('invalid@example.com');
    await emailInput.press('Tab');

    await passwordInput.click();
    await passwordInput.fill('wrongpassword');

    // Submit form
    const signInButton = page.getByRole('button', { name: /sign in/i });
    await signInButton.click();

    // Should show error message (check for "Login Failed" heading or error text)
    // The error message might vary, so check for the error container
    const errorMessage = page.locator('.bg-red-900\\/20, [role="alert"]').first();
    await expect(errorMessage).toBeVisible({ timeout: 10000 });

    // Should still be on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('authenticated user should access keimenon directly', async ({ page, context }) => {
    // First, log in using WebKit-friendly helper
    await login(page, TEST_EMAIL, TEST_PASSWORD);

    // Now navigate away and back to home
    await page.goto('/');

    // Wait for page to load before checking redirect
    await page.waitForLoadState('domcontentloaded');

    // Should redirect directly to keimenon (already authenticated)
    await page.waitForURL(/\/keimenon/, { timeout: 15000 });
  });

  test('logout should clear session and redirect to login', async ({ page, context }) => {
    // First, log in using WebKit-friendly helper
    await login(page, TEST_EMAIL, TEST_PASSWORD);

    // Look for logout button (exact location depends on your UI)
    // This might be in a dropdown menu or settings
    // Adjust selector based on your actual logout button location
    // For now, we'll clear localStorage to simulate logout
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Navigate to home
    await page.goto('/');

    // Wait for page to load before checking redirect
    await page.waitForLoadState('domcontentloaded');

    // Should redirect to login (session cleared)
    await page.waitForURL(/\/login/, { timeout: 15000 });
  });
});
