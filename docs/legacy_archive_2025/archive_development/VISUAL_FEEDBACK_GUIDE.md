# Visual Feedback Testing Guide

## Developer Reference for Autonomous E2E Testing

**Version**: 1.0.0
**Last Updated**: 2025-11-01
**Status**: Production Ready

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Concepts](#core-concepts)
3. [Visual Regression Testing](#visual-regression-testing)
4. [Multi-Viewport Testing](#multi-viewport-testing)
5. [Baseline Management](#baseline-management)
6. [API Reference](#api-reference)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)
9. [Example Workflows](#example-workflows)

---

## Quick Start

### 1. Add Visual Regression to Your Test

```typescript
import { test, expect, Page } from '@playwright/test';

// Visual regression configuration
const VISUAL_CONFIG = {
  threshold: 0.1, // 10% tolerance
  maxDiffPixels: 100,
  animations: 'disabled' as const,
};

// Helper function for consistent naming
async function captureBaseline(page: Page, testName: string, step: string): Promise<void> {
  const screenshotName = `${testName.replace(/\s+/g, '-')}-${step}.png`;
  await expect(page).toHaveScreenshot(screenshotName, VISUAL_CONFIG);
}

test('should display dashboard correctly', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  // 📸 Visual checkpoint
  await captureBaseline(page, 'dashboard', '01-initial-load');

  // Your test logic...
});
```

### 2. Add Multi-Viewport Testing

```typescript
import { VIEWPORTS, VIEWPORT_TEST_SUITES } from './config/viewports';
import { captureMultiViewport } from './helpers/multi-viewport';

test('should be responsive', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  // Test across mobile, tablet, desktop
  await captureMultiViewport(page, 'dashboard-responsive', VIEWPORT_TEST_SUITES.standard, {
    threshold: 0.1,
  });
});
```

### 3. Run Tests and Approve Baselines

```bash
# Run tests (first run creates baselines)
npm run e2e

# Approve all new baselines
npx tsx tests/e2e/helpers/baseline-manager.ts update

# Or approve specific baseline
npx tsx tests/e2e/helpers/baseline-manager.ts approve dashboard-01-initial-load.png
```

---

## Core Concepts

### Visual Feedback Loop

The Anthropic Claude Agent SDK emphasizes a visual feedback loop for UI testing:

```
┌─────────────────────────────────────────────────────┐
│    GATHER CONTEXT → TAKE ACTION → VERIFY WORK      │
│                         ↓                           │
│                   📸 SCREENSHOT                     │
│                         ↓                           │
│                 COMPARE & REPEAT                    │
└─────────────────────────────────────────────────────┘
```

**Benefits**:

- Verify UI state visually, not just logically
- Catch visual regressions automatically
- Build confidence in test accuracy
- Document expected UI state

### Visual Regression Testing

**What is it?**

- Comparing current screenshots to baseline (golden) screenshots
- Detecting unintended visual changes
- Pixel-level comparison with configurable thresholds

**When to use it?**

- Critical user flows (login, checkout, data creation)
- UI components with complex styling
- Responsive layouts across viewports
- Multi-tenant isolation (security-critical)

**Key Components**:

1. **Baseline Screenshots**: Git-tracked "golden" images in `test-results/.playwright-snapshots/`
2. **Current Screenshots**: Generated during test runs
3. **Diff Images**: Visual comparison output showing pixel differences
4. **Thresholds**: Configurable tolerance for acceptable differences

### Screenshot Naming Convention

**Pattern**: `{test-name}-{context}-{step}.png`

**Examples**:

- `create-node-01-dialog-open.png` - Standard test
- `ui-isolation-account-a-keimenon-view.png` - Multi-tenant test with account context
- `import-workflow-processing-progress-started.png` - Workflow test with stage

**Best Practices**:

- Use consistent prefixes for test groups
- Number steps sequentially (`01`, `02`, `03`)
- Include context when needed (account type, user role)
- Use descriptive step names (`dialog-open`, not `step1`)

---

## Visual Regression Testing

### Configuration Options

Different content types require different thresholds:

```typescript
// STRICT (5%) - Security-critical tests
const STRICT_CONFIG = {
  threshold: 0.05, // Only 5% difference allowed
  maxDiffPixels: 50,
  animations: 'disabled' as const,
};

// STANDARD (10%) - Normal UI tests
const STANDARD_CONFIG = {
  threshold: 0.1, // 10% difference allowed
  maxDiffPixels: 100,
  animations: 'disabled' as const,
};

// DYNAMIC (15%) - Tests with dynamic content
const DYNAMIC_CONFIG = {
  threshold: 0.15, // 15% difference allowed
  maxDiffPixels: 200,
  animations: 'disabled' as const,
};
```

**When to use each**:

| Config             | Use Cases                                          | Examples                                        |
| ------------------ | -------------------------------------------------- | ----------------------------------------------- |
| **STRICT (5%)**    | Security, data isolation, critical flows           | Multi-tenant tests, payment flows, admin panels |
| **STANDARD (10%)** | Most UI tests, forms, dialogs                      | CRUD operations, navigation, modals             |
| **DYNAMIC (15%)**  | Content with timestamps, progress bars, animations | Workflows, real-time updates, loading states    |

### Basic Usage

```typescript
import { test, expect } from '@playwright/test';

const VISUAL_CONFIG = {
  threshold: 0.1,
  maxDiffPixels: 100,
  animations: 'disabled' as const,
};

test('visual regression example', async ({ page }) => {
  await page.goto('/page');

  // Wait for page to be ready
  await page.waitForLoadState('networkidle');

  // 📸 Capture screenshot and compare to baseline
  await expect(page).toHaveScreenshot('page-loaded.png', VISUAL_CONFIG);
});
```

### Advanced Usage with Helper Functions

```typescript
import { Page } from '@playwright/test';

// Reusable helper function
async function captureBaseline(
  page: Page,
  testName: string,
  step: string,
  config = { threshold: 0.1, maxDiffPixels: 100, animations: 'disabled' as const }
): Promise<void> {
  const screenshotName = `${testName.replace(/\s+/g, '-')}-${step}.png`;
  await expect(page).toHaveScreenshot(screenshotName, config);
}

test('multi-step workflow with visual checks', async ({ page }) => {
  const testName = 'create-node';

  // Initial state
  await page.goto('/keimenon');
  await captureBaseline(page, testName, '00-initial-keimenon');

  // Dialog opened
  await page.getByRole('button', { name: /create node/i }).click();
  await captureBaseline(page, testName, '01-dialog-open');

  // Form filled
  await page.getByLabel('Title').fill('Test Node');
  await captureBaseline(page, testName, '02-form-filled');

  // Success state
  await page.getByRole('button', { name: /create/i }).click();
  await page.waitForSelector('text=Node created successfully');
  await captureBaseline(page, testName, '03-success-toast');

  // Final keimenon state
  await page.waitForTimeout(500); // Wait for toast to disappear
  await captureBaseline(page, testName, '04-keimenon-with-node');
});
```

### Account-Specific Baselines (Multi-Tenant)

For security-critical tests, capture separate baselines per account:

```typescript
async function captureAccountBaseline(
  page: Page,
  testName: string,
  accountContext: 'account-a' | 'account-b' | 'admin',
  step: string
): Promise<void> {
  const screenshotName = `${testName.replace(/\s+/g, '-')}-${accountContext}-${step}.png`;
  await expect(page).toHaveScreenshot(screenshotName, {
    threshold: 0.05, // Strict for security
    maxDiffPixels: 50,
    animations: 'disabled' as const,
  });
}

test('should isolate account data visually', async ({ page }) => {
  // Login as Account A
  await login(page, 'accounta@test.com', '123456');
  await page.goto('/keimenon');

  // 📸 Capture Account A's view
  await captureAccountBaseline(page, 'ui-isolation', 'account-a', 'keimenon-view');

  // Switch to Account B
  await page.goto('/logout');
  await login(page, 'accountb@test.com', '123456');
  await page.goto('/keimenon');

  // 📸 Capture Account B's view (MUST be different)
  await captureAccountBaseline(page, 'ui-isolation', 'account-b', 'keimenon-view');

  // Visual comparison will FAIL if Account B sees Account A's data
});
```

### Workflow Stage Capture

For multi-step workflows, capture each stage:

```typescript
async function captureWorkflowStage(
  page: Page,
  workflowName: string,
  stage: 'initiation' | 'processing' | 'completion' | 'error' | 'cancellation' | 'paused',
  detail?: string
): Promise<void> {
  const stageName = detail ? `${stage}-${detail}` : stage;
  const screenshotName = `${workflowName.replace(/\s+/g, '-')}-${stageName}.png`;

  await expect(page).toHaveScreenshot(screenshotName, {
    threshold: 0.15, // Dynamic content tolerance
    maxDiffPixels: 200,
    animations: 'disabled' as const,
  });
}

test('should track workflow visually', async ({ page }) => {
  const workflowName = 'chat-import';

  // Initiation phase
  await captureWorkflowStage(page, workflowName, 'initiation', 'before-start');
  await page.getByRole('button', { name: /import/i }).click();
  await captureWorkflowStage(page, workflowName, 'initiation', 'dialog-open');

  // Processing phase
  await page.getByRole('button', { name: /start/i }).click();
  await captureWorkflowStage(page, workflowName, 'processing', 'progress-started');

  // Wait for progress
  await page.waitForSelector('[role="progressbar"]');
  await captureWorkflowStage(page, workflowName, 'processing', 'mid-progress');

  // Completion phase
  await page.waitForSelector('text=Import complete');
  await captureWorkflowStage(page, workflowName, 'completion', 'success');
});
```

---

## Multi-Viewport Testing

### Viewport Definitions

Standard viewports representing real devices:

```typescript
import { VIEWPORTS } from './config/viewports';

// Available viewports:
VIEWPORTS.mobile; // 390x844 (iPhone 12/13/14 Pro)
VIEWPORTS.tablet; // 768x1024 (iPad 10.2")
VIEWPORTS.tabletLandscape; // 1024x768 (iPad landscape)
VIEWPORTS.laptop; // 1512x982 (MacBook Pro 14")
VIEWPORTS.desktop; // 1920x1080 (Standard 1080p)
VIEWPORTS.wide; // 3840x2160 (4K monitor)
```

### Test Suite Options

Predefined viewport combinations for different testing needs:

```typescript
import { VIEWPORT_TEST_SUITES } from './config/viewports';

// Quick smoke test (2 viewports)
VIEWPORT_TEST_SUITES.smoke = ['mobile', 'desktop'];

// Standard responsive test (3 viewports)
VIEWPORT_TEST_SUITES.standard = ['mobile', 'tablet', 'desktop'];

// Full responsive test (5 viewports)
VIEWPORT_TEST_SUITES.full = ['mobile', 'tablet', 'tabletLandscape', 'laptop', 'desktop'];

// Touch devices only (3 viewports)
VIEWPORT_TEST_SUITES.touch = ['mobile', 'tablet', 'tabletLandscape'];

// Desktop variants (3 viewports)
VIEWPORT_TEST_SUITES.desktopVariants = ['laptop', 'desktop', 'wide'];
```

### Basic Multi-Viewport Testing

```typescript
import { test } from '@playwright/test';
import { captureMultiViewport } from './helpers/multi-viewport';
import { VIEWPORT_TEST_SUITES } from './config/viewports';

test('should display correctly on all devices', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  // Capture screenshots across mobile, tablet, desktop
  await captureMultiViewport(page, 'dashboard-responsive', VIEWPORT_TEST_SUITES.standard, {
    threshold: 0.1,
    maxDiffPixels: 100,
    animations: 'disabled',
    transitionDelay: 1000, // Wait 1s after viewport change
    verbose: true, // Log progress
  });
});
```

**Output**: 3 screenshots created:

- `dashboard-responsive-mobile-390x844.png`
- `dashboard-responsive-tablet-768x1024.png`
- `dashboard-responsive-desktop-1920x1080.png`

### Advanced Multi-Viewport Testing with Custom Logic

```typescript
import { testMultiViewport } from './helpers/multi-viewport';
import { VIEWPORTS, ViewportName } from './config/viewports';

test('should show/hide elements based on viewport', async ({ page }) => {
  await page.goto('/dashboard');

  await testMultiViewport(
    page,
    ['mobile', 'tablet', 'desktop'],
    async (viewportName, viewport) => {
      // Custom test logic per viewport

      if (viewportName === 'mobile') {
        // Mobile: Hamburger menu should be visible
        await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
        await expect(page.getByRole('navigation')).not.toBeVisible();
      } else {
        // Tablet/Desktop: Full navigation should be visible
        await expect(page.getByRole('button', { name: /menu/i })).not.toBeVisible();
        await expect(page.getByRole('navigation')).toBeVisible();
      }

      // Verify critical content is always visible
      await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
    },
    {
      testName: 'responsive-navigation',
      captureScreenshots: true,
      screenshotOptions: { threshold: 0.1 },
    }
  );
});
```

### Verify Element Visibility Across Viewports

```typescript
import { verifyElementVisibility } from './helpers/multi-viewport';

test('should show/hide mobile menu correctly', async ({ page }) => {
  await page.goto('/dashboard');

  // Define expected visibility per viewport
  await verifyElementVisibility(
    page,
    '[data-testid="mobile-menu-button"]',
    {
      mobile: true, // Visible on mobile
      tablet: false, // Hidden on tablet
      desktop: false, // Hidden on desktop
    },
    {
      testName: 'mobile-menu-visibility',
      captureScreenshots: true,
    }
  );
});
```

### Test Element Layout Across Viewports

```typescript
import { testElementLayout } from './helpers/multi-viewport';

test('should position header correctly', async ({ page }) => {
  await page.goto('/dashboard');

  await testElementLayout(
    page,
    'header',
    {
      mobile: async (box) => {
        // Mobile: Full width, compact height
        expect(box.width).toBeGreaterThanOrEqual(390);
        expect(box.height).toBeLessThan(80);
        expect(box.x).toBe(0); // Flush left
      },
      desktop: async (box) => {
        // Desktop: Full width, taller
        expect(box.width).toBeGreaterThanOrEqual(1920);
        expect(box.height).toBeGreaterThan(80);
        expect(box.x).toBe(0);
      },
    },
    {
      testName: 'header-layout',
      captureScreenshots: true,
    }
  );
});
```

---

## Baseline Management

### CLI Tool

The baseline manager CLI provides operations for managing screenshot baselines:

```bash
# List all baselines
npx tsx tests/e2e/helpers/baseline-manager.ts list

# List baselines for specific test
npx tsx tests/e2e/helpers/baseline-manager.ts list --filter=create-node

# Approve specific baseline (copy from current to baseline)
npx tsx tests/e2e/helpers/baseline-manager.ts approve create-node-01-dialog-open.png

# Update all baselines (DANGEROUS - use with caution!)
npx tsx tests/e2e/helpers/baseline-manager.ts update

# Update baselines for specific test
npx tsx tests/e2e/helpers/baseline-manager.ts update --filter=create-node

# Reset all baselines (delete all - DANGEROUS!)
npx tsx tests/e2e/helpers/baseline-manager.ts reset

# Reset baselines for specific test
npx tsx tests/e2e/helpers/baseline-manager.ts reset --filter=create-node

# Show baseline statistics
npx tsx tests/e2e/helpers/baseline-manager.ts stats
```

### Programmatic API

Use the baseline manager in your scripts:

```typescript
import { BaselineManager } from './helpers/baseline-manager';

const manager = new BaselineManager();

// List all baselines
const baselines = await manager.listBaselines();
console.log(`Found ${baselines.length} baselines`);

// List baselines for specific test
const nodeBaselines = await manager.listBaselines('create-node');

// Approve a specific baseline
await manager.approveBaseline('create-node-01-dialog-open.png');

// Update all baselines (with confirmation)
const updated = await manager.updateAllBaselines();
console.log(`Updated ${updated} baselines`);

// Update baselines for specific test
const nodeUpdated = await manager.updateAllBaselines('create-node');

// Reset baselines
const deleted = await manager.resetBaselines('old-test');

// Get statistics
const stats = await manager.getStats();
console.log(`Total: ${stats.totalBaselines}`);
console.log(`Size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`With diffs: ${stats.withDiffs}`);
```

### Custom Configuration

```typescript
import { BaselineManager } from './helpers/baseline-manager';

const manager = new BaselineManager({
  testResultsDir: 'test-results',
  baselineDir: 'test-results/.playwright-snapshots',
  diffDir: 'test-results/.playwright-snapshots-diff',
  currentDir: 'test-results/.current',
});
```

### Baseline Approval Workflow

**Recommended workflow for team collaboration**:

1. **Developer makes UI change**

   ```bash
   # Run tests (will fail with visual diff)
   npm run e2e
   ```

2. **Review visual diffs**

   ```bash
   # Open Playwright HTML reporter
   npx playwright show-report

   # Look at diff images in report
   # Compare expected vs actual screenshots
   ```

3. **Approve intentional changes**

   ```bash
   # List baselines with diffs
   npx tsx tests/e2e/helpers/baseline-manager.ts list

   # Approve specific changes
   npx tsx tests/e2e/helpers/baseline-manager.ts approve create-node-02-form-filled.png
   ```

4. **Commit updated baselines**
   ```bash
   git add test-results/.playwright-snapshots/
   git commit -m "chore: update visual regression baselines for new button style"
   ```

---

## API Reference

### Visual Regression Helpers

#### `captureBaseline()`

Capture a screenshot and compare to baseline.

```typescript
async function captureBaseline(
  page: Page,
  testName: string,
  step: string,
  config?: {
    threshold?: number;
    maxDiffPixels?: number;
    animations?: 'disabled' | 'allow';
  }
): Promise<void>;
```

**Parameters**:

- `page`: Playwright Page object
- `testName`: Name of the test (used in screenshot filename)
- `step`: Step identifier (e.g., '01-dialog-open')
- `config`: Optional configuration (defaults to standard 10% threshold)

**Example**:

```typescript
await captureBaseline(page, 'create-node', '01-dialog-open', { threshold: 0.05 });
```

#### `captureAccountBaseline()`

Capture screenshot with account context for multi-tenant tests.

```typescript
async function captureAccountBaseline(
  page: Page,
  testName: string,
  accountContext: 'account-a' | 'account-b' | 'admin',
  step: string
): Promise<void>;
```

**Parameters**:

- `page`: Playwright Page object
- `testName`: Name of the test
- `accountContext`: Account type for isolation testing
- `step`: Step identifier

**Example**:

```typescript
await captureAccountBaseline(page, 'ui-isolation', 'account-a', 'keimenon-view');
```

#### `captureWorkflowStage()`

Capture workflow stage screenshot with stage context.

```typescript
async function captureWorkflowStage(
  page: Page,
  workflowName: string,
  stage: 'initiation' | 'processing' | 'completion' | 'error' | 'cancellation' | 'paused',
  detail?: string
): Promise<void>;
```

**Parameters**:

- `page`: Playwright Page object
- `workflowName`: Name of the workflow
- `stage`: Workflow stage
- `detail`: Optional detail (e.g., 'before-start', 'mid-progress')

**Example**:

```typescript
await captureWorkflowStage(page, 'chat-import', 'processing', 'mid-progress');
```

---

### Multi-Viewport Helpers

#### `testMultiViewport()`

Run test function across multiple viewports.

```typescript
async function testMultiViewport(
  page: Page,
  viewports: ViewportName[] | keyof typeof VIEWPORT_TEST_SUITES,
  testFn: (viewportName: ViewportName, viewport: ViewportSize) => Promise<void>,
  options?: {
    testName?: string;
    captureScreenshots?: boolean;
    screenshotOptions?: ScreenshotOptions;
    transitionDelay?: number;
    verbose?: boolean;
  }
): Promise<void>;
```

**Parameters**:

- `page`: Playwright Page object
- `viewports`: Array of viewport names or test suite name ('smoke', 'standard', 'full')
- `testFn`: Test function to run for each viewport
- `options`: Optional configuration

**Example**:

```typescript
await testMultiViewport(
  page,
  ['mobile', 'desktop'],
  async (viewportName, viewport) => {
    await expect(page.getByRole('heading')).toBeVisible();
  },
  { testName: 'responsive-test', captureScreenshots: true }
);
```

#### `captureMultiViewport()`

Capture screenshots across multiple viewports (no test logic).

```typescript
async function captureMultiViewport(
  page: Page,
  testName: string,
  viewports: ViewportName[] | keyof typeof VIEWPORT_TEST_SUITES,
  options?: {
    threshold?: number;
    maxDiffPixels?: number;
    animations?: 'disabled' | 'allow';
    transitionDelay?: number;
    verbose?: boolean;
  }
): Promise<void>;
```

**Parameters**:

- `page`: Playwright Page object
- `testName`: Name for screenshot files
- `viewports`: Array of viewport names or test suite name
- `options`: Optional configuration

**Example**:

```typescript
await captureMultiViewport(page, 'dashboard', VIEWPORT_TEST_SUITES.standard, {
  threshold: 0.1,
  transitionDelay: 1000,
});
```

#### `verifyElementVisibility()`

Verify element visibility across viewports.

```typescript
async function verifyElementVisibility(
  page: Page,
  selector: string,
  expectedVisibility: Partial<Record<ViewportName, boolean>>,
  options?: {
    testName?: string;
    captureScreenshots?: boolean;
    verbose?: boolean;
  }
): Promise<void>;
```

**Parameters**:

- `page`: Playwright Page object
- `selector`: Element selector
- `expectedVisibility`: Object mapping viewport names to expected visibility
- `options`: Optional configuration

**Example**:

```typescript
await verifyElementVisibility(
  page,
  '[data-testid="mobile-menu"]',
  { mobile: true, tablet: false, desktop: false },
  { captureScreenshots: true }
);
```

#### `testElementLayout()`

Test element layout (bounding box) across viewports.

```typescript
async function testElementLayout(
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
): Promise<void>;
```

**Parameters**:

- `page`: Playwright Page object
- `selector`: Element selector
- `layoutTests`: Object mapping viewport names to layout test functions
- `options`: Optional configuration

**Example**:

```typescript
await testElementLayout(
  page,
  'header',
  {
    mobile: async (box) => expect(box.height).toBeLessThan(80),
    desktop: async (box) => expect(box.height).toBeGreaterThan(80),
  },
  { captureScreenshots: true }
);
```

---

### Viewport Configuration

#### `VIEWPORTS`

Object containing all viewport definitions.

```typescript
const VIEWPORTS: Record<ViewportName, ViewportSize>;
```

#### `VIEWPORT_TEST_SUITES`

Predefined viewport combinations.

```typescript
const VIEWPORT_TEST_SUITES: {
  smoke: ViewportName[];
  standard: ViewportName[];
  full: ViewportName[];
  touch: ViewportName[];
  desktopVariants: ViewportName[];
};
```

#### `getViewport()`

Get viewport configuration by name.

```typescript
function getViewport(name: ViewportName): ViewportSize;
```

#### `formatViewportName()`

Format viewport name for screenshot filenames.

```typescript
function formatViewportName(name: ViewportName): string;
// Returns: 'mobile-390x844'
```

#### `getBreakpoint()`

Get responsive breakpoint name for a given width.

```typescript
function getBreakpoint(width: number): string;
// Returns: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
```

---

### Baseline Manager

#### `BaselineManager`

Class for managing visual regression baselines.

```typescript
class BaselineManager {
  constructor(config?: Partial<BaselineConfig>);

  // List all baselines
  listBaselines(filter?: string): Promise<BaselineInfo[]>;

  // Approve a baseline
  approveBaseline(screenshotName: string, options?: ApproveOptions): Promise<void>;

  // Update all baselines (DANGEROUS)
  updateAllBaselines(filter?: string): Promise<number>;

  // Reset baselines (delete)
  resetBaselines(filter?: string): Promise<number>;

  // Compare screenshot to baseline
  compareToBaseline(
    screenshotName: string,
    currentScreenshotPath?: string
  ): Promise<ComparisonResult>;

  // Get statistics
  getStats(): Promise<BaselineStats>;
}
```

**Interfaces**:

```typescript
interface BaselineConfig {
  testResultsDir: string;
  baselineDir: string;
  diffDir: string;
  currentDir: string;
}

interface BaselineInfo {
  name: string;
  path: string;
  size: number;
  modifiedDate: Date;
  hasBaseline: boolean;
  hasDiff: boolean;
}

interface ComparisonResult {
  matched: boolean;
  similarity: number;
  diffPath?: string;
  mismatchedPixels?: number;
}

interface BaselineStats {
  totalBaselines: number;
  totalSize: number;
  withDiffs: number;
  oldestBaseline?: Date;
  newestBaseline?: Date;
}
```

---

## Best Practices

### 1. Screenshot Naming

✅ **DO**:

```typescript
// Clear, descriptive, numbered
await captureBaseline(page, 'create-node', '01-dialog-open');
await captureBaseline(page, 'create-node', '02-form-filled');
await captureBaseline(page, 'create-node', '03-success-toast');

// Include context when needed
await captureAccountBaseline(page, 'ui-isolation', 'account-a', 'keimenon-view');
await captureWorkflowStage(page, 'import', 'processing', 'mid-progress');
```

❌ **DON'T**:

```typescript
// Generic, unclear names
await expect(page).toHaveScreenshot('screenshot1.png');
await expect(page).toHaveScreenshot('test.png');
await expect(page).toHaveScreenshot('final.png');
```

### 2. Threshold Selection

✅ **DO**: Choose threshold based on content type

```typescript
// Security-critical: 5%
const STRICT = { threshold: 0.05, maxDiffPixels: 50 };

// Standard UI: 10%
const STANDARD = { threshold: 0.1, maxDiffPixels: 100 };

// Dynamic content: 15%
const DYNAMIC = { threshold: 0.15, maxDiffPixels: 200 };
```

❌ **DON'T**: Use same threshold for all tests

```typescript
// This will cause issues with dynamic content
const config = { threshold: 0.01 }; // Too strict!
```

### 3. Timing and Stability

✅ **DO**: Wait for stable state before screenshot

```typescript
// Wait for network idle
await page.waitForLoadState('networkidle');

// Wait for animations
await page.waitForTimeout(500);

// Wait for specific element
await page.waitForSelector('[data-testid="content-loaded"]');

// THEN capture
await captureBaseline(page, 'test', 'step');
```

❌ **DON'T**: Capture during transitions

```typescript
await page.click('button');
await captureBaseline(page, 'test', 'clicked'); // TOO FAST - still animating!
```

### 4. Responsive Testing Strategy

✅ **DO**: Choose appropriate test suite

```typescript
// Fast CI runs: smoke (mobile + desktop)
test.describe('@smoke Responsive', () => {
  test('critical flow', async ({ page }) => {
    await captureMultiViewport(page, 'flow', VIEWPORT_TEST_SUITES.smoke);
  });
});

// Comprehensive: standard (mobile + tablet + desktop)
test.describe('Full responsive', () => {
  test('dashboard', async ({ page }) => {
    await captureMultiViewport(page, 'dashboard', VIEWPORT_TEST_SUITES.standard);
  });
});
```

❌ **DON'T**: Test all viewports for every test

```typescript
// This is slow and expensive for CI
await captureMultiViewport(page, 'minor-component', VIEWPORT_TEST_SUITES.full);
```

### 5. Baseline Management

✅ **DO**: Approve baselines intentionally

```bash
# Review diffs first
npx playwright show-report

# Then approve specific changes
npx tsx baseline-manager.ts approve create-node-02-form-filled.png

# Commit with clear message
git commit -m "chore: update baseline for new button style"
```

❌ **DON'T**: Blindly approve all changes

```bash
# DANGEROUS - approves ALL changes without review
npx tsx baseline-manager.ts update
```

### 6. Multi-Tenant Testing

✅ **DO**: Use account-specific baselines

```typescript
// Separate baselines per account
await captureAccountBaseline(page, 'test', 'account-a', 'step');
await captureAccountBaseline(page, 'test', 'account-b', 'step');

// Use strict threshold
const config = { threshold: 0.05 }; // Security-critical
```

❌ **DON'T**: Mix account contexts

```typescript
// This won't catch isolation issues
await captureBaseline(page, 'test', 'step'); // No account context!
```

### 7. Workflow Testing

✅ **DO**: Capture all stages

```typescript
// Complete workflow coverage
await captureWorkflowStage(page, 'import', 'initiation', 'before-start');
await captureWorkflowStage(page, 'import', 'initiation', 'dialog-open');
await captureWorkflowStage(page, 'import', 'processing', 'progress-started');
await captureWorkflowStage(page, 'import', 'processing', 'mid-progress');
await captureWorkflowStage(page, 'import', 'completion', 'success');
```

❌ **DON'T**: Skip intermediate stages

```typescript
// Missing important states
await captureWorkflowStage(page, 'import', 'initiation');
await captureWorkflowStage(page, 'import', 'completion');
// What about processing errors? Cancellation?
```

---

## Troubleshooting

### Issue: Screenshot comparison fails with minor differences

**Symptoms**:

```
Screenshot comparison failed:
Expected: create-node-01-dialog-open.png
Actual: create-node-01-dialog-open-actual.png
Diff: create-node-01-dialog-open-diff.png
Pixels different: 42 (threshold: 0.1, max: 100)
```

**Solutions**:

1. **Increase threshold** (if changes are acceptable):

   ```typescript
   const config = { threshold: 0.15 }; // Allow 15% difference
   ```

2. **Wait longer for stability**:

   ```typescript
   await page.waitForTimeout(1000); // Wait for animations
   ```

3. **Disable animations**:

   ```typescript
   const config = { animations: 'disabled' as const };
   ```

4. **Approve new baseline** (if UI change is intentional):
   ```bash
   npx tsx baseline-manager.ts approve create-node-01-dialog-open.png
   ```

---

### Issue: Tests pass locally but fail in CI

**Symptoms**:

- Visual regression tests pass on developer machine
- Same tests fail in CI with significant pixel differences

**Possible Causes & Solutions**:

1. **Font rendering differences** (Windows vs Linux):

   ```typescript
   // Use higher threshold for CI
   const threshold = process.env.CI ? 0.15 : 0.1;
   const config = { threshold, maxDiffPixels: 150 };
   ```

2. **Viewport size inconsistency**:

   ```typescript
   // Explicitly set viewport before screenshot
   await page.setViewportSize({ width: 1920, height: 1080 });
   await page.waitForLoadState('networkidle');
   await captureBaseline(page, 'test', 'step');
   ```

3. **Missing baseline in git**:

   ```bash
   # Ensure baselines are committed
   git add test-results/.playwright-snapshots/
   git commit -m "chore: add visual regression baselines"
   ```

4. **Race conditions**:
   ```typescript
   // Wait for specific element, not just networkidle
   await page.waitForSelector('[data-testid="fully-loaded"]', {
     state: 'visible',
     timeout: 10000,
   });
   ```

---

### Issue: Too many baselines to manage

**Symptoms**:

- Hundreds of baseline screenshots
- Difficult to review changes
- Large git repository size

**Solutions**:

1. **Filter baselines by test**:

   ```bash
   # List baselines for specific feature
   npx tsx baseline-manager.ts list --filter=create-node

   # Update only those baselines
   npx tsx baseline-manager.ts update --filter=create-node
   ```

2. **Use smoke test suite for CI**:

   ```typescript
   // Only test critical viewports in CI
   if (process.env.CI) {
     await captureMultiViewport(page, 'test', VIEWPORT_TEST_SUITES.smoke);
   } else {
     await captureMultiViewport(page, 'test', VIEWPORT_TEST_SUITES.standard);
   }
   ```

3. **Delete obsolete baselines**:

   ```bash
   # Reset baselines for removed tests
   npx tsx baseline-manager.ts reset --filter=old-feature
   ```

4. **Compress baselines**:
   ```bash
   # Use Git LFS for large binary files
   git lfs track "test-results/.playwright-snapshots/*.png"
   ```

---

### Issue: Viewport-specific test failures

**Symptoms**:

- Test passes on desktop viewport
- Fails on mobile or tablet
- Element not visible or layout broken

**Solutions**:

1. **Check element visibility per viewport**:

   ```typescript
   await testMultiViewport(page, ['mobile', 'desktop'], async (viewportName) => {
     if (viewportName === 'mobile') {
       // Mobile: different element
       await expect(page.getByTestId('mobile-menu')).toBeVisible();
     } else {
       // Desktop: different element
       await expect(page.getByRole('navigation')).toBeVisible();
     }
   });
   ```

2. **Add transition delay**:

   ```typescript
   await captureMultiViewport(page, 'test', VIEWPORT_TEST_SUITES.standard, {
     transitionDelay: 1000, // Wait 1s after viewport change
   });
   ```

3. **Test responsive breakpoints**:

   ```typescript
   import { getBreakpoint } from './config/viewports';

   const viewport = VIEWPORTS.tablet;
   const breakpoint = getBreakpoint(viewport.width); // 'md'

   // Adjust expectations based on breakpoint
   if (breakpoint === 'md' || breakpoint === 'lg') {
     // Tablet/small desktop behavior
   }
   ```

---

### Issue: Baseline approval workflow confusion

**Symptoms**:

- Team members accidentally approve wrong baselines
- Unclear which baselines changed and why
- Merge conflicts in baseline screenshots

**Solutions**:

1. **Review before approving**:

   ```bash
   # Always review HTML report first
   npx playwright show-report

   # Check which baselines have diffs
   npx tsx baseline-manager.ts list
   ```

2. **Approve specific files only**:

   ```bash
   # DON'T: Update all baselines
   # npx tsx baseline-manager.ts update

   # DO: Approve specific changes
   npx tsx baseline-manager.ts approve create-node-02-form-filled.png
   npx tsx baseline-manager.ts approve create-node-03-success-toast.png
   ```

3. **Document baseline changes in commits**:

   ```bash
   git add test-results/.playwright-snapshots/create-node-*.png
   git commit -m "chore: update create-node baselines for new button style

   - Changed primary button color from blue to purple
   - Updated success toast styling
   - Affected steps: 02-form-filled, 03-success-toast"
   ```

4. **Use PR reviews**:
   - Require PR review for baseline changes
   - Attach before/after screenshots to PR description
   - Explain why visual changes are intentional

---

## Example Workflows

### Workflow 1: Adding Visual Regression to Existing Test

**Scenario**: You have a working test and want to add visual regression.

**Steps**:

1. **Add helper function**:

   ```typescript
   import { expect, Page } from '@playwright/test';

   const VISUAL_CONFIG = {
     threshold: 0.1,
     maxDiffPixels: 100,
     animations: 'disabled' as const,
   };

   async function captureBaseline(page: Page, testName: string, step: string): Promise<void> {
     const screenshotName = `${testName.replace(/\s+/g, '-')}-${step}.png`;
     await expect(page).toHaveScreenshot(screenshotName, VISUAL_CONFIG);
   }
   ```

2. **Add visual checkpoints to test**:

   ```typescript
   test('should create node', async ({ page }) => {
     await page.goto('/keimenon');
     await page.waitForLoadState('networkidle');

     // 📸 NEW: Visual checkpoint
     await captureBaseline(page, 'create-node', '00-initial-keimenon');

     await page.getByRole('button', { name: /create node/i }).click();

     // 📸 NEW: Visual checkpoint
     await captureBaseline(page, 'create-node', '01-dialog-open');

     await page.getByLabel('Title').fill('Test Node');
     await page.getByRole('button', { name: /create/i }).click();

     // 📸 NEW: Visual checkpoint
     await captureBaseline(page, 'create-node', '02-success');

     await expect(page.getByText('Test Node')).toBeVisible();
   });
   ```

3. **Run test to create baselines**:

   ```bash
   npm run e2e
   # First run will fail - baselines don't exist yet
   ```

4. **Review and approve baselines**:

   ```bash
   npx playwright show-report
   # Review all screenshots

   npx tsx baseline-manager.ts list --filter=create-node
   # See what was created

   npx tsx baseline-manager.ts update --filter=create-node
   # Approve all baselines for this test
   ```

5. **Run test again to verify**:

   ```bash
   npm run e2e
   # Should pass now with baseline comparison
   ```

6. **Commit baselines**:
   ```bash
   git add test-results/.playwright-snapshots/create-node-*.png
   git commit -m "feat: add visual regression to create-node test"
   ```

---

### Workflow 2: Making UI Changes with Visual Regression

**Scenario**: You need to update button styling and ensure tests pass.

**Steps**:

1. **Make UI changes**:

   ```css
   /* Change button color */
   .primary-button {
     background-color: purple; /* Changed from blue */
   }
   ```

2. **Run tests** (will fail):

   ```bash
   npm run e2e
   # Tests fail with visual differences
   ```

3. **Review visual diffs**:

   ```bash
   npx playwright show-report
   # Open HTML report
   # Click on failed test
   # View "Expected" vs "Actual" vs "Diff" screenshots
   ```

4. **Verify changes are intentional**:
   - Expected: Blue button
   - Actual: Purple button
   - Diff: Highlights button area in red
   - ✅ Change is intentional

5. **Approve updated baselines**:

   ```bash
   # List which baselines have diffs
   npx tsx baseline-manager.ts list

   # Approve affected baselines
   npx tsx baseline-manager.ts approve create-node-02-form-filled.png
   npx tsx baseline-manager.ts approve edit-node-01-dialog-open.png
   npx tsx baseline-manager.ts approve settings-03-save-button.png
   ```

6. **Run tests again** (should pass):

   ```bash
   npm run e2e
   # All tests pass with new baselines
   ```

7. **Commit changes**:

   ```bash
   git add src/styles/buttons.css
   git add test-results/.playwright-snapshots/*.png
   git commit -m "feat: update primary button color to purple

   - Changed all primary buttons from blue to purple
   - Updated visual regression baselines for affected tests
   - Affected tests: create-node, edit-node, settings"
   ```

---

### Workflow 3: Adding Responsive Testing

**Scenario**: You want to ensure a page works on mobile, tablet, and desktop.

**Steps**:

1. **Create test with multi-viewport helper**:

   ```typescript
   import { test } from '@playwright/test';
   import { captureMultiViewport } from './helpers/multi-viewport';
   import { VIEWPORT_TEST_SUITES } from './config/viewports';

   test('should display dashboard responsively', async ({ page }) => {
     await page.goto('/dashboard');
     await page.waitForLoadState('networkidle');

     // Test across mobile, tablet, desktop
     await captureMultiViewport(page, 'dashboard-responsive', VIEWPORT_TEST_SUITES.standard, {
       threshold: 0.1,
       transitionDelay: 1000,
       verbose: true,
     });
   });
   ```

2. **Run test to create baselines**:

   ```bash
   npm run e2e
   # Creates 3 baselines:
   # - dashboard-responsive-mobile-390x844.png
   # - dashboard-responsive-tablet-768x1024.png
   # - dashboard-responsive-desktop-1920x1080.png
   ```

3. **Review baselines**:

   ```bash
   npx playwright show-report
   # Review all 3 viewport screenshots
   # Ensure layouts are correct
   ```

4. **Approve baselines**:

   ```bash
   npx tsx baseline-manager.ts update --filter=dashboard-responsive
   ```

5. **Add viewport-specific assertions** (optional):

   ```typescript
   import { testMultiViewport } from './helpers/multi-viewport';

   test('should show/hide mobile menu', async ({ page }) => {
     await page.goto('/dashboard');

     await testMultiViewport(
       page,
       VIEWPORT_TEST_SUITES.standard,
       async (viewportName) => {
         if (viewportName === 'mobile') {
           await expect(page.getByTestId('mobile-menu-button')).toBeVisible();
         } else {
           await expect(page.getByTestId('mobile-menu-button')).not.toBeVisible();
           await expect(page.getByRole('navigation')).toBeVisible();
         }
       },
       { testName: 'mobile-menu', captureScreenshots: true }
     );
   });
   ```

---

### Workflow 4: Debugging Flaky Visual Tests

**Scenario**: Visual tests pass sometimes, fail other times.

**Steps**:

1. **Identify flakiness pattern**:

   ```bash
   # Run test multiple times
   for i in {1..10}; do npm run e2e; done
   # Fails randomly
   ```

2. **Add verbose logging**:

   ```typescript
   test('flaky test', async ({ page }) => {
     console.log('1. Navigating to page...');
     await page.goto('/dashboard');

     console.log('2. Waiting for network idle...');
     await page.waitForLoadState('networkidle');

     console.log('3. Waiting extra time...');
     await page.waitForTimeout(2000); // Increase wait time

     console.log('4. Capturing screenshot...');
     await captureBaseline(page, 'test', 'step');
   });
   ```

3. **Check for race conditions**:

   ```typescript
   // BAD: Generic wait
   await page.waitForTimeout(500);

   // GOOD: Wait for specific element
   await page.waitForSelector('[data-testid="content-loaded"]', {
     state: 'visible',
     timeout: 10000,
   });
   ```

4. **Disable animations globally**:

   ```typescript
   // In test setup
   test.beforeEach(async ({ page }) => {
     // Disable CSS animations
     await page.addStyleTag({
       content: `
         *, *::before, *::after {
           animation-duration: 0s !important;
           transition-duration: 0s !important;
         }
       `,
     });
   });
   ```

5. **Increase threshold temporarily**:

   ```typescript
   // Temporarily increase threshold to see if flakiness goes away
   const config = { threshold: 0.2 }; // 20% tolerance
   await captureBaseline(page, 'test', 'step', config);
   ```

6. **Use visual stability metric**:

   ```typescript
   // Run test 10 times and check visual consistency
   test('visual stability check', async ({ page }) => {
     const screenshots: Buffer[] = [];

     for (let i = 0; i < 10; i++) {
       await page.goto('/dashboard');
       await page.waitForLoadState('networkidle');
       await page.waitForTimeout(1000);

       const screenshot = await page.screenshot();
       screenshots.push(screenshot);
     }

     // Compare all screenshots for similarity
     // If similarity < 95%, the test is flaky
   });
   ```

---

### Workflow 5: CI/CD Integration

**Scenario**: Set up visual regression testing in CI pipeline.

**Steps**:

1. **Create GitHub Actions workflow**:

   ```yaml
   # .github/workflows/visual-regression.yml
   name: Visual Regression Tests

   on:
     pull_request:
       branches: [main]

   jobs:
     visual-tests:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3

         - name: Setup Node.js
           uses: actions/setup-node@v3
           with:
             node-version: '18'

         - name: Install dependencies
           run: npm ci

         - name: Install Playwright browsers
           run: npx playwright install --with-deps chromium

         - name: Run visual regression tests
           run: npm run e2e:visual

         - name: Upload test results
           if: failure()
           uses: actions/upload-artifact@v3
           with:
             name: visual-test-results
             path: test-results/

         - name: Upload HTML report
           if: failure()
           uses: actions/upload-artifact@v3
           with:
             name: playwright-report
             path: playwright-report/
   ```

2. **Add npm script**:

   ```json
   {
     "scripts": {
       "e2e:visual": "playwright test --grep @visual",
       "e2e:visual:update": "playwright test --grep @visual --update-snapshots"
     }
   }
   ```

3. **Tag visual tests**:

   ```typescript
   test.describe('@visual Dashboard', () => {
     test('should display correctly', async ({ page }) => {
       await captureBaseline(page, 'dashboard', 'loaded');
     });
   });
   ```

4. **Handle baseline updates in CI**:

   ```bash
   # When UI changes are intentional, update baselines locally
   npm run e2e:visual:update

   # Commit updated baselines
   git add test-results/.playwright-snapshots/
   git commit -m "chore: update visual regression baselines"
   git push

   # CI will pass with new baselines
   ```

5. **Add PR comment with visual diffs** (optional):
   ```yaml
   # In GitHub Actions workflow
   - name: Comment PR with visual diffs
     if: failure()
     uses: actions/github-script@v6
     with:
       script: |
         github.rest.issues.createComment({
           issue_number: context.issue.number,
           owner: context.repo.owner,
           repo: context.repo.repo,
           body: '⚠️ Visual regression tests failed. [View report](${{ steps.upload.outputs.artifact-url }})'
         })
   ```

---

## Additional Resources

### Documentation

- [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots)
- [Playwright Screenshots](https://playwright.dev/docs/screenshots)
- [Anthropic Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)

### Internal Docs

- [AUTONOMOUS_TESTING_IMPLEMENTATION.md](AUTONOMOUS_TESTING_IMPLEMENTATION.md) - Complete implementation status
- [VISUAL_FEEDBACK_INTEGRATION.md](VISUAL_FEEDBACK_INTEGRATION.md) - Integration analysis and results
- [MCP_SETUP_GUIDE.md](MCP_SETUP_GUIDE.md) - MCP server setup

### Code References

- [tests/e2e/helpers/baseline-manager.ts](tests/e2e/helpers/baseline-manager.ts) - Baseline management
- [tests/e2e/helpers/multi-viewport.ts](tests/e2e/helpers/multi-viewport.ts) - Multi-viewport utilities
- [tests/e2e/config/viewports.ts](tests/e2e/config/viewports.ts) - Viewport definitions
- [tests/e2e/templates/](tests/e2e/templates/) - Test templates with examples

---

**Version**: 1.0.0
**Last Updated**: 2025-11-01
**Maintained By**: Keimenon Team
**Feedback**: Please report issues or suggestions to the team
