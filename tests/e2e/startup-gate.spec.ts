import { test, expect } from './fixtures/test-isolation';

test.describe('Startup Gate', () => {
  test('shows startup gate until ready and does not re-gate after readiness', async ({ page }) => {
    let readyCallCount = 0;

    await page.route('**/ready', async (route) => {
      readyCallCount += 1;

      if (readyCallCount < 3) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            ready: false,
            checks: {
              server: false,
              database: false,
              storage: false,
              memory: true,
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ready: true,
          checks: {
            server: true,
            database: true,
            storage: true,
            memory: true,
          },
        }),
      });
    });

    await page.route('**/health/modules', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          healthy: false,
          issues: [{ module: 'database', issue: 'starting' }],
        }),
      });
    });

    await page.goto('/login');

    await expect(page.getByText('Preparing backend services')).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel(/password/i)).toBeVisible({ timeout: 15000 });

    const callCountAfterReady = readyCallCount;
    await page.waitForTimeout(3000);

    expect(readyCallCount).toBe(callCountAfterReady);
    await expect(page.getByText('Preparing backend services')).toHaveCount(0);
  });
});
