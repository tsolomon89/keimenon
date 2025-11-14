/**
 * Minimal reproduction test for Chromium authentication issue with test isolation
 *
 * Issue: Chromium tests fail to authenticate when using isolated worker databases,
 * despite identical setup working in Firefox.
 *
 * This test includes extensive logging to identify the root cause.
 */

import { test, expect } from './fixtures/test-isolation';
import * as fs from 'fs';

// SKIP: Debug test - used for troubleshooting only
test.describe.skip('Chromium Isolation Debug', () => {
  test('should authenticate with isolated database', async ({ page, dbPath }) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[Debug] Starting Chromium authentication test with isolated DB`);
    console.log(`[Debug] Worker DB Path: ${dbPath}`);
    console.log(`${'='.repeat(80)}\n`);

    // Phase 1: Verify database file exists
    const dbExists = fs.existsSync(dbPath);
    console.log(`[Debug Phase 1] Database file check:`);
    console.log(`  - Path: ${dbPath}`);
    console.log(`  - Exists: ${dbExists}`);

    if (dbExists) {
      const stats = fs.statSync(dbPath);
      console.log(`  - Size: ${stats.size} bytes`);
      console.log(`  - Modified: ${stats.mtime}`);
    }

    // Phase 2: Enable network request logging
    console.log(`\n[Debug Phase 2] Setting up network logging`);

    page.on('request', (request) => {
      if (request.url().includes('/api/v1/auth')) {
        console.log(`\n[Network Request] Auth API call:`);
        console.log(`  - URL: ${request.url()}`);
        console.log(`  - Method: ${request.method()}`);
        console.log(`  - Headers:`);
        const headers = request.headers();
        Object.keys(headers).forEach((key) => {
          if (key.toLowerCase().includes('test') || key.toLowerCase().includes('auth')) {
            console.log(`    - ${key}: ${headers[key]}`);
          }
        });

        // Check for X-Test-DB-Path header
        const testDbPath = headers['x-test-db-path'];
        if (testDbPath) {
          console.log(`  ✅ X-Test-DB-Path header present: ${testDbPath}`);
        } else {
          console.log(`  ❌ X-Test-DB-Path header MISSING!`);
        }
      }
    });

    page.on('response', async (response) => {
      if (response.url().includes('/api/v1/auth')) {
        console.log(`\n[Network Response] Auth API response:`);
        console.log(`  - URL: ${response.url()}`);
        console.log(`  - Status: ${response.status()}`);
        console.log(`  - OK: ${response.ok()}`);

        // Log all headers
        const headers = response.headers();
        console.log(`  - Response Headers:`);
        Object.keys(headers).forEach((key) => {
          if (key.toLowerCase().includes('content') || key.toLowerCase().includes('set-cookie')) {
            console.log(`    - ${key}: ${headers[key]}`);
          }
        });

        try {
          const body = await response.text();
          console.log(`  - Body Length: ${body.length} bytes`);
          console.log(`  - Body: ${body}`);

          // Try to parse as JSON
          try {
            const json = JSON.parse(body);
            console.log(`  - Parsed JSON:`, json);
          } catch (e) {
            console.log(`  - Body is not valid JSON`);
          }
        } catch (e) {
          console.log(`  - Body: (unable to read)`);
        }
      }
    });

    // Phase 3: Navigate to login page
    console.log(`\n[Debug Phase 3] Navigating to login page`);
    await page.goto('/login');
    console.log(`  - Current URL: ${page.url()}`);
    console.log(`  - Page title: ${await page.title()}`);

    // Check for login form elements
    const emailField = await page.locator('[type="email"]').count();
    const passwordField = await page.locator('[type="password"]').count();
    const submitButton = await page.locator('button[type="submit"]').count();
    console.log(`  - Email field: ${emailField > 0 ? '✅' : '❌'}`);
    console.log(`  - Password field: ${passwordField > 0 ? '✅' : '❌'}`);
    console.log(`  - Submit button: ${submitButton > 0 ? '✅' : '❌'}`);

    // Phase 4: Fill login form
    console.log(`\n[Debug Phase 4] Filling login form`);
    await page.fill('[type="email"]', 'admin@admin.com');
    console.log(`  - Email filled: admin@admin.com`);

    await page.fill('[type="password"]', 'TestPass123!');
    console.log(`  - Password filled: ****`);

    // Phase 5: Submit form and monitor
    console.log(`\n[Debug Phase 5] Submitting login form`);
    const navigationPromise = page.waitForURL(/\/(canvas|login)/, { timeout: 15000 }).catch((e) => {
      console.log(`  ⚠️ Navigation timeout: ${e.message}`);
      return null;
    });

    await page.click('button[type="submit"]');
    console.log(`  - Form submitted`);

    // Wait for navigation to complete (or timeout)
    await navigationPromise;

    const finalUrl = page.url();
    console.log(`\n[Debug Phase 6] Post-submission state:`);
    console.log(`  - Final URL: ${finalUrl}`);
    console.log(`  - Expected: /canvas`);
    console.log(`  - Success: ${finalUrl.includes('/canvas') ? '✅' : '❌'}`);

    // Phase 7: Check localStorage for token
    const token = await page.evaluate(() => {
      return localStorage.getItem('canvas-auth-token');
    });
    console.log(`\n[Debug Phase 7] Authentication state:`);
    console.log(`  - Token in localStorage: ${token ? '✅ Present' : '❌ Missing'}`);
    if (token) {
      console.log(`  - Token preview: ${token.substring(0, 50)}...`);
    }

    // Phase 8: Check for error messages on page
    const errorAlerts = await page.locator('[role="alert"]').count();

    console.log(`\n[Debug Phase 8] Error state:`);
    console.log(`  - Error alerts found: ${errorAlerts}`);

    if (errorAlerts > 0) {
      // Get all error messages
      const alerts = await page.locator('[role="alert"]').all();
      for (let i = 0; i < alerts.length; i++) {
        const text = await alerts[i].textContent();
        console.log(`  - Alert ${i + 1}: ${text}`);
      }
    }

    // Also check for any visible error text (might not have role="alert")
    const errorDivs = await page.locator('.text-red-400, .text-red-300, .text-red-500').count();
    console.log(`  - Red text elements found: ${errorDivs}`);

    if (errorDivs > 0) {
      const errorTexts = await page.locator('.text-red-400, .text-red-300, .text-red-500').all();
      for (let i = 0; i < errorTexts.length; i++) {
        const text = await errorTexts[i].textContent();
        if (text && text.trim()) {
          console.log(`  - Error text ${i + 1}: ${text.trim()}`);
        }
      }
    }

    // Final assertion
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[Debug] Test Result:`);
    try {
      await expect(page).toHaveURL(/\/canvas/, { timeout: 1000 });
      console.log(`  ✅ SUCCESS: Authenticated and redirected to canvas`);
      console.log(`${'='.repeat(80)}\n`);
    } catch (error) {
      console.log(`  ❌ FAILURE: Still on login page`);
      console.log(`  Current URL: ${finalUrl}`);
      console.log(`${'='.repeat(80)}\n`);
      throw error;
    }
  });

  test('should compare with working test (no isolation)', async ({ page }) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[Control Test] Testing authentication WITHOUT isolation`);
    console.log(`${'='.repeat(80)}\n`);

    // This test uses the base fixture (no test-isolation)
    // Should work to confirm auth flow is functional

    await page.goto('/login');
    console.log(`[Control] Navigated to login: ${page.url()}`);

    await page.fill('[type="email"]', 'admin@admin.com');
    await page.fill('[type="password"]', 'TestPass123!');
    console.log(`[Control] Form filled`);

    await page.click('button[type="submit"]');
    console.log(`[Control] Form submitted`);

    await expect(page).toHaveURL(/\/canvas/, { timeout: 10000 });
    console.log(`[Control] ✅ Authentication successful (no isolation)`);
    console.log(`${'='.repeat(80)}\n`);
  });
});
