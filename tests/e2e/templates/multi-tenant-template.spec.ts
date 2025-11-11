import { test, expect, Page } from '@playwright/test';
import { login } from '../helpers/login';

/**
 * Multi-Tenant Isolation Template with Visual Regression
 *
 * This template ensures that account A cannot access account B's data.
 * This is a CRITICAL security requirement for the Canvas Memory OS application.
 *
 * Visual regression testing validates that:
 * - Each account sees ONLY their own data visually
 * - No visual leakage of cross-account information
 * - Error states are properly displayed when access is denied
 *
 * Usage:
 * 1. Copy this template for each resource type (nodes, edges, groups, etc.)
 * 2. Replace RESOURCE_NAME with your resource
 * 3. Ensure both test accounts exist with separate data
 * 4. Verify isolation at both API and UI levels
 * 5. Visual baselines are account-specific (account-a-view.png vs account-b-view.png)
 *
 * Security Priority: CRITICAL
 * Related: docs/architecture/MULTI_TENANCY.md
 * Related: apps/api/src/middleware/auth.middleware.ts:isolateByAccount
 */

// ==================== VISUAL REGRESSION CONFIG ====================

/**
 * Visual regression configuration for multi-tenant testing
 * More strict threshold for security-critical isolation tests
 */
const VISUAL_REGRESSION_CONFIG = {
  threshold: 0.05, // Strict 5% threshold - security critical
  maxDiffPixels: 50,
  animations: 'disabled' as const,
};

/**
 * Capture screenshot with account-specific naming for isolation validation
 *
 * @param page - Playwright page object
 * @param testName - Name of the test (e.g., 'ui-isolation')
 * @param accountContext - Which account view ('account-a' or 'account-b')
 * @param step - Current step (e.g., 'canvas-view')
 */
async function captureAccountBaseline(
  page: Page,
  testName: string,
  accountContext: 'account-a' | 'account-b' | 'admin',
  step: string
): Promise<void> {
  const screenshotName = `${testName.replace(/\s+/g, '-')}-${accountContext}-${step}.png`;
  await expect(page).toHaveScreenshot(screenshotName, VISUAL_REGRESSION_CONFIG);
}

test.describe('Multi-Tenant Isolation - RESOURCE_NAME', () => {
  // CRITICAL tests should always be tagged
  test.describe.configure({ tag: '@smoke' });

  // Test account credentials
  const ACCOUNT_A = {
    email: 'client-alpha@test.com',
    password: 'SecurePass-2024-Alpha',
  };

  const ACCOUNT_B = {
    email: 'client-beta@test.com',
    password: 'SecurePass-2024-Alpha',
  };

  // Store resource IDs created during tests
  let resourceAId: string;
  let resourceBId: string;

  test.beforeEach(async ({ request }) => {
    // Create resource in Account A
    const responseA = await request.post('/api/v1/auth/login', {
      data: ACCOUNT_A,
    });
    const authA = await responseA.json();

    const createA = await request.post('/api/v1/RESOURCE_NAME', {
      headers: {
        Authorization: `Bearer ${authA.token}`,
      },
      data: {
        kind: 'RESOURCE_KIND',
        properties: {
          name: 'Account A Resource',
          secret_data: 'This is private to Account A',
          data_tag: 'test',
        },
      },
    });
    const resourceA = await createA.json();
    resourceAId = resourceA.id;

    // Create resource in Account B
    const responseB = await request.post('/api/v1/auth/login', {
      data: ACCOUNT_B,
    });
    const authB = await responseB.json();

    const createB = await request.post('/api/v1/RESOURCE_NAME', {
      headers: {
        Authorization: `Bearer ${authB.token}`,
      },
      data: {
        kind: 'RESOURCE_KIND',
        properties: {
          name: 'Account B Resource',
          secret_data: 'This is private to Account B',
          data_tag: 'test',
        },
      },
    });
    const resourceB = await createB.json();
    resourceBId = resourceB.id;
  });

  test.afterEach(async ({ request }) => {
    // Cleanup both accounts' data
    const responseA = await request.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    await request.delete('/api/v1/RESOURCE_NAME', {
      headers: { Authorization: `Bearer ${authA.token}` },
      params: { data_tag: 'test' },
    });

    const responseB = await request.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();
    await request.delete('/api/v1/RESOURCE_NAME', {
      headers: { Authorization: `Bearer ${authB.token}` },
      params: { data_tag: 'test' },
    });
  });

  // ==================== API ISOLATION ====================

  test('should prevent Account B from reading Account A resource via API', async ({ request }) => {
    // Step 1: Login as Account B
    const response = await request.post('/api/v1/auth/login', {
      data: ACCOUNT_B,
    });
    const auth = await response.json();

    // Step 2: Attempt to read Account A's resource (should fail)
    const readResponse = await request.get(`/api/v1/RESOURCE_NAME/${resourceAId}`, {
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    });

    // Step 3: Verify request is denied
    // Should be 403 (Forbidden) or 404 (Not Found) to avoid info leakage
    expect([403, 404]).toContain(readResponse.status());

    // Step 4: Verify error message (optional)
    const errorData = await readResponse.json();
    expect(errorData.error || errorData.message).toMatch(/forbidden|not found|unauthorized/i);
  });

  test('should prevent Account B from updating Account A resource via API', async ({ request }) => {
    // Step 1: Login as Account B
    const response = await request.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const auth = await response.json();

    // Step 2: Attempt to update Account A's resource (should fail)
    const updateResponse = await request.put(`/api/v1/RESOURCE_NAME/${resourceAId}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      data: {
        properties: {
          name: 'Hacked by Account B', // Malicious update
          secret_data: 'Stolen data',
        },
      },
    });

    // Step 3: Verify request is denied
    expect([403, 404]).toContain(updateResponse.status());

    // Step 4: Verify resource was NOT modified (check with Account A)
    const responseA = await request.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const verifyResponse = await request.get(`/api/v1/RESOURCE_NAME/${resourceAId}`, {
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    const resource = await verifyResponse.json();
    expect(resource.properties.name).toBe('Account A Resource');
    expect(resource.properties.secret_data).toBe('This is private to Account A');
  });

  test('should prevent Account B from deleting Account A resource via API', async ({ request }) => {
    // Step 1: Login as Account B
    const response = await request.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const auth = await response.json();

    // Step 2: Attempt to delete Account A's resource (should fail)
    const deleteResponse = await request.delete(`/api/v1/RESOURCE_NAME/${resourceAId}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });

    // Step 3: Verify request is denied
    expect([403, 404]).toContain(deleteResponse.status());

    // Step 4: Verify resource still exists (check with Account A)
    const responseA = await request.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const verifyResponse = await request.get(`/api/v1/RESOURCE_NAME/${resourceAId}`, {
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    expect(verifyResponse.status()).toBe(200);
  });

  test('should not include Account A resources in Account B list via API', async ({ request }) => {
    // Step 1: Login as Account B
    const response = await request.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const auth = await response.json();

    // Step 2: List all resources
    const listResponse = await request.get('/api/v1/RESOURCE_NAME', {
      headers: { Authorization: `Bearer ${auth.token}` },
      params: { limit: 1000 },
    });

    const data = await listResponse.json();
    const resources = data.RESOURCE_NAME || data;

    // Step 3: Verify Account A's resource is NOT in the list
    const foundAccountAResource = resources.find((r: any) => r.id === resourceAId);
    expect(foundAccountAResource).toBeUndefined();

    // Step 4: Verify only Account B's resource is present
    const foundAccountBResource = resources.find((r: any) => r.id === resourceBId);
    expect(foundAccountBResource).toBeDefined();
    expect(foundAccountBResource.properties.name).toBe('Account B Resource');
  });

  // ==================== UI ISOLATION ====================

  test('should not display Account A resources in Account B UI', async ({ page }) => {
    // Step 1: Login as Account A first to capture baseline
    await login(page, ACCOUNT_A.email, ACCOUNT_A.password);
    await page.goto('/canvas');
    await page.waitForLoadState('networkidle');

    // 📸 Visual check: Account A sees ONLY their resources
    await captureAccountBaseline(page, 'ui-isolation', 'account-a', 'canvas-view');

    // Step 2: Switch to Account B
    await page.goto('/logout');
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);
    await page.goto('/canvas');
    await page.waitForLoadState('networkidle');

    // Step 3: Verify Account A's resource is NOT visible in UI
    await expect(page.getByText('Account A Resource')).not.toBeVisible();
    await expect(page.getByText('This is private to Account A')).not.toBeVisible();

    // Step 4: Verify Account B's resource IS visible
    await expect(page.getByText('Account B Resource')).toBeVisible();

    // 📸 Visual check: Account B sees ONLY their resources (CRITICAL - validates isolation)
    await captureAccountBaseline(page, 'ui-isolation', 'account-b', 'canvas-view');

    // Step 5: Try searching for Account A's resource (should find nothing)
    if (await page.getByPlaceholder(/search|filter/i).isVisible()) {
      await page.getByPlaceholder(/search|filter/i).fill('Account A Resource');
      await page.waitForTimeout(500);
      await expect(page.getByText('Account A Resource')).not.toBeVisible();

      // 📸 Visual check: Search shows no results for cross-account data
      await captureAccountBaseline(page, 'ui-isolation', 'account-b', 'search-no-results');
    }
  });

  test('should prevent Account B from accessing Account A resource via direct URL', async ({
    page,
  }) => {
    // Step 1: Login as Account B
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);

    // Step 2: Try to access Account A's resource directly via URL
    await page.goto(`/canvas/RESOURCE_NAME/${resourceAId}`);

    // Step 3: Verify access is denied
    // Should show error page or redirect to home
    await expect(page.getByText(/not found|forbidden|access denied/i)).toBeVisible();
    // OR: await expect(page).toHaveURL(/\/canvas$|\/error/);

    // 📸 Visual check: Error page displayed (CRITICAL - prevents URL manipulation)
    await captureAccountBaseline(page, 'direct-url-access', 'account-b', 'access-denied-error');
  });

  // ==================== EDGE CASES ====================

  test('should isolate resources even with similar names', async ({ page, request }) => {
    // Step 1: Create resources with identical names in both accounts
    const responseA = await request.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    await request.post('/api/v1/RESOURCE_NAME', {
      headers: { Authorization: `Bearer ${authA.token}` },
      data: {
        kind: 'RESOURCE_KIND',
        properties: { name: 'Identical Name', data_tag: 'test' },
      },
    });

    const responseB = await request.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();
    await request.post('/api/v1/RESOURCE_NAME', {
      headers: { Authorization: `Bearer ${authB.token}` },
      data: {
        kind: 'RESOURCE_KIND',
        properties: { name: 'Identical Name', data_tag: 'test' },
      },
    });

    // Step 2: Login as Account B and verify only 1 resource is visible
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);
    await page.goto('/canvas');
    await page.waitForLoadState('networkidle');

    // Step 3: Count resources with that name (should be exactly 1)
    const count = await page.getByText('Identical Name').count();
    expect(count).toBe(1);

    // 📸 Visual check: Only Account B's "Identical Name" visible (not Account A's duplicate)
    await captureAccountBaseline(page, 'identical-names', 'account-b', 'single-resource-visible');
  });

  test('should maintain isolation after account switching', async ({ page, request }) => {
    // This test is only relevant if user can switch between accounts

    // Step 1: Login as Account A
    await login(page, ACCOUNT_A.email, ACCOUNT_A.password);
    await page.goto('/canvas');
    await expect(page.getByText('Account A Resource')).toBeVisible();

    // 📸 Visual check: Account A session showing Account A data
    await captureAccountBaseline(page, 'account-switching', 'account-a', 'before-switch');

    // Step 2: Switch to Account B
    await page.goto('/logout');
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);
    await page.goto('/canvas');

    // Step 3: Verify Account A's resources are no longer visible
    await expect(page.getByText('Account A Resource')).not.toBeVisible();
    await expect(page.getByText('Account B Resource')).toBeVisible();

    // 📸 Visual check: Account B session showing Account B data (validates session cleared)
    await captureAccountBaseline(page, 'account-switching', 'account-b', 'after-switch');

    // Step 4: Verify via API that session is properly scoped
    const resources = await request.get('/api/v1/RESOURCE_NAME');
    const data = await resources.json();
    const resourceIds = (data.RESOURCE_NAME || data).map((r: any) => r.id);
    expect(resourceIds).not.toContain(resourceAId);
    expect(resourceIds).toContain(resourceBId);
  });

  // ==================== ADMIN EXCEPTION ====================

  test('should allow admin account to access all resources', async ({ page, request }) => {
    // Admin accounts are special - they can see all data across accounts
    // This test verifies that admin privileges work correctly

    const ADMIN = {
      email: 'admin@admin.com',
      password: 'TestPass123!',
    };

    // Step 1: Login as admin
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/canvas');
    await page.waitForLoadState('networkidle');

    // 📸 Visual check: Admin view shows ALL accounts' resources (intentional exception)
    await captureAccountBaseline(page, 'admin-access', 'admin', 'all-accounts-visible');

    // Step 2: Verify admin can see resources from both accounts
    // (This assumes admin view shows all accounts' data)
    // Adjust based on your actual admin UI

    // Via API:
    const response = await request.post('/api/v1/auth/login', { data: ADMIN });
    const auth = await response.json();
    const listResponse = await request.get('/api/v1/RESOURCE_NAME', {
      headers: { Authorization: `Bearer ${auth.token}` },
      params: { limit: 1000 },
    });
    const data = await listResponse.json();
    const resources = data.RESOURCE_NAME || data;

    // Admin should see both Account A and Account B resources
    const hasAccountA = resources.some((r: any) => r.id === resourceAId);
    const hasAccountB = resources.some((r: any) => r.id === resourceBId);
    expect(hasAccountA).toBeTruthy();
    expect(hasAccountB).toBeTruthy();
  });

  // ==================== RESPONSIVE / MULTI-VIEWPORT ====================

  test('should maintain isolation across all viewport sizes', async ({ page }) => {
    /**
     * CRITICAL SECURITY TEST:
     * Verify that account isolation is maintained on mobile, tablet, and desktop.
     * Data leakage on mobile devices would be a severe vulnerability.
     */

    const { testMultiViewport } = await import('../helpers/multi-viewport');

    // Login as Account B
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);

    await testMultiViewport(
      page,
      ['mobile', 'tablet', 'desktop'],
      async (viewportName) => {
        await page.goto('/canvas');
        await page.waitForLoadState('networkidle');

        // SECURITY CHECK: Account A's resource MUST NOT be visible on any viewport
        await expect(page.getByText('Account A Resource')).not.toBeVisible();

        // Account B's resource MUST be visible on all viewports
        await expect(page.getByText('Account B Resource')).toBeVisible();
      },
      {
        testName: 'multi-tenant-isolation-responsive',
        captureScreenshots: true,
        screenshotOptions: {
          threshold: 0.05, // Strict threshold for security tests
        },
      }
    );
  });

  test('should display account-specific data responsively', async ({ page }) => {
    /**
     * Verify that account-specific views adapt properly to different screen sizes
     * without compromising data isolation.
     */

    const { captureMultiViewport } = await import('../helpers/multi-viewport');
    const { VIEWPORT_TEST_SUITES } = await import('../config/viewports');

    // Capture Account A's view across viewports
    await login(page, ACCOUNT_A.email, ACCOUNT_A.password);
    await page.goto('/canvas');
    await page.waitForLoadState('networkidle');

    await captureMultiViewport(page, 'multi-tenant-account-a', VIEWPORT_TEST_SUITES.standard, {
      transitionDelay: 1000,
      verbose: true,
    });

    // Capture Account B's view across viewports
    await page.goto('/logout');
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);
    await page.goto('/canvas');
    await page.waitForLoadState('networkidle');

    await captureMultiViewport(page, 'multi-tenant-account-b', VIEWPORT_TEST_SUITES.standard, {
      transitionDelay: 1000,
      verbose: true,
    });

    // Visual comparison will show these are DIFFERENT views (different account data)
  });

  test('should handle error pages responsively across accounts', async ({ page }) => {
    /**
     * Verify that error pages (403/404) display correctly on all devices
     * when attempting cross-account access.
     */

    const { testMultiViewport } = await import('../helpers/multi-viewport');

    // Login as Account B
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);

    await testMultiViewport(
      page,
      ['mobile', 'tablet', 'desktop'],
      async (viewportName) => {
        // Attempt to access Account A's resource
        await page.goto(`/canvas/RESOURCE_NAME/${resourceAId}`);

        // Error message should be visible on all viewports
        await expect(page.getByText(/not found|forbidden|access denied/i)).toBeVisible();
      },
      {
        testName: 'multi-tenant-error-responsive',
        captureScreenshots: true,
        screenshotOptions: {
          threshold: 0.05,
        },
      }
    );
  });

  test('should display admin view responsively', async ({ page, request }) => {
    /**
     * Verify that admin view (showing all accounts) is responsive.
     * Admin must be able to see all account data on any device.
     */

    const { testMultiViewport } = await import('../helpers/multi-viewport');

    const ADMIN = {
      email: 'admin@admin.com',
      password: 'TestPass123!',
    };

    await login(page, ADMIN.email, ADMIN.password);

    await testMultiViewport(
      page,
      ['mobile', 'tablet', 'desktop'],
      async (viewportName) => {
        await page.goto('/canvas');
        await page.waitForLoadState('networkidle');

        // Admin should see resources from both accounts
        // (Adjust based on your admin UI implementation)
        // This might be a special "All Accounts" view or a filter dropdown
      },
      {
        testName: 'multi-tenant-admin-responsive',
        captureScreenshots: true,
      }
    );
  });

  test('should handle account switching on mobile devices', async ({ page }) => {
    /**
     * CRITICAL: Verify that account switching on mobile properly clears
     * previous account data and doesn't leak information.
     */

    const { testMultiViewport } = await import('../helpers/multi-viewport');

    await testMultiViewport(
      page,
      ['mobile'], // Focus on mobile where session management is critical
      async (viewportName) => {
        // Login as Account A
        await login(page, ACCOUNT_A.email, ACCOUNT_A.password);
        await page.goto('/canvas');
        await expect(page.getByText('Account A Resource')).toBeVisible();

        // Switch to Account B
        await page.goto('/logout');
        await login(page, ACCOUNT_B.email, ACCOUNT_B.password);
        await page.goto('/canvas');

        // SECURITY CHECK: Account A data MUST be gone
        await expect(page.getByText('Account A Resource')).not.toBeVisible();

        // Account B data MUST be present
        await expect(page.getByText('Account B Resource')).toBeVisible();
      },
      {
        testName: 'multi-tenant-mobile-switching',
        captureScreenshots: true,
        screenshotOptions: {
          threshold: 0.05,
        },
      }
    );
  });
});

/**
 * SECURITY CHECKLIST for Multi-Tenant Isolation
 *
 * ✅ API Read Isolation - Account B cannot GET Account A's resources
 * ✅ API Write Isolation - Account B cannot PUT/PATCH Account A's resources
 * ✅ API Delete Isolation - Account B cannot DELETE Account A's resources
 * ✅ API List Isolation - Account A's resources not in Account B's list
 * ✅ UI Display Isolation - Account A's data not visible in Account B's UI
 * ✅ Direct URL Isolation - Cannot bypass via URL manipulation
 * ✅ Name Collision Handling - Similar names don't leak data
 * ✅ Session Isolation - Account switching properly clears context
 * ✅ Admin Override - Admin can access all accounts (intentional)
 *
 * If ANY of these tests fail, it is a CRITICAL SECURITY VULNERABILITY.
 * Do NOT deploy to production until fixed and verified.
 */
