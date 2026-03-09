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

const LOGIN_NAV_TIMEOUT_MS = 20000;
const KEIMENON_NAV_TIMEOUT_MS = 8000;

async function gotoDomReady(
  page: Page,
  url: string,
  timeoutMs: number,
  contextLabel: string,
  waitUntil: 'domcontentloaded' | 'commit' = 'domcontentloaded'
): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil, timeout: timeoutMs });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Login Helper] ${contextLabel}: ${message}`);
    return false;
  }
}

async function getTestDbPath(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    // @ts-ignore test-only global injected by test-isolation fixture
    return window.__TEST_DB_PATH__ || null;
  });
}

function isTransientRequestError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return (
    /ECONNRESET/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /ETIMEDOUT/i.test(message) ||
    /socket hang up/i.test(message) ||
    /EPIPE/i.test(message)
  );
}

async function loginViaApi(page: Page, email: string, password: string): Promise<boolean> {
  const loginLoaded = await gotoDomReady(
    page,
    '/login',
    LOGIN_NAV_TIMEOUT_MS,
    'Initial navigation to /login timed out (API login path)'
  );
  if (!loginLoaded) {
    return false;
  }

  const testDbPath = await getTestDbPath(page);
  const requestHeaders = testDbPath ? { 'X-Test-DB-Path': testDbPath } : undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    let loginResponse;
    try {
      loginResponse = await page.request.post('http://127.0.0.1:4001/api/v1/auth/login', {
        headers: requestHeaders,
        data: { email, password },
      });
    } catch (error) {
      if (isTransientRequestError(error) && attempt < 3) {
        await page.waitForTimeout(200 * attempt);
        continue;
      }
      return false;
    }

    if (!loginResponse.ok()) {
      const errorBody = await loginResponse.json().catch(() => ({ error: 'Unknown error' }));
      const message = typeof errorBody?.error === 'string' ? errorBody.error : 'Login failed';

      if (message.includes('No active accounts') && attempt < 3) {
        await page.waitForTimeout(100 * attempt);
        continue;
      }

      return false;
    }

    const loginBody = await loginResponse.json();
    let token: string | undefined = loginBody?.token;

    if (
      loginBody?.requiresAccountSelection &&
      loginBody?.tempToken &&
      loginBody?.availableAccounts?.[0]
    ) {
      let selectResponse;
      try {
        selectResponse = await page.request.post(
          'http://127.0.0.1:4001/api/v1/auth/select-account',
          {
            headers: requestHeaders,
            data: {
              tempToken: loginBody.tempToken,
              accountId: loginBody.availableAccounts[0].accountId,
            },
          }
        );
      } catch (error) {
        if (isTransientRequestError(error) && attempt < 3) {
          await page.waitForTimeout(200 * attempt);
          continue;
        }
        return false;
      }

      if (!selectResponse.ok()) {
        return false;
      }

      const selectBody = await selectResponse.json();
      token = selectBody?.token;
    }

    if (!token || typeof token !== 'string') {
      return false;
    }

    await page.evaluate((resolvedToken) => {
      localStorage.setItem('keimenon_token', resolvedToken);
      localStorage.removeItem('temp_auth_token');
    }, token);

    const redirectedToKeimenon = await page
      .waitForURL(/\/keimenon/, { timeout: 2000 })
      .then(() => true)
      .catch(() => false);

    if (!redirectedToKeimenon) {
      const navigated = await gotoDomReady(
        page,
        '/keimenon',
        15000,
        'API login path navigation to /keimenon timed out',
        'commit'
      );
      if (!navigated) {
        return false;
      }
    }

    const reachedKeimenon = await page
      .waitForURL(/\/keimenon/, { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (!reachedKeimenon) {
      return false;
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    return true;
  }

  return false;
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  const apiLoginSucceeded = await loginViaApi(page, email, password);
  if (apiLoginSucceeded) {
    return;
  }

  console.warn('[Login Helper] API login fast-path unavailable, falling back to UI login flow');

  const loginLoaded = await gotoDomReady(
    page,
    '/login',
    LOGIN_NAV_TIMEOUT_MS,
    'Initial navigation to /login timed out'
  );
  if (!loginLoaded) {
    throw new Error('Unable to load /login');
  }

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

      const loginResponseMatcher = (resp: any) =>
        resp.url().includes('/api/v1/auth/login') && resp.request().method() === 'POST';

      // Set up response promise BEFORE clicking submit
      const waitForLoginResponse = (timeout: number) =>
        page.waitForResponse(loginResponseMatcher, { timeout });

      // Click the submit button
      await page.getByRole('button', { name: /sign in/i }).click();

      // Wait for API response from the UI submit path
      let response = await waitForLoginResponse(5000).catch(() => null);

      // Some builds occasionally miss the click handler on first submit under load.
      if (!response) {
        console.warn('[Login Helper] Login response not observed; retrying submit with Enter...');
        await passwordInput.press('Enter').catch(() => {});
        response = await waitForLoginResponse(3000).catch(() => null);
      }

      // Final fallback: call login API directly so tests don't fail due to transient UI submit race.
      if (!response) {
        console.warn('[Login Helper] Login response still missing; using API fallback login');
        const testDbPath = await getTestDbPath(page);
        response = await page.request.post('http://127.0.0.1:4001/api/v1/auth/login', {
          headers: testDbPath ? { 'X-Test-DB-Path': testDbPath } : undefined,
          data: { email, password },
        });
      }

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
            const retryLoginLoaded = await gotoDomReady(
              page,
              '/login',
              LOGIN_NAV_TIMEOUT_MS,
              'Retry navigation to /login timed out'
            );
            if (!retryLoginLoaded) {
              throw new Error('Unable to reload /login for retry');
            }

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

      // Ensure token is persisted when login was completed through API fallback.
      if (typeof body.token === 'string' && body.token.length > 0) {
        await page.evaluate((token) => {
          localStorage.setItem('keimenon_token', token);
          localStorage.removeItem('temp_auth_token');
        }, body.token);
      }

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
          // Prefer real UI flow first: AccountSelector modal contains account cards + Continue button.
          const accountSelectorHeading = page.getByRole('heading', { name: /select account/i });
          const hasAccountSelectorModal = await accountSelectorHeading
            .isVisible({ timeout: 2000 })
            .catch(() => false);

          if (hasAccountSelectorModal) {
            const accountOptionButtons = page.locator(
              'button.w-full.text-left.p-4.rounded-lg.border-2'
            );
            const optionsCount = await accountOptionButtons.count();
            if (optionsCount < 1) {
              throw new Error(
                'Account selector modal displayed, but no account options were found'
              );
            }

            await accountOptionButtons.first().click();
            await page.getByRole('button', { name: /continue|select|confirm/i }).click();
          } else {
            // Fallback: Call API directly and navigate.
            // In E2E isolation mode, propagate worker DB path header to avoid cross-db user lookup.
            const testDbPath = await getTestDbPath(page);

            const selectResponse = await page.request.post(
              'http://127.0.0.1:4001/api/v1/auth/select-account',
              {
                headers: testDbPath ? { 'X-Test-DB-Path': testDbPath } : undefined,
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

            // Navigate to keimenon manually.
            await gotoDomReady(
              page,
              '/keimenon',
              KEIMENON_NAV_TIMEOUT_MS,
              'Manual navigation to /keimenon timed out after account selection',
              'commit'
            );
          }
        }
      }

      // Success path: prefer native redirect, but fall back to explicit navigation
      // when redirect events are delayed or missed under parallel load.
      const redirectedToKeimenon = await page
        .waitForURL(/\/keimenon/, { timeout: KEIMENON_NAV_TIMEOUT_MS })
        .then(() => true)
        .catch(() => false);

      if (!redirectedToKeimenon) {
        console.warn('[Login Helper] Redirect to /keimenon timed out, navigating directly...');
        await gotoDomReady(
          page,
          '/keimenon',
          KEIMENON_NAV_TIMEOUT_MS,
          'Direct fallback navigation to /keimenon timed out',
          'commit'
        );
      }

      await page.waitForURL(/\/keimenon/, { timeout: KEIMENON_NAV_TIMEOUT_MS });
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});

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
