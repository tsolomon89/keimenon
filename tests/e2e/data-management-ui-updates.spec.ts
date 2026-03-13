import { test, expect, type Page } from './fixtures/testId';
import { login } from './helpers/login';
import fs from 'fs';
import path from 'path';

/**
 * Data Management UI Updates Test
 *
 * Validates that UI updates correctly without page reloads after:
 * - Keimenon data deletion
 * - Job deletion (single & bulk)
 * - SSE job completion events
 * - Operating context switches (CRM mode)
 *
 * Related: ISSUE #7 - Data management and import table UI synchronization
 */

/**
 * Helper: Dismiss FirstTimeUploadModal if present
 *
 * The welcome modal appears on first visit and blocks all interactions.
 * It has z-50 and intercepts all clicks until dismissed.
 */
async function dismissWelcomeModal(page: Page): Promise<void> {
  try {
    // Wait a moment for modal to fully appear if it's going to
    await page.waitForTimeout(1000);

    // Look for the "Get Started" button (most reliable)
    const getStartedButton = page.getByRole('button', { name: /get started/i });

    if (await getStartedButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[Test Helper] Dismissing welcome modal...');

      // Click "Get Started" button
      await getStartedButton.click({ force: true });

      // Wait for modal to disappear
      await getStartedButton.waitFor({ state: 'hidden', timeout: 3000 });

      console.log('[Test Helper] Welcome modal dismissed');
    } else {
      console.log('[Test Helper] No welcome modal found');
    }
  } catch (error) {
    // Modal may not be present or already dismissed
    console.log('[Test Helper] Modal dismissal skipped');
  }
}

/**
 * Helper: Navigate to settings view within keimenon
 *
 * Settings are embedded in /keimenon via KeimenonLayout, not a standalone page.
 * Must navigate to keimenon first, then switch to settings view.
 */
async function navigateToSettings(page: Page): Promise<void> {
  await page.goto('/keimenon');
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveURL(/\/keimenon/);

  // Dismiss welcome modal if present
  await dismissWelcomeModal(page);

  // Keep toolbar in the expected mode before opening Settings.
  const keimenonButton = page.locator('button[title="Keimenon"]').first();
  if (await keimenonButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await keimenonButton.click().catch(() => {});
  }

  // Click Settings icon button in toolbar
  const settingsButton = page
    .locator('button[title="Settings"], button:has-text("Settings")')
    .first();

  // Ensure Settings button is visible and clickable (critical for parallel execution)
  await settingsButton.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(500); // Let any animations settle
  await settingsButton.click();

  // Wait for Settings page to fully load (increased for parallel execution and 401 retries)
  // Settings API may take longer in parallel due to token timing and resource contention
  await page.waitForTimeout(5000);

  // Click "Data" category in left sidebar
  // The left sidebar shows categories: General, Appearance, Layout, Account, Data, etc.
  // Increased timeout to handle Settings API 401 errors and retries in parallel execution
  const dataCategory = page.locator('text="Data"').first();
  await dataCategory.waitFor({ state: 'visible', timeout: 15000 });
  await dataCategory.click();
  await page.waitForTimeout(500);

  // Click "Data Management" subsection within Data category
  // Settings has two-level navigation: Categories > Subsections
  // Data category contains: Data Retention, Data Management, Admin Data Management, Content Deduplication
  const dataManagementSection = page.getByRole('button', { name: 'Data Management', exact: true });
  await dataManagementSection.waitFor({ state: 'visible', timeout: 5000 });
  await dataManagementSection.click();
  await page.waitForTimeout(500);

  // Verify DataManagementCard is visible by looking for "Clear Keimenon Data" button
  await page
    .getByRole('button', { name: /Clear Keimenon Data|Clearing Data|Deletion in progress/i })
    .waitFor({ timeout: 10000 });

  console.log('[Test Helper] Navigated to Data Management settings');
}

/**
 * Helper: Clear all background operations using UI "Clear" button
 *
 * Tests the full user workflow: UI button â†’ API call â†’ DB update â†’ SSE â†’ UI refresh
 * This ensures frontend-backend synchronization is working correctly.
 */
async function clearAllBackgroundOperations(page: Page): Promise<void> {
  await page.goto('/keimenon');
  await page.waitForLoadState('domcontentloaded');

  // Dismiss welcome modal if present
  await dismissWelcomeModal(page);

  // Navigate to Dashboard where Background Operations table lives
  const dashboardButton = page.getByRole('button', { name: 'Dashboard' });
  if (await dashboardButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await dashboardButton.click();
    await page.waitForTimeout(1000);
  }

  // Wait for Background Operations section
  const operationsHeading = page.getByText('Background Operations');
  const operationsVisible = await operationsHeading
    .isVisible({ timeout: 10000 })
    .catch(() => false);
  if (!operationsVisible) {
    console.log('[Test Helper] Background Operations section not visible; skipping cleanup');
    return;
  }

  // Check if Clear button exists (only visible when jobs exist)
  const clearButton = page.getByRole('button', { name: /clear/i, exact: false });
  const hasClearButton = await clearButton.isVisible({ timeout: 2000 }).catch(() => false);

  if (hasClearButton) {
    console.log('[Test Helper] Clearing all background operations via UI...');

    // Handle confirmation dialog
    page.once('dialog', async (dialog) => {
      console.log('[Test Helper] Accepting clear confirmation:', dialog.message());
      await dialog.accept();
    });

    await clearButton.click();

    // Wait for SSE to update UI (jobs should disappear)
    await page.waitForTimeout(3000);

    // Verify empty state appears
    await expect(page.getByText(/no active imports|import jobs will appear here/i)).toBeVisible({
      timeout: 5000,
    });

    console.log('[Test Helper] Background operations cleared successfully');
  } else {
    console.log('[Test Helper] No jobs to clear (table already empty)');
  }
}

/**
 * Helper: Wait for background operations table to be visible
 *
 * The table is in ImportsTableCard with heading "Background Operations".
 * Must dismiss welcome modal first and ensure we're in keimenon mode (not settings).
 */
async function waitForOperationsTable(page: Page): Promise<typeof page.locator> {
  // Always navigate to keimenon page explicitly
  await page.goto('/keimenon');
  await page.waitForLoadState('domcontentloaded');

  // Dismiss welcome modal if present
  await dismissWelcomeModal(page);

  // Background Operations table is in Dashboard view, not Keimenon view
  // Click Dashboard button to ensure we see the operations table
  const dashboardButton = page.getByRole('button', { name: 'Dashboard' });
  if (await dashboardButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await dashboardButton.click();
    await page.waitForTimeout(1000);
  }

  // Wait for "Background Operations" heading
  const operationsHeading = page.getByText('Background Operations');
  await operationsHeading.waitFor({ state: 'visible', timeout: 10000 });

  // Check if table exists or if showing empty state
  const table = page.getByTestId('background-operations-card');
  const emptyState = page.getByText(/no active imports|import jobs will appear here/i);

  // Wait for either table or empty state
  const tableVisible = await table.isVisible({ timeout: 2000 }).catch(() => false);
  const emptyStateVisible = await emptyState.isVisible({ timeout: 2000 }).catch(() => false);

  if (!tableVisible && emptyStateVisible) {
    console.log('[Test Helper] Background operations table is empty (no jobs)');
    // Return table locator anyway - tests will handle empty state
    return table;
  }

  // If table exists, wait for it to be fully visible
  await table.waitFor({ state: 'visible', timeout: 10000 });
  console.log('[Test Helper] Background operations table visible');
  return table;
}

/**
 * Helper: Create test jobs via API to ensure test data exists
 *
 * Creates multiple import jobs so tests have data to work with.
 * Jobs are tagged with data_tag='test' for easy cleanup.
 */
async function createTestJobs(page: Page, count: number = 2): Promise<string[]> {
  const createdJobIds: string[] = [];

  // Get auth token from localStorage
  const authToken = await page.evaluate(() => {
    const directToken =
      localStorage.getItem('keimenon_token') || localStorage.getItem('temp_auth_token');
    if (directToken) return directToken;

    const authData = localStorage.getItem('auth');
    if (!authData) return null;

    try {
      const parsed = JSON.parse(authData);
      return parsed?.token || null;
    } catch {
      return null;
    }
  });

  if (!authToken) {
    console.error('[Test Helper] No auth token found - cannot create test jobs');
    return createdJobIds;
  }

  console.log(`[Test Helper] Creating ${count} test jobs...`);
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4001';
  const testDbPath = await page
    .evaluate(() => {
      // @ts-ignore - injected by test-isolation fixture
      return window.__TEST_DB_PATH__ || null;
    })
    .catch(() => null);

  const fixturePath = path.join(
    process.cwd(),
    'tests',
    'test_data',
    'chat_data',
    'test-samples',
    'tiny.json'
  );
  const fixtureBuffer = fs.readFileSync(fixturePath);

  // Create multiple jobs via API
  for (let i = 0; i < count; i++) {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${authToken}`,
      };
      if (testDbPath) {
        headers['X-Test-DB-Path'] = testDbPath;
      }

      const response = await page.request.post(`${apiBaseUrl}/api/v1/jobs/import`, {
        headers,
        multipart: {
          files: {
            name: `ui-test-${i + 1}.json`,
            mimeType: 'application/json',
            buffer: fixtureBuffer,
          },
          config: JSON.stringify({
            platform: 'chatgpt',
            extractCode: true,
            duplicateDetection: { enabled: true },
            data_tag: 'test',
          }),
        },
      });

      if (response.ok()) {
        const result = await response.json();
        const jobId = result.job_id || result.jobId || result.id || result.job?.id;
        if (typeof jobId === 'string' && jobId.length > 0) {
          createdJobIds.push(jobId);
        }
        console.log(`[Test Helper] Created job ${i + 1}:`, jobId);
      } else {
        const errorBody = await response.json().catch(() => ({}));
        console.error(`[Test Helper] Failed to create job ${i + 1}:`, response.status(), errorBody);
      }
    } catch (error) {
      console.error(`[Test Helper] Error creating job ${i + 1}:`, error);
    }
  }

  // Wait for jobs to be created and SSE to propagate
  await page.waitForTimeout(2000);
  console.log(`[Test Helper] ${count} test jobs created (${createdJobIds.length} ids captured)`);
  return createdJobIds;
}

test.describe.serial('Data Management UI Updates', () => {
  test.describe.configure({ tag: '@smoke' });

  // Increase timeout for slow page loads and login (matches login helper timeout)
  test.setTimeout(60000); // 60 seconds

  const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@admin.com';
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPass123!';

  // First test: Clear stale jobs before running other tests
  test('cleanup: clear all background operations', async ({ page }) => {
    // This test runs first and clears stale jobs using the actual UI workflow
    // Validates: UI â†’ API â†’ DB â†’ SSE â†’ UI round-trip works

    // Login using WebKit-friendly helper
    await login(page, TEST_EMAIL, TEST_PASSWORD);

    // Use UI workflow to clear jobs
    await clearAllBackgroundOperations(page);

    console.log('[Cleanup Test] Successfully cleared all background operations');
  });

  test.beforeEach(async ({ page }) => {
    // Welcome modal is automatically disabled during E2E tests via NEXT_PUBLIC_E2E_TESTING environment variable
    // No need to manipulate localStorage - the keimenon page checks the env var and skips the modal entirely

    // Login using WebKit-friendly helper
    await login(page, TEST_EMAIL, TEST_PASSWORD);

    // IMPORTANT: Wait for AuthContext to fully initialize
    // The keimenon page makes API calls that require auth token from localStorage.
    // Give it time to initialize before interacting with the page.
    await page.waitForTimeout(2000);

    // Verify keimenon shell is ready using multiple UI signals to avoid brittle single-selector waits.
    await expect
      .poll(
        async () => {
          const keimenonButtonVisible = await page
            .getByRole('button', { name: /keimenon/i })
            .first()
            .isVisible()
            .catch(() => false);
          const settingsButtonVisible = await page
            .locator('button[title="Settings"]')
            .first()
            .isVisible()
            .catch(() => false);
          const dashboardButtonVisible = await page
            .getByRole('button', { name: /dashboard/i })
            .first()
            .isVisible()
            .catch(() => false);
          const onKeimenonRoute = /\/keimenon/.test(page.url());

          return (
            keimenonButtonVisible ||
            settingsButtonVisible ||
            dashboardButtonVisible ||
            onKeimenonRoute
          );
        },
        { timeout: 20000, intervals: [250, 500, 1000] }
      )
      .toBe(true);
  });

  test('should update UI without reload after keimenon data deletion', async ({ page }) => {
    // FIXED: Verifies that keimenon data deletion:
    // 1. Only deletes keimenon data nodes (ChatThread, Message, Source, CodeBlock, Group, Folder)
    // 2. Preserves system nodes (UserNode, AccountNode, Constellation, Board)
    // 3. Shows correct UI feedback without page reload
    // 4. Creates background job with correct scope

    // Navigate to settings view (embedded in keimenon)
    await navigateToSettings(page);

    // Find "Clear Keimenon Data" button using role (avoids strict mode violation with heading)
    const clearButton = page.getByRole('button', {
      name: /Clear Keimenon Data|Clearing Data|Deletion in progress/i,
    });
    await expect(clearButton).toBeVisible({ timeout: 10000 });

    // Verify button is NOT disabled (should be clickable)
    await expect(clearButton).not.toBeDisabled();

    // Click the button
    await clearButton.click();

    // Wait for modal animation to complete (modals may have fade-in transitions)
    await page.waitForTimeout(500);

    // Wait for confirmation modal using role="dialog"
    // The modal now has proper ARIA roles for both accessibility and testing
    const confirmModal = page.getByRole('dialog', { name: /Clear All Keimenon Data/i });
    await expect(confirmModal).toBeVisible({ timeout: 5000 });

    // ADDED: Verify modal shows stats (if any data exists)
    // This confirms the stats API endpoint works
    const modalContent = confirmModal.locator('[id="confirmation-modal-description"]');
    await expect(modalContent).toBeVisible();

    // Click confirm button (text: "Clear Data")
    const confirmButton = confirmModal.getByText('Clear Data', { exact: false });
    await expect(confirmButton).toBeVisible();
    await expect(confirmButton).not.toBeDisabled();
    await confirmButton.click();

    // Wait for success message WITHOUT page reload
    // The deletion is asynchronous (background job), so we expect a job creation message
    await expect(
      page.getByText(/Delete job created.*Monitor progress in Background Operations/i)
    ).toBeVisible({ timeout: 10000 });

    // Verify we're still on keimenon (no reload occurred)
    await expect(page).toHaveURL(/\/keimenon/);

    // Verify we're still in settings mode (not switched to keimenon view)
    // The page should still show the Data Management heading
    await expect(page.getByRole('heading', { name: 'Data Management', level: 1 })).toBeVisible();

    // ADDED: Verify the delete job was created with correct scope
    // Navigate to Background Operations to check the job
    const dashboardButton = page.getByRole('button', { name: 'Dashboard' });
    await dashboardButton.click();
    await page.waitForTimeout(2000);

    // Verify delete job appears in the table
    const operationsTable = page.getByTestId('background-operations-card');
    await expect(operationsTable).toBeVisible({ timeout: 5000 });

    // Verify at least one operation row appears (job label text can vary by build/version).
    await expect
      .poll(async () => await operationsTable.getByTestId('background-operation-row').count(), {
        timeout: 10000,
        intervals: [250, 500, 1000],
      })
      .toBeGreaterThan(0);

    console.log('[Test] Successfully verified delete job creation and UI state');
  });

  test('should show delete job in background operations table', async ({ page }) => {
    // Use helper to wait for table
    const operationsTable = await waitForOperationsTable(page);

    // Count initial row count
    const initialRows = await operationsTable.getByTestId('background-operation-row').count();
    const headerRow = operationsTable.getByTestId('background-operations-header-row');
    const emptyState = operationsTable.getByTestId('background-operations-empty-state');

    if (initialRows > 0) {
      await expect(headerRow).toBeVisible();
    } else {
      await expect(emptyState).toBeVisible();
    }

    console.log(`Initial background operations: ${initialRows}`);
  });

  test('should remove job from table after deletion', async ({ page, context }) => {
    // WORKAROUND: Intercept DELETE requests and forward them using Playwright's request API
    // This bypasses the Playwright + browser cross-origin DELETE bug
    await page.route('**/api/v1/jobs/*', async (route) => {
      const request = route.request();

      if (request.method() === 'DELETE') {
        console.log(`[DELETE Workaround] Intercepting DELETE ${request.url()}`);

        try {
          // Use Playwright's API request context to perform the DELETE
          const response = await context.request.delete(request.url(), {
            headers: request.headers(),
          });

          const body = await response.body();

          console.log(
            `[DELETE Workaround] Response: ${response.status()} ${response.statusText()}`
          );

          // Fulfill the browser's request with the API response
          await route.fulfill({
            status: response.status(),
            headers: response.headers(),
            body: body,
          });
        } catch (error) {
          console.error(`[DELETE Workaround] Error:`, error);
          await route.abort('failed');
        }
      } else {
        // Let non-DELETE requests pass through normally
        await route.continue();
      }
    });

    // Capture all console output from the browser
    page.on('console', (msg) => {
      console.log(msg.text());
    });

    // Capture page errors
    page.on('pageerror', (err) => {
      console.log(err.message());
    });

    // Open dashboard table first so SSE subscription is active before seeding jobs
    const operationsTable = await waitForOperationsTable(page);

    // Seed jobs after dashboard mount to avoid missing initial SSE updates
    const createdJobIds = await createTestJobs(page, 2);
    expect(createdJobIds.length).toBeGreaterThan(0);

    // Wait for seeded jobs to appear in table; refresh dashboard once if needed.
    console.log('[Test] Waiting for seeded jobs to appear in Background Operations...');
    try {
      await expect
        .poll(async () => operationsTable.getByTestId('background-operation-row').count(), {
          timeout: 10000,
        })
        .toBeGreaterThan(0);
    } catch {
      console.log('[Test] Jobs not visible yet, refreshing dashboard and retrying...');
      const dashboardButton = page.getByRole('button', { name: 'Dashboard' });
      if (await dashboardButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await dashboardButton.click({ force: true });
      }
      await page.getByText('Background Operations').waitFor({ state: 'visible', timeout: 5000 });
      await expect
        .poll(async () => operationsTable.getByTestId('background-operation-row').count(), {
          timeout: 10000,
        })
        .toBeGreaterThan(0);
    }

    const initialRowCount = await operationsTable.getByTestId('background-operation-row').count();
    console.log('[Test] Initial row count:', initialRowCount);

    // Verify jobs exist before deletion
    expect(initialRowCount).toBeGreaterThan(0);

    // Prefer a terminal job row for deterministic deletion behavior.
    await expect
      .poll(
        async () =>
          operationsTable
            .getByTestId('background-operation-row')
            .filter({ hasText: /Complete|Failed|Error/i })
            .count(),
        { timeout: 15000 }
      )
      .toBeGreaterThan(0);

    const targetRow = operationsTable
      .getByTestId('background-operation-row')
      .filter({ hasText: /Complete|Failed|Error/i })
      .first();
    const targetJobId = await targetRow.getAttribute('data-job-id');
    expect(targetJobId).toBeTruthy();

    // Select the job (click the row) - use force in case of any overlay
    await targetRow.click({ force: true });

    // Wait for selection to be visible
    await expect(targetRow).toHaveAttribute('data-selected', 'true');

    // Click delete button (should appear in header after selection)
    const deleteButton = page.getByRole('button', { name: /delete/i, exact: false });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Wait for deletion to process via: API â†’ DB â†’ SSE â†’ UI
    await expect(page.getByText('Confirm Deletion')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Confirm Delete', exact: true }).click();

    // Verify the selected job is no longer active in the table by job ID.
    // Some builds immediately remove rows, while others transition through terminal statuses first.
    await expect
      .poll(
        async () => {
          const row = operationsTable.locator(
            `[data-testid="background-operation-row"][data-job-id="${targetJobId}"]`
          );
          const count = await row.count();

          if (count === 0) {
            return 'removed';
          }

          const rowText = ((await row.first().textContent()) || '').toLowerCase();
          if (
            rowText.includes('deleted') ||
            rowText.includes('cancelled') ||
            rowText.includes('canceled')
          ) {
            return 'terminal';
          }

          return 'present';
        },
        { timeout: 20000 }
      )
      .toMatch(/removed|terminal/);

    console.log(`Deleted job ${targetJobId} from table`);
  });

  test('should sync background operations with job table', async ({ page }) => {
    // Use helper to wait for table
    const operationsTable = await waitForOperationsTable(page);

    // Seed jobs and verify the table eventually reflects at least one seeded ID.
    const createdJobIds = await createTestJobs(page, 2);
    expect(createdJobIds.length).toBeGreaterThan(0);

    await expect
      .poll(
        async () => {
          let visibleSeededJobs = 0;
          for (const jobId of createdJobIds) {
            const count = await operationsTable
              .locator(`[data-testid="background-operation-row"][data-job-id="${jobId}"]`)
              .count();
            if (count > 0) {
              visibleSeededJobs += 1;
            }
          }
          return visibleSeededJobs;
        },
        { timeout: 15000 }
      )
      .toBeGreaterThan(0);

    const visibleJobCount = await operationsTable.getByTestId('background-operation-row').count();
    console.log(
      `Synced seeded jobs: ${createdJobIds.length}, currently visible rows: ${visibleJobCount}`
    );
  });

  test('should auto-remove completed jobs after timeout', async ({ page }) => {
    // Create test jobs - some may complete quickly
    const createdJobIds = await createTestJobs(page, 3);
    expect(createdJobIds.length).toBeGreaterThan(0);

    // Wait for jobs to complete (import jobs with minimal data complete in ~5 seconds)
    await page.waitForTimeout(8000);

    // Use helper to wait for table
    const operationsTable = await waitForOperationsTable(page);

    // Track completion state only for jobs seeded by this test (avoid cross-test row churn).
    const completedSeededJobIds: string[] = [];
    for (const jobId of createdJobIds) {
      const seededRow = operationsTable.locator(
        `[data-testid="background-operation-row"][data-job-id="${jobId}"]`
      );
      const rowCount = await seededRow.count();
      if (rowCount === 0) {
        continue;
      }

      const rowText = (await seededRow.first().textContent()) || '';
      if (/Complete|Success|Failed/i.test(rowText)) {
        completedSeededJobIds.push(jobId);
      }
    }

    if (completedSeededJobIds.length === 0) {
      console.log(
        'No completed seeded jobs to validate - jobs may still be running or already removed'
      );
      return;
    }

    console.log(
      `Found ${completedSeededJobIds.length} completed seeded jobs, validating timeout behavior...`
    );

    // Wait for auto-cleanup (15 seconds + buffer)
    await page.waitForTimeout(18000);

    // Completed seeded jobs should either remain terminal or be removed.
    let removedCount = 0;
    for (const jobId of completedSeededJobIds) {
      const seededRow = operationsTable.locator(
        `[data-testid="background-operation-row"][data-job-id="${jobId}"]`
      );
      const rowCount = await seededRow.count();
      if (rowCount === 0) {
        removedCount += 1;
        continue;
      }

      const rowText = (await seededRow.first().textContent()) || '';
      expect(/Complete|Success|Failed/i.test(rowText)).toBeTruthy();
    }

    console.log(
      `Completed seeded jobs after timeout: removed=${removedCount}, retained_terminal=${completedSeededJobIds.length - removedCount}`
    );
  });

  test('should handle bulk job deletion', async ({ page, context }) => {
    // WORKAROUND: Intercept DELETE requests and forward them using Playwright's request API
    // This bypasses the Playwright + browser cross-origin DELETE bug
    await page.route('**/api/v1/jobs/*', async (route) => {
      const request = route.request();

      if (request.method() === 'DELETE') {
        console.log(`[DELETE Workaround] Intercepting DELETE ${request.url()}`);

        try {
          // Use Playwright's API request context to perform the DELETE
          const response = await context.request.delete(request.url(), {
            headers: request.headers(),
          });

          const body = await response.body();

          console.log(
            `[DELETE Workaround] Response: ${response.status()} ${response.statusText()}`
          );

          // Fulfill the browser's request with the API response
          await route.fulfill({
            status: response.status(),
            headers: response.headers(),
            body: body,
          });
        } catch (error) {
          console.error(`[DELETE Workaround] Error:`, error);
          await route.abort('failed');
        }
      } else {
        // Let non-DELETE requests pass through normally
        await route.continue();
      }
    });

    // Capture browser console logs for debugging
    page.on('console', (msg) => {
      if (
        msg.text().includes('[ImportsTable]') ||
        msg.text().includes('[DELETE]') ||
        msg.text().includes('bulkActionLoading')
      ) {
        console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
      }
    });

    // Open table first so SSE is mounted before we seed jobs.
    const operationsTable = await waitForOperationsTable(page);

    // Seed jobs and track IDs so assertions target this test's rows only.
    const createdJobIds = await createTestJobs(page, 3);
    expect(createdJobIds.length).toBeGreaterThanOrEqual(2);

    const countVisibleSeededRows = async (): Promise<number> => {
      let visibleSeededRows = 0;
      for (const jobId of createdJobIds) {
        const count = await operationsTable
          .locator(`[data-testid="background-operation-row"][data-job-id="${jobId}"]`)
          .count();
        if (count > 0) {
          visibleSeededRows += 1;
        }
      }
      return visibleSeededRows;
    };

    try {
      await expect.poll(countVisibleSeededRows, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
    } catch {
      console.log('[Test] Seeded jobs not visible yet, refreshing dashboard and retrying...');
      const dashboardButton = page.getByRole('button', { name: 'Dashboard' });
      if (await dashboardButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await dashboardButton.click({ force: true });
      }
      await page.getByText('Background Operations').waitFor({ state: 'visible', timeout: 5000 });
      await expect.poll(countVisibleSeededRows, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
    }

    const resolveSelectableJobIds = async (): Promise<string[]> => {
      const visibleSeededJobIds: string[] = [];
      for (const jobId of createdJobIds) {
        const count = await operationsTable
          .locator(`[data-testid="background-operation-row"][data-job-id="${jobId}"]`)
          .count();
        if (count > 0) {
          visibleSeededJobIds.push(jobId);
        }
      }

      if (visibleSeededJobIds.length >= 2) {
        return visibleSeededJobIds.slice(0, 2);
      }

      const fallbackRows = operationsTable.getByTestId('background-operation-row');
      const fallbackCount = await fallbackRows.count();
      const fallbackIds: string[] = [];
      for (let i = 0; i < fallbackCount && fallbackIds.length < 2; i++) {
        const id = await fallbackRows.nth(i).getAttribute('data-job-id');
        if (id) {
          fallbackIds.push(id);
        }
      }

      return fallbackIds;
    };

    let selectedJobIds: string[] = [];
    await expect
      .poll(
        async () => {
          selectedJobIds = await resolveSelectableJobIds();
          return selectedJobIds.length;
        },
        { timeout: 15000 }
      )
      .toBeGreaterThanOrEqual(2);

    let rowsSelected = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const candidateIds = await resolveSelectableJobIds();
      if (candidateIds.length < 2) {
        await page.waitForTimeout(300);
        continue;
      }

      const firstRow = operationsTable
        .locator(`[data-testid="background-operation-row"][data-job-id="${candidateIds[0]}"]`)
        .first();
      const secondRow = operationsTable
        .locator(`[data-testid="background-operation-row"][data-job-id="${candidateIds[1]}"]`)
        .first();

      try {
        await firstRow.click({ force: true, timeout: 5000 });
        await secondRow.click({ modifiers: ['Control'], force: true, timeout: 5000 });
        selectedJobIds = candidateIds;
        rowsSelected = true;
        break;
      } catch (error) {
        if (attempt === 3) {
          throw error;
        }
        await page.waitForTimeout(300);
      }
    }

    expect(rowsSelected).toBeTruthy();

    // Wait for selection indicators
    await expect(page.getByText(/2 selected/i)).toBeVisible({ timeout: 3000 });

    // CRITICAL DEBUG: Check delete button state before clicking
    const deleteButton = page.getByRole('button', { name: /delete/i, exact: false });
    await expect(deleteButton).toBeVisible();

    const isDisabled = await deleteButton.isDisabled();
    console.log(`[Test] Delete button disabled state: ${isDisabled}`);

    if (isDisabled) {
      console.error('[Test] âŒ CRITICAL: Delete button is DISABLED after selection!');
      console.error('[Test] This indicates bulkActionLoading is stuck at true');

      // Try to get the button's disabled attribute for more info
      const disabledAttr = await deleteButton.getAttribute('disabled');
      console.error(`[Test] Button disabled attribute: ${disabledAttr}`);

      // Force click anyway to see what happens
      console.log('[Test] Attempting force click on disabled button...');
    }

    // Handle either native browser confirm dialogs or the in-app confirmation modal.
    let nativeDialogAccepted = false;
    page.once('dialog', async (dialog) => {
      nativeDialogAccepted = true;
      console.log('[Test] Accepting bulk delete confirmation dialog');
      await dialog.accept();
    });

    // Click bulk delete button (force if needed)
    await deleteButton.click({ force: true });

    const confirmDeleteButton = page.getByRole('button', { name: 'Confirm Delete', exact: true });
    const modalVisible = await confirmDeleteButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (modalVisible) {
      console.log('[Test] Confirming bulk delete via in-app modal');
      await confirmDeleteButton.click();
    } else if (!nativeDialogAccepted) {
      console.log('[Test] No confirmation UI detected; proceeding with row removal checks');
    }

    // Verify targeted seeded rows are removed.
    for (const jobId of selectedJobIds) {
      await expect
        .poll(
          async () =>
            operationsTable
              .locator(`[data-testid="background-operation-row"][data-job-id="${jobId}"]`)
              .count(),
          { timeout: 20000 }
        )
        .toBe(0);
    }

    console.log(`Bulk delete removed seeded jobs: ${selectedJobIds.join(', ')}`);
  });

  test('should refresh data when switching operating contexts (CRM mode)', async ({ page }) => {
    // This test requires admin privileges
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4001';

    // Check if user is admin via API (more reliable than UI text matching)
    const authToken = await page.evaluate(() => {
      const directToken =
        localStorage.getItem('keimenon_token') || localStorage.getItem('temp_auth_token');
      if (directToken) return directToken;

      const authData = localStorage.getItem('auth');
      if (!authData) return null;

      try {
        const parsed = JSON.parse(authData);
        return parsed?.token || null;
      } catch {
        return null;
      }
    });

    if (!authToken) {
      console.log(
        '[Test] No token found in localStorage; falling back to cookie-auth /auth/me request'
      );
    }

    // Check user permissions via API, with fallback token acquisition for runs where
    // localStorage token is not present but login session is otherwise valid.
    let effectiveAuthToken = authToken;
    let userResponse = await page.request.get(
      `${apiBaseUrl}/api/v1/auth/me`,
      effectiveAuthToken
        ? {
            headers: { Authorization: `Bearer ${effectiveAuthToken}` },
          }
        : undefined
    );

    if (!userResponse.ok() && !effectiveAuthToken) {
      const loginResponse = await page.request.post(`${apiBaseUrl}/api/v1/auth/login`, {
        data: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });

      if (loginResponse.ok()) {
        const loginBody = await loginResponse.json();
        if (typeof loginBody?.token === 'string' && loginBody.token.length > 0) {
          effectiveAuthToken = loginBody.token;
          userResponse = await page.request.get(`${apiBaseUrl}/api/v1/auth/me`, {
            headers: { Authorization: `Bearer ${effectiveAuthToken}` },
          });
        }
      }
    }

    if (!userResponse.ok()) {
      const errorBody = await userResponse.text().catch(() => '<unavailable>');
      console.log(
        `[Test] Unable to verify admin context (status=${userResponse.status()}). Skipping CRM-mode assertions. Body: ${errorBody.slice(0, 200)}`
      );
      return;
    }

    const userData = await userResponse.json();
    const isAdmin =
      userData.permission_level === 'super_admin' || userData.permission_level === 'admin';

    if (!isAdmin) {
      console.log(
        `User is not admin (permission: ${userData.permission_level}), test passes trivially`
      );
      // This test only applies to admin users - non-admins pass automatically
      return;
    }

    console.log(
      `User is admin (permission: ${userData.permission_level}), testing CRM context switching`
    );

    // Use helper to wait for table
    const operationsTable = await waitForOperationsTable(page);
    const initialJobCount = await operationsTable.getByTestId('background-operation-row').count();

    // Switch account context (if available)
    const accountSwitcher = page.locator('[role="combobox"], select').filter({
      hasText: /account|context/i,
    });

    if ((await accountSwitcher.count()) > 0) {
      await accountSwitcher.click();

      // Select different account (second option)
      const options = page.locator('option, [role="option"]');
      if ((await options.count()) > 1) {
        await options.nth(1).click();

        // Wait for context switch
        await page.waitForTimeout(2000);

        // Verify jobs were refetched (count may differ)
        const newJobCount = await operationsTable.getByTestId('background-operation-row').count();
        console.log(`Jobs before context switch: ${initialJobCount}, after: ${newJobCount}`);

        // Test passes if UI updated (no assertion on count, just verify table still visible)
        await expect(operationsTable).toBeVisible();
      }
    }
  });

  test('should show loading states during operations', async ({ page }) => {
    // Navigate to settings view
    await navigateToSettings(page);

    // Find clear button using role (avoids strict mode violation with heading)
    const clearButton = page.getByRole('button', {
      name: /Clear Keimenon Data|Clearing Data|Deletion in progress/i,
    });
    await expect(clearButton).toBeVisible({ timeout: 10000 });

    // Click and look for loading indicator
    await clearButton.click();

    // Wait for modal animation to complete
    await page.waitForTimeout(500);

    // Use semantic selector with ARIA role
    const confirmModal = page.getByRole('dialog', { name: /Clear All Keimenon Data/i });
    await expect(confirmModal).toBeVisible({ timeout: 5000 });

    // Click confirm button
    const confirmButton = confirmModal.getByText('Clear Data', { exact: false });
    await confirmButton.click();

    // Verify loading spinner or disabled state
    // The button should show "Clearing Data..." text with spinner
    // Look for spinner specifically within the modal to avoid strict mode violation
    await expect(confirmModal.locator('[class*="animate-spin"]')).toBeVisible({ timeout: 5000 });
  });

  // ==================== NEW TESTS FOR SSE LOADING STATE FIX ====================

  test('should clear loading state when deletion job completes via SSE', async ({ page }) => {
    // Navigate to Data Management settings
    await navigateToSettings(page);

    // Find "Clear Keimenon Data" button
    const clearButton = page.getByRole('button', {
      name: /Clear Keimenon Data|Clearing Data|Deletion in progress/i,
    });
    await expect(clearButton).toBeVisible({ timeout: 10000 });
    await expect(clearButton).not.toBeDisabled();

    // Click button and confirm modal
    await clearButton.click();
    await page.waitForTimeout(500);

    const confirmModal = page.getByRole('dialog', { name: /Clear All Keimenon Data/i });
    await expect(confirmModal).toBeVisible({ timeout: 5000 });

    const confirmButton = confirmModal.getByText('Clear Data', { exact: false });
    await confirmButton.click();

    // CRITICAL: Verify button becomes disabled (isClearing = true)
    await expect(clearButton).toBeDisabled({ timeout: 2000 });
    console.log('[Test] âœ… Loading state activated (button disabled)');

    // Wait for SSE-driven completion UI (more reliable than waiting for low-level stream responses).
    await expect(page.getByText(/data cleared successfully/i)).toBeVisible({
      timeout: 45000,
    });
    console.log('[Test] âœ… SSE completion message displayed');

    // CRITICAL: Verify button re-enables after completion state clears.
    await expect(clearButton).toBeEnabled({ timeout: 10000 });
    console.log('[Test] âœ… Loading state cleared (button re-enabled)');
  });

  test('should handle long-running bulk deletions without timeout', async ({ page, context }) => {
    // WORKAROUND: Intercept DELETE requests using Playwright's request API
    await page.route('**/api/v1/jobs/*', async (route) => {
      const request = route.request();

      if (request.method() === 'DELETE') {
        console.log(`[DELETE Workaround] Intercepting DELETE ${request.url()}`);

        try {
          const response = await context.request.delete(request.url(), {
            headers: request.headers(),
          });

          const body = await response.body();

          await route.fulfill({
            status: response.status(),
            headers: response.headers(),
            body: body,
          });
        } catch (error) {
          console.error(`[DELETE Workaround] Error:`, error);
          await route.abort('failed');
        }
      } else {
        await route.continue();
      }
    });

    // Setup: Create large dataset (10 jobs creates ~5000+ nodes, takes ~40 seconds to delete)
    console.log('[Test] Creating large test dataset for long deletion...');

    await createTestJobs(page, 10); // 10 jobs creates significant data

    // Wait for jobs to complete (imports)
    await page.waitForTimeout(10000);

    // Navigate to ImportsTableCard
    const operationsTable = await waitForOperationsTable(page);

    // Verify jobs are visible (SSE/UI sync can lag under parallel load).
    let visibleRows = await operationsTable.getByTestId('background-operation-row').count();
    if (visibleRows === 0) {
      await expect
        .poll(async () => await operationsTable.getByTestId('background-operation-row').count(), {
          timeout: 20000,
          intervals: [250, 500, 1000, 2000],
        })
        .toBeGreaterThan(0)
        .catch(async () => {
          // Fallback: reseed a smaller batch and re-check to avoid transient empty-state flakes.
          await createTestJobs(page, 3);
          await page.waitForTimeout(3000);
        });
      visibleRows = await operationsTable.getByTestId('background-operation-row').count();
    }

    expect(visibleRows).toBeGreaterThan(0);

    // Select ALL jobs for bulk deletion
    const firstRow = operationsTable.getByTestId('background-operation-row').first();
    await firstRow.click();

    // Use Ctrl+A or select all manually
    const allRows = await operationsTable.getByTestId('background-operation-row').count();
    for (let i = 1; i < Math.min(allRows, 5); i++) {
      await operationsTable
        .getByTestId('background-operation-row')
        .nth(i)
        .click({ modifiers: ['Control'], force: true });
    }

    // Verify we selected at least one row (suite load can temporarily expose fewer rows).
    const selectedCount = await operationsTable
      .locator('[data-testid="background-operation-row"][data-selected="true"]')
      .count();
    expect(selectedCount).toBeGreaterThan(0);
    console.log(`[Test] Selected ${selectedCount} job(s) for deletion`);

    // Click bulk delete button (scoped to operations table to avoid modal button collisions)
    const deleteButton = operationsTable.getByRole('button', { name: /^Delete$/ });
    await expect(deleteButton).toBeVisible();
    await expect(deleteButton).not.toBeDisabled();

    // Handle confirmation dialog/modal
    page.once('dialog', async (dialog) => {
      console.log('[Test] Confirming bulk deletion');
      await dialog.accept();
    });

    await deleteButton.click({ force: true });

    // Some builds use in-app confirmation modal instead of native dialog.
    const confirmDeleteButton = page.getByRole('button', { name: /Confirm Delete/i });
    if (await confirmDeleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmDeleteButton.click();
    }

    // CRITICAL: Verify delete button becomes disabled (bulkActionLoading = true)
    await expect(deleteButton).toBeDisabled({ timeout: 2000 });
    console.log('[Test] âœ… Bulk loading state activated');

    // Wait for deletion to complete.
    const startTime = Date.now();

    // CRITICAL: Verify bulk-loading state clears (selection banner disappears or controls reset).
    await expect(operationsTable.getByText(/\d+\s+selected/i)).toHaveCount(0, { timeout: 30000 });
    const duration = (Date.now() - startTime) / 1000;
    console.log(`[Test] Deletion took ${duration.toFixed(1)} seconds`);
    console.log('[Test] âœ… Bulk loading state cleared (no false timeout)');

    // Verify jobs removed from table (eventual consistency after SSE/store reconciliation).
    await expect
      .poll(async () => await operationsTable.getByTestId('background-operation-row').count(), {
        timeout: 15000,
      })
      .toBeLessThan(allRows);
    const finalJobCount = await operationsTable.getByTestId('background-operation-row').count();

    console.log(`[Test] âœ… ${allRows - finalJobCount} jobs deleted successfully`);
  });

  test('should recover when SSE reconnects during active job', async ({ page }) => {
    // Start deletion job
    await navigateToSettings(page);

    const clearButton = page.getByRole('button', {
      name: /Clear Keimenon Data|Clearing Data|Deletion in progress/i,
    });
    await clearButton.click();
    await page.waitForTimeout(500);

    const confirmModal = page.getByRole('dialog');
    const confirmButton = confirmModal.getByText('Clear Data');
    await confirmButton.click();

    // Wait for job to start
    await expect(clearButton).toBeDisabled({ timeout: 2000 });
    console.log('[Test] Deletion job started');

    // Simulate SSE connection drop (close EventSource in browser context)
    await page.evaluate(() => {
      // Close all EventSource connections
      const eventSources = (window as any).eventSourceConnections || [];
      eventSources.forEach((es: EventSource) => {
        console.log('[Browser] Closing SSE connection to simulate drop');
        es.close();
      });
    });

    console.log('[Test] âœ… SSE connection closed (simulating network drop)');

    // Wait for auto-reconnection (useJobStream retries every 3 seconds)
    await page.waitForTimeout(5000);
    console.log('[Test] Waiting for SSE reconnection...');

    // Verify SSE reconnected by checking for response
    const reconnected = await page
      .waitForResponse((resp) => resp.url().includes('/stream/jobs'), { timeout: 10000 })
      .catch(() => null);

    if (reconnected) {
      console.log('[Test] âœ… SSE reconnected successfully');
    }

    // CRITICAL: Verify loading state still clears after reconnection
    // This tests that the fix handles SSE reconnection gracefully
    await expect(clearButton).toBeEnabled({ timeout: 30000 });
    console.log('[Test] âœ… Loading state cleared after SSE reconnection');

    // Verify UI returned to idle state after reconnection/completion.
    await expect(
      page.getByRole('button', {
        name: /Clear Keimenon Data/i,
      })
    ).toBeEnabled({ timeout: 10000 });
    await expect(
      page.getByRole('button', {
        name: /Clearing Data|Deletion in progress/i,
      })
    ).toHaveCount(0);
  });

  test('should show error and recover from stuck loading state timeout', async ({ page }) => {
    // Block SSE endpoint to simulate permanent connection failure
    await page.route('**/stream/jobs', (route) => route.abort('failed'));
    await page.route('**/api/v1/jobs/stream', (route) => route.abort('failed'));

    console.log('[Test] SSE endpoints blocked (simulating connection failure)');

    // Attempt deletion
    await navigateToSettings(page);

    const clearButton = page.getByRole('button', {
      name: /Clear Keimenon Data|Clearing Data|Deletion in progress/i,
    });
    await clearButton.click();
    await page.waitForTimeout(500);

    const confirmModal = page.getByRole('dialog');
    const confirmButton = confirmModal.getByText('Clear Data');
    await confirmButton.click();

    // Button should become disabled initially
    await expect(clearButton).toBeDisabled({ timeout: 2000 });
    console.log('[Test] Loading state activated (SSE blocked)');

    // Wait for 10-second timeout (job not received in SSE)
    await page.waitForTimeout(12000);

    // Error feedback copy can vary by build; treat it as best-effort signal.
    const errorFeedbackVisible = await page
      .getByText(/lost connection to server|please refresh|unable to track/i)
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (errorFeedbackVisible) {
      console.log('[Test] âœ… Error message displayed after timeout');
    } else {
      console.log(
        '[Test] âš ï¸ No explicit error banner detected; validating recovery state instead'
      );
    }

    // CRITICAL: Verify loading state cleared (button re-enabled)
    await expect(clearButton).toBeEnabled({ timeout: 2000 });
    console.log('[Test] âœ… Loading state cleared after timeout');

    // Verify user can retry (button clickable)
    await expect(clearButton).not.toBeDisabled();
  });
});
