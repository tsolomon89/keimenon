import { Page, expect } from '@playwright/test';
import {
  VIEWPORTS,
  ViewportName,
  ViewportSize,
  formatViewportName,
  getViewportSuite,
} from '../config/viewports';

/**
 * Multi-Viewport Test Helper
 *
 * Simplifies testing UI across multiple viewport sizes (mobile, tablet, desktop).
 * Automatically handles viewport switching, screenshot capture, and layout verification.
 *
 * Usage:
 * ```typescript
 * import { testMultiViewport, captureMultiViewport } from './helpers/multi-viewport';
 *
 * // Test a page across all standard viewports
 * await testMultiViewport(page, ['mobile', 'tablet', 'desktop'], async (viewportName) => {
 *   await page.goto('/dashboard');
 *   await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
 * });
 *
 * // Capture screenshots at multiple viewports
 * await page.goto('/dashboard');
 * await captureMultiViewport(page, 'dashboard', ['mobile', 'desktop']);
 * ```
 *
 * Related: tests/e2e/config/viewports.ts (viewport definitions)
 * Related: tests/e2e/templates/*.spec.ts (usage in template tests)
 */

export interface MultiViewportTestOptions {
  /**
   * Test name for screenshot naming
   * Default: 'multi-viewport-test'
   */
  testName?: string;

  /**
   * Whether to capture screenshots after each viewport test
   * Default: false
   */
  captureScreenshots?: boolean;

  /**
   * Screenshot options
   */
  screenshotOptions?: {
    threshold?: number;
    maxDiffPixels?: number;
    animations?: 'disabled' | 'allow';
  };

  /**
   * Delay in milliseconds between viewport changes
   * Useful if layout needs time to adjust
   * Default: 500
   */
  transitionDelay?: number;

  /**
   * Whether to log viewport changes to console
   * Default: true
   */
  verbose?: boolean;
}

/**
 * Test a function across multiple viewports
 *
 * This helper:
 * 1. Loops through specified viewports
 * 2. Sets viewport size
 * 3. Waits for layout to stabilize
 * 4. Executes test function
 * 5. Optionally captures screenshots
 *
 * @param page - Playwright page object
 * @param viewports - Array of viewport names to test (or suite name)
 * @param testFn - Async function to execute at each viewport
 * @param options - Optional configuration
 *
 * @example
 * ```typescript
 * await testMultiViewport(
 *   page,
 *   ['mobile', 'tablet', 'desktop'],
 *   async (viewportName) => {
 *     await page.goto('/dashboard');
 *     await expect(page.getByRole('navigation')).toBeVisible();
 *   },
 *   { captureScreenshots: true, testName: 'dashboard-layout' }
 * );
 * ```
 */
export async function testMultiViewport(
  page: Page,
  viewports: ViewportName[] | keyof typeof import('../config/viewports').VIEWPORT_TEST_SUITES,
  testFn: (viewportName: ViewportName, viewport: ViewportSize) => Promise<void>,
  options?: MultiViewportTestOptions
): Promise<void> {
  const opts: Required<MultiViewportTestOptions> = {
    testName: options?.testName || 'multi-viewport-test',
    captureScreenshots: options?.captureScreenshots ?? false,
    screenshotOptions: {
      threshold: 0.15, // 15% threshold for dynamic content
      maxDiffPixels: 200,
      animations: 'disabled',
      ...options?.screenshotOptions,
    },
    transitionDelay: options?.transitionDelay ?? 500,
    verbose: options?.verbose ?? true,
  };

  // Resolve viewport names
  const viewportNames = Array.isArray(viewports) ? viewports : getViewportSuite(viewports as any);

  if (opts.verbose) {
    console.log(
      `\n🔄 Testing across ${viewportNames.length} viewports: ${viewportNames.join(', ')}`
    );
  }

  for (const viewportName of viewportNames) {
    const viewport = VIEWPORTS[viewportName];

    if (opts.verbose) {
      console.log(`  📱 Testing viewport: ${viewportName} (${viewport.width}x${viewport.height})`);
    }

    // Set viewport
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    // Wait for layout to stabilize
    await page.waitForLoadState('networkidle');
    if (opts.transitionDelay > 0) {
      await page.waitForTimeout(opts.transitionDelay);
    }

    // Execute test function
    try {
      await testFn(viewportName, viewport);

      // Capture screenshot if requested
      if (opts.captureScreenshots) {
        const screenshotName = `${opts.testName}-${formatViewportName(viewportName)}.png`;
        await expect(page).toHaveScreenshot(screenshotName, opts.screenshotOptions);

        if (opts.verbose) {
          console.log(`    📸 Screenshot: ${screenshotName}`);
        }
      }
    } catch (error) {
      console.error(`    ❌ Test failed at ${viewportName} viewport`);
      throw error;
    }
  }

  if (opts.verbose) {
    console.log(`  ✅ All ${viewportNames.length} viewports tested successfully\n`);
  }
}

/**
 * Capture screenshots at multiple viewports
 *
 * Simpler version of testMultiViewport that only captures screenshots
 * without running test assertions.
 *
 * @param page - Playwright page object
 * @param testName - Test name for screenshot naming
 * @param viewports - Array of viewport names (or suite name)
 * @param options - Optional screenshot options
 *
 * @example
 * ```typescript
 * await page.goto('/dashboard');
 * await captureMultiViewport(page, 'dashboard', 'standard');
 * // Creates: dashboard-mobile-390x844.png, dashboard-tablet-768x1024.png, dashboard-desktop-1920x1080.png
 * ```
 */
export async function captureMultiViewport(
  page: Page,
  testName: string,
  viewports: ViewportName[] | keyof typeof import('../config/viewports').VIEWPORT_TEST_SUITES,
  options?: {
    threshold?: number;
    maxDiffPixels?: number;
    animations?: 'disabled' | 'allow';
    transitionDelay?: number;
    verbose?: boolean;
  }
): Promise<void> {
  await testMultiViewport(
    page,
    viewports,
    async () => {
      // No test logic, just capture screenshot
    },
    {
      testName,
      captureScreenshots: true,
      screenshotOptions: options,
      transitionDelay: options?.transitionDelay,
      verbose: options?.verbose,
    }
  );
}

/**
 * Verify element visibility across multiple viewports
 *
 * Tests that a specific element is visible (or hidden) at different viewport sizes.
 * Useful for testing responsive show/hide behavior.
 *
 * @param page - Playwright page object
 * @param selector - Element selector
 * @param expectedVisibility - Expected visibility at each viewport
 * @param options - Optional configuration
 *
 * @example
 * ```typescript
 * // Desktop menu should be visible on desktop, hidden on mobile
 * await verifyElementVisibility(
 *   page,
 *   '[data-testid="desktop-menu"]',
 *   {
 *     mobile: false,
 *     tablet: false,
 *     desktop: true,
 *   }
 * );
 * ```
 */
export async function verifyElementVisibility(
  page: Page,
  selector: string,
  expectedVisibility: Partial<Record<ViewportName, boolean>>,
  options?: {
    testName?: string;
    captureScreenshots?: boolean;
    verbose?: boolean;
  }
): Promise<void> {
  const viewportNames = Object.keys(expectedVisibility) as ViewportName[];

  await testMultiViewport(
    page,
    viewportNames,
    async (viewportName) => {
      const shouldBeVisible = expectedVisibility[viewportName];
      const element = page.locator(selector);

      if (shouldBeVisible) {
        await expect(element).toBeVisible();
      } else {
        await expect(element).not.toBeVisible();
      }
    },
    {
      testName: options?.testName || 'element-visibility',
      captureScreenshots: options?.captureScreenshots,
      verbose: options?.verbose,
    }
  );
}

/**
 * Test element layout across viewports
 *
 * Verifies that an element maintains expected dimensions or relationships
 * across different viewport sizes.
 *
 * @param page - Playwright page object
 * @param selector - Element selector
 * @param layoutTests - Layout test functions for each viewport
 * @param options - Optional configuration
 *
 * @example
 * ```typescript
 * await testElementLayout(
 *   page,
 *   '.sidebar',
 *   {
 *     mobile: async (box) => {
 *       expect(box.width).toBeLessThan(400);
 *     },
 *     desktop: async (box) => {
 *       expect(box.width).toBeGreaterThan(200);
 *       expect(box.width).toBeLessThan(400);
 *     },
 *   }
 * );
 * ```
 */
export async function testElementLayout(
  page: Page,
  selector: string,
  layoutTests: Partial<
    Record<
      ViewportName,
      (box: { width: number; height: number; x: number; y: number }) => Promise<void>
    >
  >,
  options?: {
    testName?: string;
    captureScreenshots?: boolean;
    verbose?: boolean;
  }
): Promise<void> {
  const viewportNames = Object.keys(layoutTests) as ViewportName[];

  await testMultiViewport(
    page,
    viewportNames,
    async (viewportName) => {
      const layoutTest = layoutTests[viewportName];
      if (!layoutTest) return;

      const element = page.locator(selector);
      const box = await element.boundingBox();

      if (!box) {
        throw new Error(`Element not found or not visible: ${selector}`);
      }

      await layoutTest(box);
    },
    {
      testName: options?.testName || 'element-layout',
      captureScreenshots: options?.captureScreenshots,
      verbose: options?.verbose,
    }
  );
}

/**
 * Compare layouts across viewports
 *
 * Captures screenshots at multiple viewports and optionally compares them.
 * Useful for validating that responsive breakpoints work correctly.
 *
 * @param page - Playwright page object
 * @param testName - Test name for screenshot naming
 * @param viewports - Viewports to compare
 * @param navigationFn - Function to navigate and prepare page
 * @param options - Optional configuration
 *
 * @example
 * ```typescript
 * await compareViewports(
 *   page,
 *   'dashboard-layout',
 *   ['mobile', 'tablet', 'desktop'],
 *   async () => {
 *     await page.goto('/dashboard');
 *     await page.waitForLoadState('networkidle');
 *   },
 *   { captureScreenshots: true }
 * );
 * ```
 */
export async function compareViewports(
  page: Page,
  testName: string,
  viewports: ViewportName[],
  navigationFn: () => Promise<void>,
  options?: {
    captureScreenshots?: boolean;
    verbose?: boolean;
  }
): Promise<void> {
  await testMultiViewport(
    page,
    viewports,
    async (viewportName) => {
      // Re-navigate at each viewport
      await navigationFn();
    },
    {
      testName,
      captureScreenshots: options?.captureScreenshots ?? true,
      verbose: options?.verbose,
    }
  );
}

/**
 * Responsive design helper - Test common responsive patterns
 *
 * Tests common responsive design patterns like:
 * - Mobile menu becomes hamburger
 * - Sidebar collapses on mobile
 * - Grid columns adjust based on screen size
 * - Font sizes scale appropriately
 *
 * @example
 * ```typescript
 * import { ResponsivePattern } from './helpers/multi-viewport';
 *
 * await testResponsivePattern(page, ResponsivePattern.HAMBURGER_MENU, {
 *   hamburgerSelector: '[data-testid="mobile-menu-button"]',
 *   menuSelector: '[data-testid="navigation-menu"]',
 * });
 * ```
 */
export enum ResponsivePattern {
  /**
   * Mobile menu collapses to hamburger icon
   */
  HAMBURGER_MENU = 'hamburger-menu',

  /**
   * Sidebar shows/hides based on viewport
   */
  COLLAPSIBLE_SIDEBAR = 'collapsible-sidebar',

  /**
   * Grid adjusts column count
   */
  RESPONSIVE_GRID = 'responsive-grid',

  /**
   * Content stacks vertically on mobile
   */
  VERTICAL_STACK = 'vertical-stack',
}

/**
 * Test a common responsive pattern
 */
export async function testResponsivePattern(
  page: Page,
  pattern: ResponsivePattern,
  selectors: Record<string, string>,
  options?: {
    testName?: string;
    captureScreenshots?: boolean;
  }
): Promise<void> {
  switch (pattern) {
    case ResponsivePattern.HAMBURGER_MENU:
      await verifyElementVisibility(
        page,
        selectors.hamburgerSelector,
        {
          mobile: true,
          tablet: true,
          desktop: false,
        },
        options
      );
      break;

    case ResponsivePattern.COLLAPSIBLE_SIDEBAR:
      await verifyElementVisibility(
        page,
        selectors.sidebarSelector,
        {
          mobile: false,
          tablet: false,
          desktop: true,
        },
        options
      );
      break;

    // Add more patterns as needed
    default:
      throw new Error(`Responsive pattern not implemented: ${pattern}`);
  }
}

/**
 * Example test using multi-viewport helper:
 *
 * ```typescript
 * import { test, expect } from '@playwright/test';
 * import { testMultiViewport, captureMultiViewport } from './helpers/multi-viewport';
 * import { VIEWPORT_TEST_SUITES } from './config/viewports';
 *
 * test.describe('Dashboard Responsive Tests', () => {
 *   test('should display correctly across all viewports', async ({ page }) => {
 *     await page.goto('/dashboard');
 *
 *     // Capture screenshots at all standard viewports
 *     await captureMultiViewport(page, 'dashboard', 'standard');
 *   });
 *
 *   test('should show mobile menu on small screens', async ({ page }) => {
 *     await page.goto('/dashboard');
 *
 *     await testMultiViewport(
 *       page,
 *       ['mobile', 'tablet', 'desktop'],
 *       async (viewportName) => {
 *         const mobileMenu = page.getByTestId('mobile-menu');
 *         const desktopMenu = page.getByTestId('desktop-menu');
 *
 *         if (viewportName === 'mobile' || viewportName === 'tablet') {
 *           await expect(mobileMenu).toBeVisible();
 *           await expect(desktopMenu).not.toBeVisible();
 *         } else {
 *           await expect(mobileMenu).not.toBeVisible();
 *           await expect(desktopMenu).toBeVisible();
 *         }
 *       }
 *     );
 *   });
 * });
 * ```
 */
