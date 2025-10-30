import { test, expect } from './fixtures/testId';

/**
 * Debug Authentication Test
 *
 * This test checks if authentication is working properly:
 * - Token stored in localStorage
 * - API URL configured correctly
 * - API endpoints accessible from browser
 */

test.describe('Debug Authentication', () => {
  const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@admin.com';
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'admin123';

  test('should have token and API access after login', async ({ page }) => {
    // Enable console logging
    page.on('console', (msg) => {
      if (msg.type() === 'log') {
        console.log('[Browser Console]', msg.text());
      } else if (msg.type() === 'error') {
        console.error('[Browser Console Error]', msg.text());
      }
    });

    // Log in
    console.log('\n=== Starting Login ===');
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for redirect (uses global 30s timeout)
    await page.waitForURL(/\/canvas/);
    await page.waitForLoadState('domcontentloaded');
    console.log('✅ Redirected to canvas');

    // Check localStorage for token
    const token = await page.evaluate(() => {
      const token = localStorage.getItem('canvas_memory_token');
      console.log('localStorage token:', token ? `${token.substring(0, 20)}...` : 'null');
      return token;
    });

    expect(token).not.toBeNull();
    console.log('✅ Token found in localStorage');

    // Wait for token to stabilize and API to be ready (increased for parallel execution)
    // Parallel execution needs extra time for token persistence and API readiness
    // 5s accounts for: token write (500ms) + localStorage sync (1s) + API warmup (3.5s)
    await page.waitForTimeout(5000);

    // Test API call from browser context (like components do)
    // NOTE: We pass the API URL as a parameter since process.env doesn't exist in browser context
    const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4001';
    console.log('Testing with API URL:', API_BASE_URL);

    const apiTest = await page.evaluate(
      async ({ testToken, apiUrl }) => {
        console.log('[API Test] Fetching from:', `${apiUrl}/api/v1/settings/registry/all`);

        try {
          const response = await fetch(`${apiUrl}/api/v1/settings/registry/all`, {
            headers: {
              Authorization: `Bearer ${testToken}`,
            },
          });

          console.log('[API Test] Response status:', response.status);
          console.log('[API Test] Response ok:', response.ok);

          if (!response.ok) {
            const text = await response.text();
            console.log('[API Test] Error response:', text);
            return {
              success: false,
              status: response.status,
              error: text,
            };
          }

          const data = await response.json();
          console.log('[API Test] Success! Got', data.registry?.length || 0, 'registry items');

          return {
            success: true,
            status: response.status,
            registryCount: data.registry?.length || 0,
          };
        } catch (error: any) {
          console.error('[API Test] Fetch error:', error.message);
          return {
            success: false,
            error: error.message,
          };
        }
      },
      { testToken: token, apiUrl: API_BASE_URL }
    );

    console.log('\n=== API Test Result ===');
    console.log(JSON.stringify(apiTest, null, 2));

    expect(apiTest.success).toBe(true);
    console.log('✅ API call successful from browser');

    // Test stats endpoint as well (used by DataManagementCard)
    const statsTest = await page.evaluate(
      async ({ testToken, apiUrl }) => {
        console.log('[Stats Test] Fetching from:', `${apiUrl}/api/v1/data/stats`);

        try {
          const response = await fetch(`${apiUrl}/api/v1/data/stats`, {
            headers: {
              Authorization: `Bearer ${testToken}`,
            },
          });

          console.log('[Stats Test] Response status:', response.status);

          if (!response.ok) {
            const text = await response.text();
            console.log('[Stats Test] Error response:', text);
            return {
              success: false,
              status: response.status,
              error: text,
            };
          }

          const data = await response.json();
          console.log('[Stats Test] Success!', data);

          return {
            success: true,
            status: response.status,
            stats: data.stats,
          };
        } catch (error: any) {
          console.error('[Stats Test] Fetch error:', error.message);
          return {
            success: false,
            error: error.message,
          };
        }
      },
      { testToken: token, apiUrl: API_BASE_URL }
    );

    console.log('\n=== Stats Test Result ===');
    console.log(JSON.stringify(statsTest, null, 2));

    expect(statsTest.success).toBe(true);
    console.log('✅ Stats API call successful');
  });
});
