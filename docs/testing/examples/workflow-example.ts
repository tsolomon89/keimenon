import { test, expect, Page } from '@playwright/test';
import { login } from '../helpers/login';
import { authGet, authDelete } from '../helpers/authenticated-request';

/**
 * Complex Workflow Template with Visual Regression
 *
 * This template is for testing end-to-end workflows that involve multiple steps,
 * async processing, real-time updates, and cross-component coordination.
 *
 * Visual regression testing captures each workflow stage to validate:
 * - UI state transitions between stages
 * - Progress indicators display correctly
 * - Success/error states render properly
 * - No visual artifacts during async operations
 *
 * Example workflows:
 * - Chat import: Upload → Parse → Dedupe → Stitch → Visualize
 * - Job lifecycle: Create → Queue → Run → Progress → Complete
 * - Account creation: Register → Verify → Setup → Onboard
 *
 * Usage:
 * 1. Copy this template
 * 2. Replace WORKFLOW_NAME with your workflow
 * 3. Define all workflow stages
 * 4. Add stage-specific assertions
 * 5. Handle async/SSE updates appropriately
 * 6. Visual baselines captured at each critical stage
 *
 * Related: docs/features/WORKFLOW_NAME.md
 * Related: apps/api/src/services/WORKFLOW_NAME-service.ts
 */

// ==================== VISUAL REGRESSION CONFIG ====================

/**
 * Visual regression configuration for workflow testing
 * Looser threshold due to progress bars and dynamic timestamps
 */
const VISUAL_REGRESSION_CONFIG = {
  threshold: 0.15, // 15% threshold for dynamic content (progress bars, timestamps)
  maxDiffPixels: 200,
  animations: 'disabled' as const,
};

/**
 * Capture screenshot of workflow stage with consistent naming
 *
 * @param page - Playwright page object
 * @param workflowName - Name of workflow (e.g., 'chat-import')
 * @param stage - Current stage (e.g., 'initiation', 'processing', 'completion')
 * @param detail - Optional detail (e.g., 'error', '50-percent-progress')
 */
async function captureWorkflowStage(
  page: Page,
  workflowName: string,
  stage:
    | 'initiation'
    | 'processing'
    | 'completion'
    | 'error'
    | 'cancellation'
    | 'paused'
    | 'history',
  detail?: string
): Promise<void> {
  const stageName = detail ? `${stage}-${detail}` : stage;
  const screenshotName = `${workflowName.replace(/\s+/g, '-')}-${stageName}.png`;
  await expect(page).toHaveScreenshot(screenshotName, VISUAL_REGRESSION_CONFIG);
}

test.describe('WORKFLOW_NAME - End-to-End Flow', () => {
  test.describe.configure({ tag: '@smoke' });

  test.beforeEach(async ({ page }) => {
    await login(page, 'client@test.com', 'TestPass123!');
    await page.goto('/dashboard'); // or appropriate starting page
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: Delete all workflow-related data
    await authDelete(page, '/api/v1/RESOURCE_NAME', {
      params: { data_tag: 'test' },
    });
    await authDelete(page, '/api/v1/jobs', {
      params: { data_tag: 'test' },
    });
  });

  // ==================== HAPPY PATH ====================

  test('should complete full WORKFLOW_NAME successfully', async ({ page }) => {
    /**
     * This test covers the complete workflow from start to finish,
     * verifying each stage completes successfully with expected output.
     */

    // ========== Stage 1: Initiation ==========
    console.log('[Workflow Test] Stage 1: Initiation');

    // 📸 Visual check: Initial state before starting workflow
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'initiation', 'before-start');

    // Step 1.1: Navigate to workflow start
    await page.getByRole('button', { name: /start WORKFLOW_NAME|upload|create/i }).click();

    // 📸 Visual check: Dialog/form opened for workflow initiation
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'initiation', 'dialog-open');

    // Step 1.2: Provide initial input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('path/to/test-file.json'); // Replace with actual test file

    // Alternative: Fill form fields
    // await page.getByLabel(/field_name/i).fill('value');

    // 📸 Visual check: Form filled with input data
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'initiation', 'form-filled');

    // Step 1.3: Submit to start workflow
    await page.getByRole('button', { name: /submit|start|begin/i }).click();

    // Step 1.4: Verify initiation success
    await expect(page.getByText(/started|initiated|processing/i)).toBeVisible();

    // 📸 Visual check: Workflow initiated and processing started
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'initiation', 'started');

    // ========== Stage 2: Processing (Async) ==========
    console.log('[Workflow Test] Stage 2: Processing');

    // Step 2.1: Wait for async job to start
    // If using SSE/WebSocket for real-time updates:
    await page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/stream') || resp.url().includes('/api/v1/jobs'),
      { timeout: 10000 }
    );

    // Step 2.2: Monitor progress indicator
    const progressBar = page.locator('[role="progressbar"]');
    await expect(progressBar).toBeVisible();

    // 📸 Visual check: Progress bar visible (early stage)
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'processing', 'progress-started');

    // Step 2.3: Verify progress updates (if SSE)
    // The progress should increase over time
    const initialProgress = await progressBar.getAttribute('aria-valuenow');
    await page.waitForTimeout(2000); // Wait for processing
    const updatedProgress = await progressBar.getAttribute('aria-valuenow');
    expect(Number(updatedProgress)).toBeGreaterThan(Number(initialProgress || 0));

    // 📸 Visual check: Progress bar mid-way (validates updates)
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'processing', 'progress-mid');

    // Step 2.4: Wait for completion
    // Use a custom locator or wait for specific text
    await expect(page.getByText(/completed|success|done/i)).toBeVisible({ timeout: 30000 });

    // 📸 Visual check: Completion notification displayed
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'processing', 'complete-notification');

    // ========== Stage 3: Verification ==========
    console.log('[Workflow Test] Stage 3: Verification');

    // Step 3.1: Verify output is visible in UI
    await expect(page.getByText(/your WORKFLOW_NAME is complete/i)).toBeVisible();

    // 📸 Visual check: Completion summary displayed
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'completion', 'summary');

    // Step 3.2: Navigate to results view
    await page.getByRole('button', { name: /view results|go to|open/i }).click();

    // Step 3.3: Verify expected data is present
    // Example: For chat import, verify conversations are visible
    await expect(page.getByRole('list')).toBeVisible();
    const items = await page.getByRole('listitem').count();
    expect(items).toBeGreaterThan(0);

    // 📸 Visual check: Results view with workflow output (CRITICAL - validates end result)
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'completion', 'results-view');

    // Step 3.4: Verify specific workflow outputs
    // Example: Check that specific entities were created
    await expect(page.getByText(/expected_output_1/i)).toBeVisible();
    await expect(page.getByText(/expected_output_2/i)).toBeVisible();

    // ========== Stage 4: Post-Processing ==========
    console.log('[Workflow Test] Stage 4: Post-Processing');

    // Step 4.1: Verify related data was created (via API)
    // Example: Check database for workflow artifacts
    const response = await authGet(page, '/api/v1/RESOURCE_NAME', {
      params: { limit: 100, data_tag: 'test' },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.length || data.RESOURCE_NAME.length).toBeGreaterThan(0);

    // Step 4.2: Verify workflow metadata
    // Example: Check job status
    const jobResponse = await authGet(page, '/api/v1/jobs', {
      params: { type: 'WORKFLOW_TYPE', limit: 1 },
    });
    const jobs = await jobResponse.json();
    expect(jobs.length || jobs.jobs.length).toBe(1);
    const job = jobs[0] || jobs.jobs[0];
    expect(job.status).toBe('succeeded');
    expect(job.state_data).toBeDefined();

    // Step 4.3: Verify statistics/summary
    // Example: Check import summary shows correct counts
    await expect(page.getByText(/processed \d+ items/i)).toBeVisible();
  });

  // ==================== ERROR HANDLING ====================

  test('should handle workflow errors gracefully', async ({ page }) => {
    /**
     * This test verifies that errors during workflow execution
     * are handled properly with clear feedback to the user.
     */

    // Step 1: Start workflow with invalid input
    await page.getByRole('button', { name: /start WORKFLOW_NAME/i }).click();

    // Upload invalid file or provide bad input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('path/to/invalid-file.txt'); // Wrong format

    await page.getByRole('button', { name: /submit/i }).click();

    // Step 2: Wait for error handling
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });

    // Step 3: Verify error message is helpful
    const errorText = await page.getByRole('alert').textContent();
    expect(errorText).toMatch(/invalid|error|failed/i);
    expect(errorText?.length).toBeGreaterThan(10); // Not just "Error"

    // 📸 Visual check: Error state with helpful message
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'error', 'invalid-input');

    // Step 4: Verify workflow can be retried
    await page.getByRole('button', { name: /try again|retry/i }).click();

    // Step 5: Verify correct file succeeds
    await fileInput.setInputFiles('path/to/valid-file.json');
    await page.getByRole('button', { name: /submit/i }).click();
    await expect(page.getByText(/processing|started/i)).toBeVisible();

    // 📸 Visual check: Retry successful, workflow processing
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'error', 'retry-success');
  });

  // ==================== CANCELLATION ====================

  test('should allow cancelling in-progress workflow', async ({ page }) => {
    /**
     * Users should be able to cancel long-running workflows
     * and the system should clean up properly.
     */

    // Step 1: Start workflow
    await page.getByRole('button', { name: /start WORKFLOW_NAME/i }).click();
    await page.locator('input[type="file"]').setInputFiles('path/to/large-file.json');
    await page.getByRole('button', { name: /submit/i }).click();

    // Step 2: Wait for processing to start
    await expect(page.getByText(/processing/i)).toBeVisible();
    await expect(page.locator('[role="progressbar"]')).toBeVisible();

    // 📸 Visual check: Workflow in-progress before cancellation
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'cancellation', 'before-cancel');

    // Step 3: Click cancel button
    await page.getByRole('button', { name: /cancel|stop/i }).click();

    // Step 4: Confirm cancellation
    await expect(page.getByRole('dialog')).toBeVisible();

    // 📸 Visual check: Confirmation dialog for cancellation
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'cancellation', 'confirm-dialog');

    await page.getByRole('button', { name: /yes|confirm|cancel/i }).click();

    // Step 5: Verify cancellation feedback
    await expect(page.getByText(/cancelled|stopped/i)).toBeVisible();

    // 📸 Visual check: Cancellation complete (validates cleanup)
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'cancellation', 'cancelled');

    // Step 6: Verify job status via API
    const jobResponse = await authGet(page, '/api/v1/jobs', {
      params: { type: 'WORKFLOW_TYPE', limit: 1 },
    });
    const jobs = await jobResponse.json();
    const job = jobs[0] || jobs.jobs[0];
    expect(job.status).toBe('canceled');

    // Step 7: Verify partial data was cleaned up (if applicable)
    const dataResponse = await authGet(page, '/api/v1/RESOURCE_NAME', {
      params: { data_tag: 'test' },
    });
    const data = await dataResponse.json();
    // Should either be empty or marked as incomplete
    expect(data.length || data.RESOURCE_NAME.length).toBe(0);
  });

  // ==================== PAUSE & RESUME ====================

  test('should support pausing and resuming workflow', async ({ page }) => {
    /**
     * Some workflows can be paused and resumed later.
     * This test verifies the pause/resume functionality.
     */

    // Step 1: Start workflow
    await page.getByRole('button', { name: /start WORKFLOW_NAME/i }).click();
    await page.locator('input[type="file"]').setInputFiles('path/to/file.json');
    await page.getByRole('button', { name: /submit/i }).click();
    await expect(page.getByText(/processing/i)).toBeVisible();

    // Step 2: Pause workflow
    await page.getByRole('button', { name: /pause/i }).click();
    await expect(page.getByText(/paused/i)).toBeVisible();

    // 📸 Visual check: Workflow paused with frozen progress
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'paused', 'pause-state');

    // Step 3: Verify progress is frozen
    const progressBefore = await page.locator('[role="progressbar"]').getAttribute('aria-valuenow');
    await page.waitForTimeout(2000);
    const progressAfter = await page.locator('[role="progressbar"]').getAttribute('aria-valuenow');
    expect(progressAfter).toBe(progressBefore);

    // Step 4: Resume workflow
    await page.getByRole('button', { name: /resume|continue/i }).click();
    await expect(page.getByText(/processing|resumed/i)).toBeVisible();

    // 📸 Visual check: Workflow resumed, progress continuing
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'paused', 'resumed');

    // Step 5: Verify progress continues
    await page.waitForTimeout(2000);
    const progressResumed = await page
      .locator('[role="progressbar"]')
      .getAttribute('aria-valuenow');
    expect(Number(progressResumed)).toBeGreaterThan(Number(progressAfter || 0));

    // Step 6: Wait for completion
    await expect(page.getByText(/completed|success/i)).toBeVisible({ timeout: 30000 });
  });

  // ==================== CONCURRENT WORKFLOWS ====================

  test('should handle multiple concurrent workflows', async ({ page, context }) => {
    /**
     * Users may start multiple workflows simultaneously.
     * Verify they don't interfere with each other.
     */

    // Step 1: Start first workflow
    await page.getByRole('button', { name: /start WORKFLOW_NAME/i }).click();
    await page.locator('input[type="file"]').setInputFiles('path/to/file1.json');
    await page.getByRole('button', { name: /submit/i }).click();
    await expect(page.getByText(/processing/i)).toBeVisible();

    // Step 2: Open second tab and start another workflow
    const page2 = await context.newPage();
    await page2.goto('/dashboard');
    await page2.getByRole('button', { name: /start WORKFLOW_NAME/i }).click();
    await page2.locator('input[type="file"]').setInputFiles('path/to/file2.json');
    await page2.getByRole('button', { name: /submit/i }).click();
    await expect(page2.getByText(/processing/i)).toBeVisible();

    // Step 3: Verify both workflows are tracked separately
    const jobsResponse = await authGet(page, '/api/v1/jobs', {
      params: { type: 'WORKFLOW_TYPE', limit: 10 },
    });
    const jobs = await jobsResponse.json();
    expect(jobs.length || jobs.jobs.length).toBeGreaterThanOrEqual(2);

    // Step 4: Wait for both to complete
    await expect(page.getByText(/completed/i)).toBeVisible({ timeout: 30000 });
    await expect(page2.getByText(/completed/i)).toBeVisible({ timeout: 30000 });

    // Step 5: Verify outputs don't mix
    // Each workflow should have created distinct data
    const data1Response = await authGet(page, '/api/v1/RESOURCE_NAME', {
      params: { created_by: 'job_1_id' },
    });
    const data2Response = await authGet(page2, '/api/v1/RESOURCE_NAME', {
      params: { created_by: 'job_2_id' },
    });
    // Verify data is distinct
    expect(data1Response).not.toEqual(data2Response);

    await page2.close();
  });

  // ==================== WORKFLOW HISTORY ====================

  test('should maintain workflow history for later review', async ({ page }) => {
    /**
     * Users should be able to review past workflows
     * and see their status, results, and metadata.
     */

    // Step 1: Complete a workflow
    await page.getByRole('button', { name: /start WORKFLOW_NAME/i }).click();
    await page.locator('input[type="file"]').setInputFiles('path/to/file.json');
    await page.getByRole('button', { name: /submit/i }).click();
    await expect(page.getByText(/completed/i)).toBeVisible({ timeout: 30000 });

    // Step 2: Navigate to workflow history
    await page.getByRole('link', { name: /history|past workflows|jobs/i }).click();

    // Step 3: Verify completed workflow is listed
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: /completed/i })).toBeVisible();

    // 📸 Visual check: History view with completed workflows
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'history', 'list-view');

    // Step 4: Click on workflow to see details
    await page
      .getByRole('row')
      .filter({ hasText: /completed/i })
      .click();

    // Step 5: Verify details are displayed
    await expect(page.getByText(/workflow details|job details/i)).toBeVisible();
    await expect(page.getByText(/status: succeeded/i)).toBeVisible();
    await expect(page.getByText(/duration:/i)).toBeVisible();
    await expect(page.getByText(/items processed:/i)).toBeVisible();

    // 📸 Visual check: Workflow detail view with metadata
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'history', 'detail-view');

    // Step 6: Verify can access workflow results from history
    await page.getByRole('button', { name: /view results/i }).click();
    await expect(page).toHaveURL(/\/results|\/output/);

    // 📸 Visual check: Results accessible from history
    await captureWorkflowStage(page, 'WORKFLOW_NAME', 'history', 'results-from-history');
  });

  // ==================== RESPONSIVE / MULTI-VIEWPORT ====================

  test('should display workflow initiation responsively', async ({ page }) => {
    /**
     * Verify that workflow initiation UI adapts to screen size.
     * Mobile: Full-screen upload dialog
     * Desktop: Centered modal with drag-and-drop
     */

    const { testMultiViewport } = await import('../helpers/multi-viewport');

    await testMultiViewport(
      page,
      ['mobile', 'tablet', 'desktop'],
      async (viewportName) => {
        // Click start workflow button
        await page.getByRole('button', { name: /start WORKFLOW_NAME|upload|create/i }).click();

        // Verify dialog/form is visible on all viewports
        const dialogOrForm = page.locator('[role="dialog"], form');
        await expect(dialogOrForm.first()).toBeVisible();

        // On mobile, dialog might be full-screen
        // On desktop, it might be a centered modal
        // Both should be functional

        // Close for next viewport
        const closeButton = page.getByRole('button', { name: /close|cancel/i });
        if (await closeButton.isVisible()) {
          await closeButton.click();
        } else {
          // Navigate back if modal auto-navigates
          await page.goto('/dashboard');
        }
      },
      {
        testName: 'workflow-initiation-responsive',
        captureScreenshots: true,
        screenshotOptions: {
          threshold: 0.15,
        },
      }
    );
  });

  test('should display progress indicator responsively', async ({ page }) => {
    /**
     * Verify that workflow progress is visible and readable on all devices.
     * Mobile: Compact progress indicator
     * Desktop: Detailed progress with multiple metrics
     */

    const { testMultiViewport } = await import('../helpers/multi-viewport');

    // This test assumes you can trigger a workflow that takes a few seconds
    // Adjust based on your actual workflow implementation

    await testMultiViewport(
      page,
      ['mobile', 'tablet', 'desktop'],
      async (viewportName) => {
        // Start workflow (simplified - adjust to your actual workflow)
        await page.getByRole('button', { name: /start WORKFLOW_NAME/i }).click();

        // Wait a moment for workflow to start
        await page.waitForTimeout(2000);

        // Verify progress indicator is visible
        const progressIndicator = page.locator('[role="progressbar"], [data-testid="progress"]');
        if ((await progressIndicator.count()) > 0) {
          await expect(progressIndicator.first()).toBeVisible();

          // Progress text should be readable on all viewports
          const progressText = page.getByText(/processing|%|progress/i);
          if ((await progressText.count()) > 0) {
            await expect(progressText.first()).toBeVisible();
          }
        }
      },
      {
        testName: 'workflow-progress-responsive',
        captureScreenshots: true,
        screenshotOptions: {
          threshold: 0.2, // Higher threshold due to dynamic progress bars
        },
      }
    );
  });

  test('should display workflow results responsively', async ({ page }) => {
    /**
     * Verify that workflow results adapt to screen size.
     * Mobile: Scrollable list with summary cards
     * Desktop: Grid layout with detailed results
     */

    const { testMultiViewport } = await import('../helpers/multi-viewport');

    // Assuming workflow has completed, navigate to results
    // Adjust based on your actual workflow

    await testMultiViewport(
      page,
      ['mobile', 'tablet', 'desktop'],
      async (viewportName) => {
        // Navigate to results page
        // This might be /results, /workflow-results, or similar
        await page.goto('/dashboard'); // Adjust to your results page

        // Wait for results to load
        await page.waitForLoadState('networkidle');

        // Verify results are displayed
        // Adjust selectors based on your actual UI
        const resultsList = page.locator('[role="list"], [data-testid="results"]');
        if ((await resultsList.count()) > 0) {
          await expect(resultsList.first()).toBeVisible();
        }
      },
      {
        testName: 'workflow-results-responsive',
        captureScreenshots: true,
        transitionDelay: 1000,
      }
    );
  });

  test('should display workflow history responsively', async ({ page }) => {
    /**
     * Verify that workflow history table/list adapts to screen size.
     * Mobile: Card-based list with key info
     * Desktop: Full table with all columns
     */

    const { testMultiViewport } = await import('../helpers/multi-viewport');

    await testMultiViewport(
      page,
      ['mobile', 'tablet', 'desktop'],
      async (viewportName) => {
        // Navigate to workflow history
        await page.getByRole('link', { name: /history|past workflows|jobs/i }).click();

        // Wait for history to load
        await page.waitForLoadState('networkidle');

        // Verify history is displayed
        const historyTable = page.locator('[role="table"], [data-testid="history"]');
        if ((await historyTable.count()) > 0) {
          await expect(historyTable.first()).toBeVisible();
        }

        // On mobile, table might be replaced with cards
        // On desktop, full table should be visible
      },
      {
        testName: 'workflow-history-responsive',
        captureScreenshots: true,
        transitionDelay: 1000,
      }
    );
  });

  test('should handle workflow errors responsively', async ({ page }) => {
    /**
     * Verify that error messages are readable on all devices.
     * Mobile: Full-width alert
     * Desktop: Centered notification
     */

    const { testMultiViewport } = await import('../helpers/multi-viewport');

    await testMultiViewport(
      page,
      ['mobile', 'tablet', 'desktop'],
      async (viewportName) => {
        // Start workflow with invalid input
        await page.getByRole('button', { name: /start WORKFLOW_NAME/i }).click();

        // Try to submit without required fields or with invalid data
        const submitButton = page.getByRole('button', { name: /submit|start|begin/i });
        if ((await submitButton.count()) > 0) {
          await submitButton.click();
        }

        // Wait for error to appear
        await page.waitForTimeout(1000);

        // Verify error message is visible on all viewports
        const errorMessage = page.locator('[role="alert"], [data-testid="error"]');
        if ((await errorMessage.count()) > 0) {
          await expect(errorMessage.first()).toBeVisible();
        }
      },
      {
        testName: 'workflow-error-responsive',
        captureScreenshots: true,
        screenshotOptions: {
          threshold: 0.15,
        },
      }
    );
  });

  test('should handle workflow controls responsively', async ({ page }) => {
    /**
     * Verify that workflow controls (pause, cancel, resume) are accessible
     * on all devices and don't overlap with progress display.
     */

    const { testMultiViewport } = await import('../helpers/multi-viewport');

    await testMultiViewport(
      page,
      ['mobile', 'tablet', 'desktop'],
      async (viewportName) => {
        // Navigate to active workflow (if exists) or start new one
        await page.goto('/dashboard');

        // Look for workflow control buttons
        const controlButtons = page.locator(
          'button:has-text("Pause"), button:has-text("Cancel"), button:has-text("Stop")'
        );

        if ((await controlButtons.count()) > 0) {
          // Verify controls are visible and not overlapping content
          await expect(controlButtons.first()).toBeVisible();

          // On mobile, controls might be at bottom in fixed position
          // On desktop, controls might be inline with progress
        }
      },
      {
        testName: 'workflow-controls-responsive',
        captureScreenshots: true,
        transitionDelay: 500,
      }
    );
  });

  test('should display multi-step workflow progression responsively', async ({ page }) => {
    /**
     * Verify that multi-step workflow indicators (breadcrumbs, stepper)
     * adapt appropriately to screen size.
     * Mobile: Compact step indicator
     * Desktop: Full stepper with labels
     */

    const { captureMultiViewport } = await import('../helpers/multi-viewport');
    const { VIEWPORT_TEST_SUITES } = await import('../config/viewports');

    // Navigate to workflow in progress
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Capture workflow progression UI across viewports
    await captureMultiViewport(page, 'workflow-progression', VIEWPORT_TEST_SUITES.standard, {
      transitionDelay: 1000,
      verbose: true,
    });
  });
});

/**
 * WORKFLOW TESTING CHECKLIST
 *
 * ✅ Happy Path - Complete workflow from start to finish
 * ✅ Error Handling - Invalid input handled gracefully
 * ✅ Cancellation - Can cancel in-progress workflow
 * ✅ Pause/Resume - Can pause and resume (if supported)
 * ✅ Concurrent - Multiple workflows don't interfere
 * ✅ History - Past workflows are accessible
 * ✅ Progress Updates - Real-time progress is accurate
 * ✅ API Consistency - Backend state matches UI state
 * ✅ Cleanup - Failed workflows clean up resources
 * ✅ Retry - Can retry failed workflows
 *
 * Additional considerations:
 * - Long-running workflows (> 1 minute)
 * - Large data volumes
 * - Network interruptions
 * - Browser refresh during workflow
 * - Notification/alerts for completion
 */
