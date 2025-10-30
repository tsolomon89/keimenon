import { test, expect } from './fixtures/test-isolation';
import { login } from './helpers/login';

/**
 * Console Footer Error Filtering Tests
 *
 * Tests the error capture service and console footer filtering functionality.
 * Verifies that:
 * - Errors are captured with correct severity levels
 * - Severity filters work correctly (no state sync issues)
 * - Browser console uses appropriate methods (error/warn/info/debug)
 */

test.describe('Console Footer Error Filtering', () => {
  test.describe.configure({ tag: '@full' });

  // Increase timeout for test-isolation fixture DB copying (takes >30s in parallel)
  test.setTimeout(60000); // 60 seconds

  // Test credentials
  const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@admin.com';
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || '123456';

  test.beforeEach(async ({ page }) => {
    // Login using WebKit-friendly helper
    await login(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('should capture errors with different severity levels', async ({ page }) => {
    // Inject test errors with different severities
    await page.evaluate(() => {
      const errorCapture = (window as any).errorCapture;

      // Create test errors
      errorCapture.error('Test error message', {
        domain: 'ui',
        operation: 'test.error',
      });

      errorCapture.warn('Test warning message', {
        domain: 'ui',
        operation: 'test.warn',
      });

      errorCapture.info('Test info message', {
        domain: 'ui',
        operation: 'test.info',
      });

      errorCapture.debug('Test debug message', {
        domain: 'ui',
        operation: 'test.debug',
      });
    });

    // Open console footer (press backtick)
    await page.keyboard.press('`');

    // Wait for console to open
    await expect(page.getByText('Console')).toBeVisible();

    // Verify all errors are visible initially (no filter)
    await expect(page.getByText('Test error message').first()).toBeVisible();
    await expect(page.getByText('Test warning message').first()).toBeVisible();
    await expect(page.getByText('Test info message').first()).toBeVisible();
    await expect(page.getByText('Test debug message').first()).toBeVisible();
  });

  test('should filter by severity correctly', async ({ page }) => {
    // Inject test errors
    await page.evaluate(() => {
      const errorCapture = (window as any).errorCapture;

      errorCapture.error('Error 1', { domain: 'ui', operation: 'test' });
      errorCapture.warn('Warning 1', { domain: 'ui', operation: 'test' });
      errorCapture.info('Info 1', { domain: 'ui', operation: 'test' });
      errorCapture.debug('Debug 1', { domain: 'ui', operation: 'test' });
    });

    // Open console
    await page.keyboard.press('`');
    await expect(page.getByText('Console')).toBeVisible();

    // Find severity dropdown
    const severityDropdown = page.locator('select').filter({ hasText: 'All Severities' }).first();

    // Filter by "Errors" only
    await severityDropdown.selectOption('error');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Should show only errors
    await expect(page.getByText('Error 1').first()).toBeVisible();
    await expect(page.getByText('Warning 1').first()).not.toBeVisible();
    await expect(page.getByText('Info 1').first()).not.toBeVisible();
    await expect(page.getByText('Debug 1').first()).not.toBeVisible();

    // Filter by "Warnings" only
    await severityDropdown.selectOption('warn');
    await page.waitForTimeout(500);

    // Should show only warnings
    await expect(page.getByText('Error 1').first()).not.toBeVisible();
    await expect(page.getByText('Warning 1').first()).toBeVisible();
    await expect(page.getByText('Info 1').first()).not.toBeVisible();
    await expect(page.getByText('Debug 1').first()).not.toBeVisible();

    // Filter by "Info" only
    await severityDropdown.selectOption('info');
    await page.waitForTimeout(500);

    // Should show only info
    await expect(page.getByText('Error 1').first()).not.toBeVisible();
    await expect(page.getByText('Warning 1').first()).not.toBeVisible();
    await expect(page.getByText('Info 1').first()).toBeVisible();
    await expect(page.getByText('Debug 1').first()).not.toBeVisible();

    // Reset to "All Severities"
    await severityDropdown.selectOption('all');
    await page.waitForTimeout(500);

    // Should show all
    await expect(page.getByText('Error 1').first()).toBeVisible();
    await expect(page.getByText('Warning 1').first()).toBeVisible();
    await expect(page.getByText('Info 1').first()).toBeVisible();
    await expect(page.getByText('Debug 1').first()).toBeVisible();
  });

  test('should display correct error counts by severity', async ({ page }) => {
    // Clear existing errors to start fresh
    await page.evaluate(() => {
      const errorCapture = (window as any).errorCapture;
      errorCapture.clear();
    });

    // Inject multiple errors
    await page.evaluate(() => {
      const errorCapture = (window as any).errorCapture;

      // Create 3 errors
      errorCapture.error('Error 1', { domain: 'ui', operation: 'test' });
      errorCapture.error('Error 2', { domain: 'ui', operation: 'test' });
      errorCapture.error('Error 3', { domain: 'ui', operation: 'test' });

      // Create 2 warnings
      errorCapture.warn('Warning 1', { domain: 'ui', operation: 'test' });
      errorCapture.warn('Warning 2', { domain: 'ui', operation: 'test' });
    });

    // Open console
    await page.keyboard.press('`');

    // Wait for console to fully render (with animations)
    await expect(page.getByText('Console')).toBeVisible();

    // Wait for error badges to update after console opens
    // Badges update asynchronously after error count calculation
    // Firefox/parallel execution needs extra time for React state updates
    await page.waitForTimeout(1500);

    // Check Console tab badge shows error count (should be 3)
    const consoleTab = page.getByRole('button', { name: /Console/ });
    await expect(consoleTab.getByText('3')).toBeVisible();

    // Footer status bar (when closed) should also show counts
    await page.keyboard.press('`'); // Close console

    // Wait for footer to update after closing
    await page.waitForTimeout(500);

    await expect(page.getByText(/3 errors?/)).toBeVisible();
    await expect(page.getByText(/2 warnings?/)).toBeVisible();
  });

  test('should use correct console methods for different severities', async ({ page }) => {
    // Listen to console messages
    const consoleMessages: { type: string; text: string }[] = [];

    page.on('console', (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
      });
    });

    // Inject errors with different severities
    await page.evaluate(() => {
      const errorCapture = (window as any).errorCapture;

      errorCapture.error('Error message', { domain: 'ui', operation: 'test' });
      errorCapture.warn('Warning message', { domain: 'ui', operation: 'test' });
      errorCapture.info('Info message', { domain: 'ui', operation: 'test' });
      errorCapture.debug('Debug message', { domain: 'ui', operation: 'test' });
    });

    // Wait for console logs to be captured
    await page.waitForTimeout(1000);

    // Verify correct console methods were used
    const errorLogs = consoleMessages.filter((m) => m.type === 'error');
    const warnLogs = consoleMessages.filter((m) => m.type === 'warning');
    const infoLogs = consoleMessages.filter((m) => m.type === 'info');
    const debugLogs = consoleMessages.filter((m) => m.type === 'debug');

    // Should have used console.error() for errors
    expect(errorLogs.length).toBeGreaterThan(0);

    // Should have used console.warn() for warnings
    expect(warnLogs.length).toBeGreaterThan(0);

    // Should have used console.info() for info
    expect(infoLogs.length).toBeGreaterThan(0);

    // Note: console.debug() may not be captured in all browsers
  });

  test('should filter by domain correctly', async ({ page }) => {
    // Inject errors with different domains
    await page.evaluate(() => {
      const errorCapture = (window as any).errorCapture;

      errorCapture.error('API Error', { domain: 'api', operation: 'test' });
      errorCapture.error('Import Error', { domain: 'import', operation: 'test' });
      errorCapture.error('UI Error', { domain: 'ui', operation: 'test' });
    });

    // Open console
    await page.keyboard.press('`');

    // Find domain dropdown
    const domainDropdown = page.locator('select').filter({ hasText: 'All Domains' }).first();

    // Filter by "API" domain
    await domainDropdown.selectOption('api');
    await page.waitForTimeout(500);

    // Should show only API errors
    await expect(page.getByText('API Error').first()).toBeVisible();
    await expect(page.getByText('Import Error').first()).not.toBeVisible();
    await expect(page.getByText('UI Error').first()).not.toBeVisible();

    // Filter by "Import" domain
    await domainDropdown.selectOption('import');
    await page.waitForTimeout(500);

    // Should show only Import errors
    await expect(page.getByText('API Error').first()).not.toBeVisible();
    await expect(page.getByText('Import Error').first()).toBeVisible();
    await expect(page.getByText('UI Error').first()).not.toBeVisible();
  });

  test('should search errors by text', async ({ page }) => {
    // Inject errors with different messages
    await page.evaluate(() => {
      const errorCapture = (window as any).errorCapture;

      errorCapture.error('Network timeout error', { domain: 'api', operation: 'fetch' });
      errorCapture.error('File upload failed', { domain: 'import', operation: 'upload' });
      errorCapture.error('Invalid credentials', { domain: 'api', operation: 'auth' });
    });

    // Open console
    await page.keyboard.press('`');

    // Find search input
    const searchInput = page.getByPlaceholder('Search errors...');

    // Search for "network"
    await searchInput.fill('network');
    await page.waitForTimeout(500);

    // Should show only matching error
    await expect(page.getByText('Network timeout error').first()).toBeVisible();
    await expect(page.getByText('File upload failed').first()).not.toBeVisible();
    await expect(page.getByText('Invalid credentials').first()).not.toBeVisible();

    // Search for "failed"
    await searchInput.clear();
    await searchInput.fill('failed');
    await page.waitForTimeout(500);

    // Should show only matching error
    await expect(page.getByText('Network timeout error').first()).not.toBeVisible();
    await expect(page.getByText('File upload failed').first()).toBeVisible();
    await expect(page.getByText('Invalid credentials').first()).not.toBeVisible();
  });
});
