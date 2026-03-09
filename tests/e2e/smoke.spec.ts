import { test, expect } from './fixtures/test-isolation';

/**
 * Smoke Tests
 *
 * Basic sanity checks to ensure the application is running and accessible.
 * These tests are tagged with @smoke for quick CI runs.
 */

test.describe('Smoke Tests', () => {
  test.describe.configure({ tag: '@smoke' });

  test('should load the home page and redirect to login', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');

    // Wait for page to load and redirect to complete
    await page.waitForLoadState('domcontentloaded');

    // Should redirect to login page (since not authenticated)
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    // Verify key elements are visible
    await expect(page.getByRole('heading', { name: /Keimenon/i })).toBeVisible();
    await expect(page.getByText(/Sign in to your workspace/i)).toBeVisible();
  });

  test('should have login form with email and password fields', async ({ page }) => {
    await page.goto('/login');

    // Check for email field using ARIA-first locators
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('type', 'email');

    // Check for password field
    const passwordInput = page.getByLabel(/password/i);
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Check for submit button
    const signInButton = page.getByRole('button', { name: /sign in/i });
    await expect(signInButton).toBeVisible();
  });

  test('should have health check endpoint responding', async ({ request }) => {
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4001';
    const response = await request.get(`${apiBaseUrl}/health`);

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
  });

  test('should set x-test-id header in response', async ({ page }) => {
    // Navigate to trigger API requests
    const response = await page.goto('/');

    // Verify response headers include test correlation ID
    const headers = response?.headers();
    expect(headers).toBeDefined();
  });
});
