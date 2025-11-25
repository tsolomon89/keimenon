import { test, expect, Page } from '@playwright/test';
import { login } from '../helpers/login';

/**
 * CRUD Template for Resource Testing with Visual Regression
 *
 * This template demonstrates the standard pattern for testing CRUD operations
 * on any resource in the Canvas Memory OS application, including visual regression checks.
 *
 * Usage:
 * 1. Copy this template
 * 2. Replace RESOURCE_NAME with your resource (e.g., "nodes", "edges", "groups")
 * 3. Replace RESOURCE_KIND with the specific type (e.g., "Source", "Group")
 * 4. Update test data to match your resource schema
 * 5. Add resource-specific assertions
 * 6. Visual baselines will be automatically managed by Playwright
 *
 * Visual Regression:
 * - Captures screenshots at critical UI states
 * - Compares against baseline screenshots (first run creates baseline)
 * - Fails test if visual differences exceed threshold
 * - Update baselines: npx playwright test --update-snapshots
 *
 * Related: apps/api/src/routes/{resource}.ts
 * Schema: ai_context/schemas/{Resource}.json
 */

// ==================== VISUAL REGRESSION CONFIG ====================

/**
 * Visual regression configuration
 * Adjust threshold based on your needs:
 * - 0.0 = exact match required
 * - 0.1 = allow 10% difference (recommended for dynamic content)
 * - 0.2 = allow 20% difference (for highly dynamic UIs)
 */
const VISUAL_REGRESSION_CONFIG = {
  threshold: 0.1, // Allow 10% difference for dynamic content (timestamps, etc.)
  maxDiffPixels: 100, // Allow up to 100 pixels to differ
  animations: 'disabled' as const, // Disable animations for consistent screenshots
};

/**
 * Capture screenshot with consistent naming for visual regression testing
 *
 * @param page - Playwright page object
 * @param testName - Name of the test (e.g., 'create-resource')
 * @param step - Current step in the test (e.g., 'dialog-open')
 */
async function captureBaseline(page: Page, testName: string, step: string): Promise<void> {
  const screenshotName = `${testName.replace(/\s+/g, '-')}-${step}.png`;
  await expect(page).toHaveScreenshot(screenshotName, VISUAL_REGRESSION_CONFIG);
}

test.describe('RESOURCE_NAME CRUD - Client Account', () => {
  // Tag critical path tests with @smoke
  test.describe.configure({ tag: '@smoke' });

  // Setup: Login and navigate before each test
  test.beforeEach(async ({ page }) => {
    // Login as client account user
    await login(page, 'client@test.com', 'TestPass123!');
    await page.goto('/canvas'); // or appropriate page

    // Wait for app to be ready
    await page.waitForLoadState('networkidle');
  });

  // Cleanup: Delete test data after each test
  test.afterEach(async ({ request }) => {
    // Delete all test-tagged data
    await request.delete('/api/v1/RESOURCE_NAME', {
      params: { data_tag: 'test' },
    });
  });

  // ==================== CREATE ====================

  test('should create RESOURCE_NAME with valid data', async ({ page, request }) => {
    // 📸 Visual check: Initial canvas state (before creation)
    await captureBaseline(page, 'create-resource', '00-initial-canvas');

    // Step 1: Open create dialog/form
    await page.getByRole('button', { name: /create RESOURCE_NAME/i }).click();

    // Wait for dialog to be visible
    await expect(page.getByRole('dialog')).toBeVisible();

    // 📸 Visual check: Dialog opened correctly
    await captureBaseline(page, 'create-resource', '01-dialog-open');

    // Step 2: Fill in required fields
    await page.getByLabel(/name|title/i).fill('Test RESOURCE_NAME');
    await page.getByLabel(/description|content/i).fill('Test description');

    // Add any resource-specific fields here
    // await page.getByLabel(/field_name/i).fill('value');

    // 📸 Visual check: Form filled state
    await captureBaseline(page, 'create-resource', '02-form-filled');

    // Step 3: Submit form
    await page.getByRole('button', { name: /create|save/i }).click();

    // Step 4: Verify UI feedback
    await expect(page.getByText(/created successfully|success/i)).toBeVisible();

    // 📸 Visual check: Success toast/notification
    await captureBaseline(page, 'create-resource', '03-success-toast');

    // Step 5: Verify resource appears in list/canvas
    await expect(page.getByText('Test RESOURCE_NAME')).toBeVisible();

    // 📸 Visual check: Resource in canvas (CRITICAL - validates UI rendering)
    await captureBaseline(page, 'create-resource', '04-canvas-with-resource');

    // Step 6: Verify via API (backend validation)
    const response = await request.get('/api/v1/RESOURCE_NAME', {
      params: { limit: 10 },
    });
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.RESOURCE_NAME).toHaveLength(1);
    expect(data.RESOURCE_NAME[0].properties?.title || data.RESOURCE_NAME[0].name).toBe(
      'Test RESOURCE_NAME'
    );
  });

  test('should show validation error for invalid data', async ({ page }) => {
    // Step 1: Open create dialog
    await page.getByRole('button', { name: /create RESOURCE_NAME/i }).click();

    // Step 2: Try to submit without required fields
    await page.getByRole('button', { name: /create|save/i }).click();

    // Step 3: Verify validation error
    await expect(page.getByText(/required|cannot be empty/i)).toBeVisible();

    // 📸 Visual check: Validation error displayed
    await captureBaseline(page, 'create-resource', 'validation-error');

    // Alternative: Check for form validation feedback
    const nameInput = page.getByLabel(/name|title/i);
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
  });

  test('should not create duplicate RESOURCE_NAME', async ({ page, request }) => {
    // Step 1: Create first resource via API
    await request.post('/api/v1/RESOURCE_NAME', {
      data: {
        kind: 'RESOURCE_KIND',
        properties: {
          name: 'Duplicate Test',
          data_tag: 'test',
        },
      },
    });

    // Reload to show the existing resource
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Step 2: Try to create duplicate via UI
    await page.getByRole('button', { name: /create RESOURCE_NAME/i }).click();
    await page.getByLabel(/name|title/i).fill('Duplicate Test');
    await page.getByRole('button', { name: /create|save/i }).click();

    // Step 3: Verify error message
    await expect(page.getByText(/already exists|duplicate/i)).toBeVisible();

    // 📸 Visual check: Duplicate error message
    await captureBaseline(page, 'create-resource', 'duplicate-error');
  });

  // ==================== READ ====================

  test('should display RESOURCE_NAME details', async ({ page, request }) => {
    // Step 1: Create resource via API
    const response = await request.post('/api/v1/RESOURCE_NAME', {
      data: {
        kind: 'RESOURCE_KIND',
        properties: {
          name: 'Details Test',
          description: 'Test description',
          data_tag: 'test',
        },
      },
    });
    const resource = await response.json();
    const resourceId = resource.id;

    // Step 2: Navigate to resource (click or direct URL)
    await page.goto(`/canvas/RESOURCE_NAME/${resourceId}`);
    // OR: await page.getByText('Details Test').click();

    // Step 3: Verify details are displayed
    await expect(page.getByRole('heading', { name: 'Details Test' })).toBeVisible();
    await expect(page.getByText('Test description')).toBeVisible();

    // 📸 Visual check: Details view layout and content
    await captureBaseline(page, 'read-resource', 'details-view');

    // Verify resource-specific fields
    // await expect(page.getByText(/field_value/i)).toBeVisible();
  });

  test('should filter RESOURCE_NAME list', async ({ page, request }) => {
    // Step 1: Create multiple resources via API
    await request.post('/api/v1/RESOURCE_NAME', {
      data: { kind: 'RESOURCE_KIND', properties: { name: 'Apple', data_tag: 'test' } },
    });
    await request.post('/api/v1/RESOURCE_NAME', {
      data: { kind: 'RESOURCE_KIND', properties: { name: 'Banana', data_tag: 'test' } },
    });
    await request.post('/api/v1/RESOURCE_NAME', {
      data: { kind: 'RESOURCE_KIND', properties: { name: 'Cherry', data_tag: 'test' } },
    });

    // Step 2: Reload to see all resources
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 📸 Visual check: All resources visible (unfiltered)
    await captureBaseline(page, 'read-resource', 'list-unfiltered');

    // Step 3: Apply filter
    await page.getByPlaceholder(/search|filter/i).fill('Apple');
    await page.waitForTimeout(500); // Debounce

    // Step 4: Verify filtered results
    await expect(page.getByText('Apple')).toBeVisible();
    await expect(page.getByText('Banana')).not.toBeVisible();
    await expect(page.getByText('Cherry')).not.toBeVisible();

    // 📸 Visual check: Filtered list showing only matching resource
    await captureBaseline(page, 'read-resource', 'list-filtered');
  });

  // ==================== UPDATE ====================

  test('should update RESOURCE_NAME properties', async ({ page, request }) => {
    // Step 1: Create resource via API
    const response = await request.post('/api/v1/RESOURCE_NAME', {
      data: {
        kind: 'RESOURCE_KIND',
        properties: {
          name: 'Original Name',
          description: 'Original description',
          data_tag: 'test',
        },
      },
    });
    const resource = await response.json();
    const resourceId = resource.id;

    // Step 2: Navigate to resource
    await page.goto(`/canvas/RESOURCE_NAME/${resourceId}`);

    // 📸 Visual check: Original state before edit
    await captureBaseline(page, 'update-resource', '01-original-state');

    // Step 3: Click edit button
    await page.getByRole('button', { name: /edit|update/i }).click();

    // 📸 Visual check: Edit mode activated
    await captureBaseline(page, 'update-resource', '02-edit-mode');

    // Step 4: Update fields
    await page.getByLabel(/name|title/i).clear();
    await page.getByLabel(/name|title/i).fill('Updated Name');
    await page.getByLabel(/description/i).clear();
    await page.getByLabel(/description/i).fill('Updated description');

    // 📸 Visual check: Form filled with updated values
    await captureBaseline(page, 'update-resource', '03-form-updated');

    // Step 5: Save changes
    await page.getByRole('button', { name: /save|update/i }).click();

    // Step 6: Verify UI feedback
    await expect(page.getByText(/updated successfully|saved/i)).toBeVisible();

    // 📸 Visual check: Success notification
    await captureBaseline(page, 'update-resource', '04-saved-state');

    // Step 7: Verify changes persisted (UI)
    await expect(page.getByRole('heading', { name: 'Updated Name' })).toBeVisible();
    await expect(page.getByText('Updated description')).toBeVisible();

    // 📸 Visual check: Updated content displayed (CRITICAL - validates persistence)
    await captureBaseline(page, 'update-resource', '05-canvas-updated');

    // Step 8: Verify via API (backend validation)
    const updatedResponse = await request.get(`/api/v1/RESOURCE_NAME/${resourceId}`);
    const updatedResource = await updatedResponse.json();
    expect(updatedResource.properties.name).toBe('Updated Name');
    expect(updatedResource.properties.description).toBe('Updated description');
  });

  // ==================== DELETE ====================

  test('should delete RESOURCE_NAME', async ({ page, request }) => {
    // Step 1: Create resource via API
    const response = await request.post('/api/v1/RESOURCE_NAME', {
      data: {
        kind: 'RESOURCE_KIND',
        properties: {
          name: 'To Be Deleted',
          data_tag: 'test',
        },
      },
    });
    const resource = await response.json();
    const resourceId = resource.id;

    // Step 2: Navigate to resource
    await page.goto(`/canvas/RESOURCE_NAME/${resourceId}`);

    // 📸 Visual check: Resource exists before deletion
    await captureBaseline(page, 'delete-resource', '01-before-delete');

    // Step 3: Click delete button
    await page.getByRole('button', { name: /delete|remove/i }).click();

    // Step 4: Confirm deletion in dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/are you sure|confirm/i)).toBeVisible();

    // 📸 Visual check: Confirmation dialog displayed
    await captureBaseline(page, 'delete-resource', '02-confirm-dialog');

    await page.getByRole('button', { name: /delete|confirm/i }).click();

    // Step 5: Verify UI feedback
    await expect(page.getByText(/deleted successfully|removed/i)).toBeVisible();

    // 📸 Visual check: Success notification
    await captureBaseline(page, 'delete-resource', '03-deleted-success');

    // Step 6: Verify resource no longer visible
    await expect(page.getByText('To Be Deleted')).not.toBeVisible();

    // 📸 Visual check: Canvas without deleted resource (CRITICAL - validates removal)
    await captureBaseline(page, 'delete-resource', '04-canvas-after-delete');

    // Step 7: Verify via API (backend validation)
    const deletedResponse = await request.get(`/api/v1/RESOURCE_NAME/${resourceId}`);
    expect(deletedResponse.status()).toBe(404);
  });

  test('should not delete RESOURCE_NAME without permission', async ({ page, request }) => {
    // Step 1: Create resource as admin
    await request.post('/api/v1/RESOURCE_NAME', {
      data: {
        kind: 'RESOURCE_KIND',
        properties: {
          name: 'Protected Resource',
          created_by: 'admin_user_id',
          data_tag: 'test',
        },
      },
      headers: {
        Authorization: 'Bearer admin_token', // Use admin token
      },
    });

    // Step 2: Login as junior user (no delete permission)
    await page.goto('/logout');
    await login(page, 'junior@test.com', 'TestPass123!');
    await page.goto('/canvas');

    // Step 3: Try to delete
    await page.getByText('Protected Resource').click();

    // Step 4: Verify delete button is disabled or hidden
    const deleteButton = page.getByRole('button', { name: /delete|remove/i });
    await expect(deleteButton).toBeDisabled();
    // OR: await expect(deleteButton).not.toBeVisible();

    // 📸 Visual check: Delete button disabled/hidden (validates permission enforcement)
    await captureBaseline(page, 'delete-resource', 'permission-denied');
  });

  // ==================== PERMISSIONS ====================

  test('should enforce RBAC for RESOURCE_NAME operations', async ({ page, request }) => {
    // This test verifies that permission levels are enforced
    // Adjust based on your RBAC rules

    // Test as viewer (read-only)
    await page.goto('/logout');
    await login(page, 'viewer@test.com', 'TestPass123!');
    await page.goto('/canvas');

    // Verify create button is not visible
    await expect(page.getByRole('button', { name: /create RESOURCE_NAME/i })).not.toBeVisible();

    // 📸 Visual check: Viewer UI (no create button)
    await captureBaseline(page, 'permissions', 'viewer-readonly');

    // Test as senior (can create/update)
    await page.goto('/logout');
    await login(page, 'senior@test.com', 'TestPass123!');
    await page.goto('/canvas');

    // Verify create button is visible
    await expect(page.getByRole('button', { name: /create RESOURCE_NAME/i })).toBeVisible();

    // 📸 Visual check: Senior UI (with create button)
    await captureBaseline(page, 'permissions', 'senior-edit-access');
  });

  // ==================== RESPONSIVE / MULTI-VIEWPORT ====================

  test('should display correctly across all viewports', async ({ page }) => {
    /**
     * This test verifies that the RESOURCE_NAME UI is responsive
     * and displays correctly on mobile, tablet, and desktop devices.
     */

    // Import multi-viewport helpers dynamically to avoid import errors
    const { captureMultiViewport } = await import('../helpers/multi-viewport');
    const { VIEWPORT_TEST_SUITES } = await import('../config/viewports');

    // Navigate to the main view
    await page.goto('/canvas');
    await page.waitForLoadState('networkidle');

    // Capture screenshots at all standard viewports (mobile, tablet, desktop)
    await captureMultiViewport(page, 'resource-list-responsive', VIEWPORT_TEST_SUITES.standard, {
      transitionDelay: 1000, // Allow time for layout to adjust
      verbose: true,
    });
  });

  test('should handle create dialog responsively', async ({ page }) => {
    /**
     * Verify that the create dialog adapts to different screen sizes.
     * Mobile: Full-screen modal
     * Desktop: Centered dialog
     */

    const { testMultiViewport } = await import('../helpers/multi-viewport');

    await testMultiViewport(
      page,
      ['mobile', 'tablet', 'desktop'],
      async (viewportName) => {
        // Open create dialog
        await page.getByRole('button', { name: /create RESOURCE_NAME/i }).click();
        await expect(page.getByRole('dialog')).toBeVisible();

        // Dialog should be visible on all viewports
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();

        // Close dialog for next viewport
        const closeButton = page.getByRole('button', { name: /close|cancel/i });
        if (await closeButton.isVisible()) {
          await closeButton.click();
        }
      },
      {
        testName: 'create-dialog-responsive',
        captureScreenshots: true,
        screenshotOptions: {
          threshold: 0.1,
        },
      }
    );
  });

  test('should display resource details responsively', async ({ page, request }) => {
    /**
     * Verify that resource detail views adapt to screen size.
     * Mobile: Stacked layout
     * Desktop: Multi-column layout
     */

    const { testMultiViewport } = await import('../helpers/multi-viewport');

    // Create a test resource
    const response = await request.post('/api/v1/RESOURCE_NAME', {
      data: {
        kind: 'RESOURCE_KIND',
        properties: {
          name: 'Responsive Test Resource',
          description: 'Testing responsive layout',
          data_tag: 'test',
        },
      },
    });
    const resource = await response.json();
    const resourceId = resource.id;

    await testMultiViewport(
      page,
      ['mobile', 'tablet', 'desktop'],
      async (viewportName) => {
        // Navigate to resource details
        await page.goto(`/canvas/RESOURCE_NAME/${resourceId}`);
        await page.waitForLoadState('networkidle');

        // Verify heading is visible on all viewports
        await expect(
          page.getByRole('heading', { name: /Responsive Test Resource/i })
        ).toBeVisible();

        // Verify description is visible
        await expect(page.getByText(/Testing responsive layout/i)).toBeVisible();
      },
      {
        testName: 'resource-details-responsive',
        captureScreenshots: true,
        transitionDelay: 1000,
      }
    );
  });

  test('should handle navigation menu responsively', async ({ page }) => {
    /**
     * Verify that navigation adapts to screen size.
     * Mobile: Hamburger menu
     * Desktop: Full navigation bar
     */

    const { verifyElementVisibility } = await import('../helpers/multi-viewport');

    await page.goto('/canvas');
    await page.waitForLoadState('networkidle');

    // Test mobile menu button visibility
    // Adjust selectors based on your actual navigation implementation
    const mobileMenuSelector = '[data-testid="mobile-menu-button"]';
    const desktopNavSelector = '[data-testid="desktop-nav"]';

    // If these elements exist in your app, test their visibility
    if ((await page.locator(mobileMenuSelector).count()) > 0) {
      await verifyElementVisibility(
        page,
        mobileMenuSelector,
        {
          mobile: true,
          tablet: true,
          desktop: false,
        },
        {
          testName: 'navigation-responsive',
          captureScreenshots: true,
        }
      );
    }
  });

  test('should handle data tables responsively', async ({ page, request }) => {
    /**
     * Verify that resource lists/tables adapt to screen size.
     * Mobile: Card layout or scrollable table
     * Desktop: Full table with all columns
     */

    const { testMultiViewport } = await import('../helpers/multi-viewport');

    // Create multiple resources for table testing
    for (let i = 1; i <= 5; i++) {
      await request.post('/api/v1/RESOURCE_NAME', {
        data: {
          kind: 'RESOURCE_KIND',
          properties: {
            name: `Table Test Resource ${i}`,
            data_tag: 'test',
          },
        },
      });
    }

    await testMultiViewport(
      page,
      ['mobile', 'tablet', 'desktop'],
      async (viewportName) => {
        await page.goto('/canvas');
        await page.waitForLoadState('networkidle');

        // Verify at least one resource is visible
        await expect(page.getByText(/Table Test Resource/i).first()).toBeVisible();

        // On mobile, table might be replaced with cards or horizontal scroll
        // On desktop, full table should be visible
        // Adjust based on your actual implementation
      },
      {
        testName: 'resource-table-responsive',
        captureScreenshots: true,
        transitionDelay: 1000,
      }
    );
  });
});
