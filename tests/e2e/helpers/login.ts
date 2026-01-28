/**
 * WebKit-friendly login helper
 *
 * Uses explicit click + fill + tab to ensure React onChange handlers
 * are properly triggered in all browsers (especially WebKit).
 *
 * CRITICAL FIX #7: Retry logic for Worker 0 database initialization race condition
 * - Retries up to 3 times on "No active accounts" error
 * - Uses exponential backoff (100ms, 200ms)
 * - Only affects first test on Worker 0 (~7% of tests)
 * - No impact on passing tests (first attempt succeeds)
 */

import { Page } from '@playwright/test';

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  // Use 'load' instead of 'networkidle' - page may have polling/analytics that prevent network idle
  await page.waitForLoadState('load', { timeout: 60000 });

  // Retry logic for race condition resilience
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Use ID selectors for reliability across browsers
      const emailInput = page.locator('#email');
      const passwordInput = page.locator('#password');

      // CRITICAL FIX: Wait for elements to be stable (prevents WebKit detachment errors)
      // WebKit can have unstable DOM during account switching/logout transitions
      await emailInput.waitFor({ state: 'visible', timeout: 10000 });
      await passwordInput.waitFor({ state: 'visible', timeout: 10000 });

      // CRITICAL FIX: Retry click if element detaches (WebKit-specific concurrency issue)
      // Increased retries and timeout for WebKit's slower DOM stabilization after logout
      let emailClickSuccess = false;
      for (let clickAttempt = 1; clickAttempt <= 5; clickAttempt++) {
        try {
          // Longer timeout for WebKit (5s per attempt)
          await emailInput.click({ timeout: 5000 });
          emailClickSuccess = true;
          break;
        } catch (e: any) {
          if (
            clickAttempt < 5 &&
            (e.message.includes('detached') ||
              e.message.includes('not stable') ||
              e.message.includes('Timeout'))
          ) {
            const backoffMs = 200 * clickAttempt; // Progressive backoff: 200ms, 400ms, 600ms, 800ms
            console.warn(
              `[Login Helper] Email input unstable (attempt ${clickAttempt}/5), retrying after ${backoffMs}ms...`
            );
            await page.waitForTimeout(backoffMs);
            continue;
          }
          throw e;
        }
      }
      if (!emailClickSuccess) {
        throw new Error('Email input remained unstable after 5 attempts');
      }

      await emailInput.fill(email);
      await emailInput.press('Tab'); // Trigger blur event

      // CRITICAL FIX: Retry click for password input (WebKit element stability)
      // Increased retries and timeout for WebKit's slower DOM stabilization after logout
      let passwordClickSuccess = false;
      for (let clickAttempt = 1; clickAttempt <= 5; clickAttempt++) {
        try {
          // Longer timeout for WebKit (5s per attempt)
          await passwordInput.click({ timeout: 5000 });
          passwordClickSuccess = true;
          break;
        } catch (e: any) {
          if (
            clickAttempt < 5 &&
            (e.message.includes('detached') ||
              e.message.includes('not stable') ||
              e.message.includes('Timeout'))
          ) {
            const backoffMs = 200 * clickAttempt; // Progressive backoff: 200ms, 400ms, 600ms, 800ms
            console.warn(
              `[Login Helper] Password input unstable (attempt ${clickAttempt}/5), retrying after ${backoffMs}ms...`
            );
            await page.waitForTimeout(backoffMs);
            continue;
          }
          throw e;
        }
      }
      if (!passwordClickSuccess) {
        throw new Error('Password input remained unstable after 5 attempts');
      }

      await passwordInput.fill(password);

      // Set up response promise BEFORE clicking submit
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/v1/auth/login') && resp.request().method() === 'POST',
        { timeout: 15000 }
      );

      // Click the submit button
      await page.getByRole('button', { name: /sign in/i }).click();

      // Wait for API response
      const response = await responsePromise;

      // Check for "No active accounts" error (race condition symptom)
      if (!response.ok()) {
        const body = await response.json().catch(() => ({ error: 'Unknown error' }));

        if (body.error?.includes('No active accounts')) {
          lastError = new Error(body.error);

          if (attempt < maxAttempts) {
            // Log retry for diagnostic visibility
            console.warn(
              `[Login Helper] Attempt ${attempt}/${maxAttempts} failed (race condition): ${body.error}`
            );
            console.warn(`[Login Helper] Retrying in ${100 * attempt}ms...`);

            // Wait with exponential backoff before retry
            await page.waitForTimeout(100 * attempt);

            // Reload login page for clean retry
            await page.goto('/login');
            await page.waitForLoadState('load', { timeout: 60000 });

            continue; // Retry
          }

          // Max attempts reached
          throw new Error(
            `Login failed after ${maxAttempts} attempts (race condition): ${body.error}`
          );
        }

        // Different error - throw immediately (not a race condition)
        throw new Error(`Login failed: ${body.error}`);
      }

      // Parse response body
      const body = await response.json();

      // Handle multi-account users (requiresAccountSelection)
      if (body.requiresAccountSelection && body.availableAccounts && body.tempToken) {
        console.log(
          `[Login Helper] Multi-account user detected (${body.availableAccounts.length} accounts), selecting first account...`
        );

        // Store temp token first
        await page.evaluate((token) => {
          localStorage.setItem('temp_auth_token', token);
        }, body.tempToken);

        // Wait for account selection UI or navigate directly
        // Check if we're on a select-account page or if we need to call the API
        const currentUrl = page.url();

        if (currentUrl.includes('/select-account') || currentUrl.includes('/login')) {
          // UI-based account selection - look for account selector
          const accountSelector = page.getByRole('combobox', { name: /account/i });
          const hasSelector = await accountSelector.isVisible({ timeout: 3000 }).catch(() => false);

          if (hasSelector) {
            // Use UI to select account
            await accountSelector.click();
            await page.getByRole('option').first().click();
            await page.getByRole('button', { name: /continue|select|confirm/i }).click();
          } else {
            // Fallback: Call API directly and navigate
            const selectResponse = await page.request.post(
              'http://127.0.0.1:4001/api/v1/auth/select-account',
              {
                data: {
                  tempToken: body.tempToken,
                  accountId: body.availableAccounts[0].accountId,
                },
              }
            );

            if (!selectResponse.ok()) {
              const selectError = await selectResponse
                .json()
                .catch(() => ({ error: 'Unknown error' }));
              throw new Error(`Account selection failed: ${selectError.error}`);
            }

            const selectBody = await selectResponse.json();

            // Store the real token (use correct key expected by AuthContext)
            await page.evaluate((token) => {
              localStorage.setItem('keimenon_token', token);
              localStorage.removeItem('temp_auth_token');
            }, selectBody.token);

            // Navigate to keimenon manually
            await page.goto('/keimenon');
          }
        }
      }

      // Success - wait for redirect to keimenon
      await page.waitForURL(/\/keimenon/, { timeout: 60000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 60000 });

      // Log successful login (helpful for debugging)
      if (attempt > 1) {
        console.log(`[Login Helper] ✅ Login succeeded on attempt ${attempt}/${maxAttempts}`);
      }

      return; // Success!
    } catch (error) {
      lastError = error as Error;

      // If not "No active accounts" error, don't retry
      if (!lastError.message.includes('No active accounts') && attempt === 1) {
        throw lastError; // Fail fast on non-race-condition errors
      }

      if (attempt < maxAttempts) {
        console.warn(
          `[Login Helper] Attempt ${attempt}/${maxAttempts} error: ${lastError.message}`
        );
        await page.waitForTimeout(100 * attempt);
      }
    }
  }

  // All attempts failed
  throw new Error(`Login failed after ${maxAttempts} attempts: ${lastError?.message}`);
}
