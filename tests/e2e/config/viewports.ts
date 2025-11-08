/**
 * Viewport Configuration for Multi-Viewport Testing
 *
 * Defines standard viewport sizes for testing responsive layouts.
 * These viewports represent real-world device dimensions.
 *
 * Usage:
 * ```typescript
 * import { VIEWPORTS, ViewportName } from './config/viewports';
 *
 * // Set viewport for a test
 * await page.setViewportSize(VIEWPORTS.mobile);
 *
 * // Test all viewports
 * for (const [name, viewport] of Object.entries(VIEWPORTS)) {
 *   await page.setViewportSize(viewport);
 *   // ... test at this viewport
 * }
 * ```
 *
 * Related: tests/e2e/helpers/multi-viewport.ts (helper for testing all viewports)
 * Related: playwright.config.ts (default viewport configuration)
 */

export interface ViewportSize {
  /**
   * Viewport width in pixels
   */
  width: number;

  /**
   * Viewport height in pixels
   */
  height: number;

  /**
   * Device pixel ratio (default: 1)
   * Mobile devices typically use 2 or 3
   */
  deviceScaleFactor?: number;

  /**
   * Whether the device is touch-enabled (default: false)
   */
  isMobile?: boolean;

  /**
   * Whether the device has touch events (default: false)
   */
  hasTouch?: boolean;
}

/**
 * Standard viewport configurations representing real devices
 */
export const VIEWPORTS = {
  /**
   * Mobile viewport - iPhone 12/13/14 Pro
   * 390x844 @ 3x
   *
   * Use for testing:
   * - Mobile navigation menus
   * - Touch interactions
   * - Vertical scrolling
   * - Small screen layouts
   */
  mobile: {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  } as ViewportSize,

  /**
   * Tablet viewport - iPad (10.2-inch)
   * 768x1024 @ 2x (portrait)
   *
   * Use for testing:
   * - Mid-size layouts
   * - Touch interactions on larger screens
   * - Portrait orientation
   */
  tablet: {
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  } as ViewportSize,

  /**
   * Tablet landscape viewport - iPad (10.2-inch) rotated
   * 1024x768 @ 2x (landscape)
   *
   * Use for testing:
   * - Landscape tablet layouts
   * - Wider viewports with touch
   */
  tabletLandscape: {
    width: 1024,
    height: 768,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  } as ViewportSize,

  /**
   * Desktop viewport - Standard 1080p monitor
   * 1920x1080 @ 1x
   *
   * Use for testing:
   * - Desktop layouts
   * - Mouse interactions
   * - Multi-column layouts
   * - Large data tables
   */
  desktop: {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  } as ViewportSize,

  /**
   * Laptop viewport - MacBook Pro 14-inch
   * 1512x982 @ 2x (usable space after browser chrome)
   *
   * Use for testing:
   * - Laptop-specific layouts
   * - Most common developer viewport
   */
  laptop: {
    width: 1512,
    height: 982,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
  } as ViewportSize,

  /**
   * Wide desktop viewport - 4K monitor
   * 3840x2160 @ 1x
   *
   * Use for testing:
   * - Ultra-wide layouts
   * - High-resolution displays
   * - Maximum content visibility
   */
  wide: {
    width: 3840,
    height: 2160,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  } as ViewportSize,
} as const;

/**
 * Viewport names for type safety
 */
export type ViewportName = keyof typeof VIEWPORTS;

/**
 * Get viewport by name
 */
export function getViewport(name: ViewportName): ViewportSize {
  return VIEWPORTS[name];
}

/**
 * Responsive breakpoints (matches common CSS frameworks)
 */
export const BREAKPOINTS = {
  /**
   * Extra small devices (phones, less than 640px)
   */
  xs: 0,

  /**
   * Small devices (phones, 640px and up)
   */
  sm: 640,

  /**
   * Medium devices (tablets, 768px and up)
   */
  md: 768,

  /**
   * Large devices (desktops, 1024px and up)
   */
  lg: 1024,

  /**
   * Extra large devices (large desktops, 1280px and up)
   */
  xl: 1280,

  /**
   * 2X large devices (larger desktops, 1536px and up)
   */
  '2xl': 1536,
} as const;

/**
 * Get breakpoint name for a given width
 */
export function getBreakpoint(width: number): string {
  if (width < BREAKPOINTS.sm) return 'xs';
  if (width < BREAKPOINTS.md) return 'sm';
  if (width < BREAKPOINTS.lg) return 'md';
  if (width < BREAKPOINTS.xl) return 'lg';
  if (width < BREAKPOINTS['2xl']) return 'xl';
  return '2xl';
}

/**
 * Common viewport test combinations
 */
export const VIEWPORT_TEST_SUITES = {
  /**
   * Quick smoke test - Test only mobile and desktop
   * Use for: Fast CI runs, smoke tests
   */
  smoke: ['mobile', 'desktop'] as ViewportName[],

  /**
   * Standard responsive test - Test mobile, tablet, desktop
   * Use for: Comprehensive responsive testing
   */
  standard: ['mobile', 'tablet', 'desktop'] as ViewportName[],

  /**
   * Full responsive test - Test all major viewports
   * Use for: Critical UI changes, major releases
   */
  full: ['mobile', 'tablet', 'tabletLandscape', 'laptop', 'desktop'] as ViewportName[],

  /**
   * Touch devices only - Test mobile and tablet
   * Use for: Touch interaction testing
   */
  touch: ['mobile', 'tablet', 'tabletLandscape'] as ViewportName[],

  /**
   * Desktop variants - Test different desktop sizes
   * Use for: Desktop-specific features
   */
  desktopVariants: ['laptop', 'desktop', 'wide'] as ViewportName[],
} as const;

/**
 * Get viewport names from a test suite
 */
export function getViewportSuite(suiteName: keyof typeof VIEWPORT_TEST_SUITES): ViewportName[] {
  return [...VIEWPORT_TEST_SUITES[suiteName]];
}

/**
 * Check if viewport is mobile (based on width)
 */
export function isMobileViewport(viewport: ViewportSize): boolean {
  return viewport.width < BREAKPOINTS.md;
}

/**
 * Check if viewport is tablet (based on width)
 */
export function isTabletViewport(viewport: ViewportSize): boolean {
  return viewport.width >= BREAKPOINTS.md && viewport.width < BREAKPOINTS.lg;
}

/**
 * Check if viewport is desktop (based on width)
 */
export function isDesktopViewport(viewport: ViewportSize): boolean {
  return viewport.width >= BREAKPOINTS.lg;
}

/**
 * Get appropriate screenshot options for viewport
 */
export function getScreenshotOptions(viewport: ViewportSize) {
  return {
    fullPage: false, // Capture viewport only (not full page)
    animations: 'disabled' as const,
    scale: viewport.deviceScaleFactor === 1 ? ('css' as const) : ('device' as const),
  };
}

/**
 * Format viewport name for screenshot filenames
 *
 * @example
 * formatViewportName('mobile') => 'mobile-390x844'
 * formatViewportName('desktop') => 'desktop-1920x1080'
 */
export function formatViewportName(name: ViewportName): string {
  const viewport = VIEWPORTS[name];
  return `${name}-${viewport.width}x${viewport.height}`;
}

/**
 * Example usage in tests:
 *
 * ```typescript
 * import { test, expect } from '@playwright/test';
 * import { VIEWPORTS, VIEWPORT_TEST_SUITES } from './config/viewports';
 *
 * test.describe('Responsive Layout Tests', () => {
 *   for (const viewportName of VIEWPORT_TEST_SUITES.standard) {
 *     test(`should render correctly on ${viewportName}`, async ({ page }) => {
 *       await page.setViewportSize(VIEWPORTS[viewportName]);
 *       await page.goto('/dashboard');
 *       await expect(page).toHaveScreenshot(`dashboard-${viewportName}.png`);
 *     });
 *   }
 * });
 * ```
 */
