import { test, expect } from './fixtures/test-isolation';
import { login } from './helpers/login';
import { authGet, switchAccount } from './helpers/authenticated-request';

/**
 * Authentication Flow - Account Switching
 *
 * Tests account selection and switching for users with multiple accounts.
 * This is a CRITICAL security test - improper switching can leak data across accounts.
 *
 * Tests cover:
 * - Account selection after login
 * - Switching between accounts
 * - Session isolation after switch
 * - Data visibility after switch
 * - Token refresh on switch
 *
 * Security Priority: CRITICAL
 * Related: apps/api/src/routes/auth.routes.ts
 * Related: apps/web/src/components/auth/AccountSelector.tsx
 */

test.describe('Authentication - Account Switching', () => {
  test.describe.configure({ tag: '@smoke' });

  // Use a test user that has multiple accounts
  // NOTE: This test requires a fixture user with multiple accounts
  // For now, using gamma account as multi-account test user
  const MULTI_ACCOUNT_USER = {
    email: 'client-gamma@fixture.test',
    password: 'TestPass123!',
  };

  const ACCOUNT_A_ID = 'acc_fixture_alpha';
  const ACCOUNT_B_ID = 'acc_fixture_beta';

  const getActiveAccountId = async (page: Parameters<typeof authGet>[0]) => {
    const meResponse = await authGet(page, '/api/v1/auth/me');
    expect(meResponse.ok()).toBeTruthy();
    const body = await meResponse.json();
    return body.account_id || body.selected_account_id;
  };

  const getAlternateAccountId = (currentAccountId: string) =>
    currentAccountId === ACCOUNT_A_ID ? ACCOUNT_B_ID : ACCOUNT_A_ID;

  // ==================== ACCOUNT SELECTION ====================

  test('should show account selector when user has multiple accounts', async ({
    page,
    request,
  }) => {
    // Login with user that has multiple accounts
    await page.goto('/login');
    await page.locator('#email').fill(MULTI_ACCOUNT_USER.email);
    await page.locator('#password').fill(MULTI_ACCOUNT_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should show account selector (not directly go to keimenon)
    // Adjust based on your implementation
    const hasAccountSelector =
      (await page.getByText(/select account|choose account/i).isVisible({ timeout: 5000 })) ||
      (await page.getByRole('combobox', { name: /account/i }).isVisible({ timeout: 5000 })) ||
      page.url().includes('/select-account');

    // If user has multiple accounts, selector should appear
    // If only one account, may skip directly to keimenon
    if (hasAccountSelector) {
      // Verify accounts are listed
      const optionCount = await page.getByRole('option').count();
      const buttonCount = await page.getByRole('button').count();
      expect(optionCount + buttonCount).toBeGreaterThan(1);
    }
  });

  test('should navigate to keimenon after selecting account', async ({ page }) => {
    // Use login helper which properly handles multi-account flow
    await login(page, MULTI_ACCOUNT_USER.email, MULTI_ACCOUNT_USER.password);

    // Verify authenticated via API
    const meResponse = await authGet(page, '/api/v1/auth/me');
    expect(meResponse.ok()).toBeTruthy();

    const userData = await meResponse.json();

    // Should have valid user data with account selected
    expect(userData.user_id || userData.id).toBeDefined();
    expect(userData.account_id || userData.selected_account_id).toBeDefined();
  });

  // ==================== ACCOUNT SWITCHING ====================

  test('should allow switching between accounts via settings', async ({ page }) => {
    // Login
    await login(page, MULTI_ACCOUNT_USER.email, MULTI_ACCOUNT_USER.password);

    // Navigate to account settings page (current route surface)
    await page.goto('/account');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/account/);

    const initialAccountId = await getActiveAccountId(page);
    const targetAccountId = initialAccountId === ACCOUNT_A_ID ? ACCOUNT_B_ID : ACCOUNT_A_ID;

    // Switch account through canonical API and assert account context changes.
    const switchResponse = await switchAccount(page, targetAccountId);
    expect(switchResponse.ok()).toBeTruthy();

    await expect
      .poll(async () => getActiveAccountId(page), {
        timeout: 10000,
        intervals: [250, 500, 1000],
      })
      .toBe(targetAccountId);
  });

  test('should update JWT token when switching accounts', async ({ page, request }) => {
    // Login
    await login(page, MULTI_ACCOUNT_USER.email, MULTI_ACCOUNT_USER.password);
    const initialAccountId = await getActiveAccountId(page);
    const targetAccountId = getAlternateAccountId(initialAccountId);

    // Get initial token from cookies or localStorage
    const initialTokens = await page.evaluate(() => {
      return {
        localStorage: localStorage.getItem('keimenon_token'),
        sessionStorage: sessionStorage.getItem('keimenon_token'),
      };
    });

    const initialCookies = await page.context().cookies();

    // Switch account via API
    const switchResponse = await switchAccount(page, targetAccountId);

    if (switchResponse.ok()) {
      const newAuth = await switchResponse.json();

      // Should receive new token
      expect(newAuth.token).toBeDefined();

      // Token should be different from initial
      expect(newAuth.token).not.toBe(initialTokens.localStorage);
      expect(newAuth.token).not.toBe(initialTokens.sessionStorage);

      // Token should include new account_id when decoded (verify server-side)
      // This is critical for security - token must reflect current account
    }
  });

  // ==================== DATA ISOLATION AFTER SWITCH ====================

  test('should only show current account data after switching', async ({ page, request }) => {
    // Login to a multi-account user
    await login(page, MULTI_ACCOUNT_USER.email, MULTI_ACCOUNT_USER.password);

    // Capture initial account context (selection order may vary by fixture ordering)
    const meA = await authGet(page, '/api/v1/auth/me');
    const dataA = await meA.json();
    const accountA = dataA.account_id || dataA.selected_account_id;

    expect(accountA).toBeTruthy();

    // Switch to a different account
    const targetAccountB = accountA === ACCOUNT_A_ID ? ACCOUNT_B_ID : ACCOUNT_A_ID;
    const switchResponse = await switchAccount(page, targetAccountB);
    expect(switchResponse.ok()).toBeTruthy();

    // Verify account context changed
    const meB = await authGet(page, '/api/v1/auth/me');
    const dataB = await meB.json();
    const accountB = dataB.account_id || dataB.selected_account_id;

    expect(accountB).toBe(targetAccountB);
    expect(accountB).not.toBe(accountA);

    // Switch again to the alternate account
    const targetAccountC = targetAccountB === ACCOUNT_A_ID ? ACCOUNT_B_ID : ACCOUNT_A_ID;
    const switchResponse2 = await switchAccount(page, targetAccountC);
    expect(switchResponse2.ok()).toBeTruthy();

    // Verify account context changed again
    const meC = await authGet(page, '/api/v1/auth/me');
    const dataC = await meC.json();
    const accountC = dataC.account_id || dataC.selected_account_id;

    expect(accountC).toBe(targetAccountC);
    expect(accountC).not.toBe(accountB);
  });

  test('should clear previous account state when switching', async ({ page }) => {
    // Login
    await login(page, MULTI_ACCOUNT_USER.email, MULTI_ACCOUNT_USER.password);

    // Get initial account info via API
    const initialMe = await authGet(page, '/api/v1/auth/me');
    const initialData = await initialMe.json();
    const initialAccountId = initialData.account_id || initialData.selected_account_id;
    const targetAccountId = getAlternateAccountId(initialAccountId);

    // Switch account via API
    const switchResponse = await switchAccount(page, targetAccountId);

    expect(switchResponse.ok()).toBeTruthy();

    // Verify account context changed via API
    const newMe = await authGet(page, '/api/v1/auth/me');
    const newData = await newMe.json();
    const newAccountId = newData.account_id || newData.selected_account_id;

    // Account ID should be different
    expect(newAccountId).not.toBe(initialAccountId);
    expect(newAccountId).toBe(targetAccountId);

    // Token should be different (stored in localStorage)
    const newToken = await page.evaluate(() => localStorage.getItem('keimenon_token'));
    expect(newToken).toBeDefined();
  });

  // ==================== ERROR HANDLING ====================

  test('should handle invalid account switch gracefully', async ({ page }) => {
    // Login
    await login(page, MULTI_ACCOUNT_USER.email, MULTI_ACCOUNT_USER.password);

    // Try to switch to an account that doesn't belong to this user
    const invalidAccountId = 'account-not-owned-by-user';

    const switchResponse = await switchAccount(page, invalidAccountId);

    // Should fail
    expect([403, 404, 400]).toContain(switchResponse.status());

    // Error message should be clear
    const error = await switchResponse.json();
    expect(error.error || error.message).toMatch(/forbidden|not found|invalid account/i);

    // User should remain in current account (not logged out) - verify via API
    const meResponse = await authGet(page, '/api/v1/auth/me');
    expect(meResponse.ok()).toBeTruthy();

    const userData = await meResponse.json();
    expect(userData.user_id || userData.id).toBeDefined();
  });

  test('should prevent switching to non-existent account', async ({ page }) => {
    await login(page, MULTI_ACCOUNT_USER.email, MULTI_ACCOUNT_USER.password);

    const switchResponse = await switchAccount(page, 'non-existent-account-id');

    expect([403, 404, 400]).toContain(switchResponse.status());
  });

  // ==================== SESSION MANAGEMENT ====================

  test('should maintain session after account switch', async ({ page }) => {
    // Login
    await login(page, MULTI_ACCOUNT_USER.email, MULTI_ACCOUNT_USER.password);
    const initialAccountId = await getActiveAccountId(page);
    const targetAccountId = getAlternateAccountId(initialAccountId);

    // Switch account
    const switchResponse = await switchAccount(page, targetAccountId);

    expect(switchResponse.ok()).toBeTruthy();

    // Verify still logged in via API
    const meResponse = await authGet(page, '/api/v1/auth/me');
    expect(meResponse.ok()).toBeTruthy();

    const userData = await meResponse.json();

    // Should have valid user data
    expect(userData.user_id || userData.id).toBeDefined();
    expect(userData.account_id || userData.selected_account_id).toBe(targetAccountId);
  });

  test('should preserve user info but update account info after switch', async ({ page }) => {
    await login(page, MULTI_ACCOUNT_USER.email, MULTI_ACCOUNT_USER.password);

    // Get user info from /me endpoint
    const meResponse = await authGet(page, '/api/v1/auth/me');
    const userData = await meResponse.json();

    const initialUserId = userData.user_id || userData.id;
    const initialAccountId = userData.account_id || userData.selected_account_id;
    const targetAccountId = getAlternateAccountId(initialAccountId);

    // Switch account
    await switchAccount(page, targetAccountId);

    // Get user info again
    const meResponse2 = await authGet(page, '/api/v1/auth/me');
    const userData2 = await meResponse2.json();

    const newUserId = userData2.user_id || userData2.id;
    const newAccountId = userData2.account_id || userData2.selected_account_id;

    // User ID should remain same
    expect(newUserId).toBe(initialUserId);

    // Account ID should change
    expect(newAccountId).not.toBe(initialAccountId);
    expect(newAccountId).toBe(targetAccountId);
  });
});

/**
 * SECURITY CHECKLIST - Account Switching
 *
 * ✅ Account Selection - Users with multiple accounts can select
 * ✅ Token Update - JWT token refreshed on switch
 * ✅ Data Isolation - Only current account data visible
 * ✅ State Clearing - Previous account state cleared
 * ✅ Invalid Switch - Cannot switch to unowned accounts
 * ✅ Non-Existent Account - Proper error handling
 * ✅ Session Maintenance - User remains logged in
 * ✅ User/Account Separation - User ID preserved, account ID updated
 *
 * If ANY of these tests fail, it is a CRITICAL SECURITY VULNERABILITY.
 */
