/**
 * Test basic network connectivity from Playwright browser to API server
 */

import { test as base, expect } from '@playwright/test';

const test = base;

test.describe('Network Connectivity Debug', () => {
  test('browser can fetch API health endpoint', async ({ page }) => {
    console.log(
      '\n================================================================================'
    );
    console.log('[Network Test] Testing browser → API connectivity');
    console.log(
      '================================================================================\n'
    );

    await page.goto('http://localhost:3000/login');
    console.log(`✅ Navigated to web app: ${page.url()}`);

    // Get API URL from Node.js environment (not browser)
    const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4001';
    console.log(`Testing with API URL: ${API_BASE_URL}`);

    // Try to fetch API health endpoint from browser context
    // Pass API URL as parameter since process.env doesn't exist in browser
    const result = await page.evaluate(async (apiUrl) => {
      try {
        console.log('🔍 Attempting fetch to API...');
        console.log(`API URL from parameter: ${apiUrl}`);

        const response = await fetch(`${apiUrl}/api/v1/health`);
        console.log(`✅ Fetch completed with status: ${response.status}`);

        const data = await response.json();
        console.log('Response data:', data);

        return {
          success: true,
          status: response.status,
          data,
          apiUrl,
        };
      } catch (error: any) {
        console.error('❌ Fetch failed:', error);
        return {
          success: false,
          error: error.message,
          errorType: error.constructor.name,
        };
      }
    }, API_BASE_URL);

    console.log('\n[Result from browser context]:');
    console.log(JSON.stringify(result, null, 2));

    if (!result.success) {
      console.log(`\n❌ FAILED: ${result.error}`);
      console.log(`Error type: ${result.errorType}`);
    } else {
      console.log(`\n✅ SUCCESS: Browser can fetch from API`);
      console.log(`Status: ${result.status}`);
    }

    expect(result.success).toBe(true);
  });

  test('check NEXT_PUBLIC_API_URL in browser', async ({ page }) => {
    await page.goto('http://localhost:3000/login');

    // Get API URL from Node.js environment
    const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4001';

    // Pass API URL as parameter to browser context
    const envVars = await page.evaluate(async (apiUrl) => {
      return {
        NEXT_PUBLIC_API_URL: apiUrl,
        hasProcessEnv: typeof process !== 'undefined',
        hasWindow: typeof window !== 'undefined',
      };
    }, API_BASE_URL);

    console.log('\n[Environment Variables in Browser]:');
    console.log(JSON.stringify(envVars, null, 2));

    expect(envVars.NEXT_PUBLIC_API_URL).toBeDefined();
  });
});
