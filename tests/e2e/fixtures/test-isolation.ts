import { test as base } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Test Isolation Fixtures
 *
 * Provides separate SQLite database per worker to eliminate resource contention
 * and resolve parallel execution failures.
 *
 * Features:
 * - Unique DB file per worker (worker-0.db, worker-1.db, etc.)
 * - Automatic DB initialization from template
 * - Automatic X-Test-DB-Path header injection for all requests
 * - Worker-specific test users (worker0_admin@admin.com, etc.)
 * - Isolated test data - no cross-worker interference
 * - Optional cleanup after tests complete
 *
 * Usage:
 *   import { test } from './fixtures/test-isolation';
 *
 *   test('my test', async ({ page, workerInfo }) => {
 *     // Automatically uses worker-{workerInfo.workerIndex}.db
 *     // All API requests include X-Test-DB-Path header
 *     // No conflicts with other workers
 *   });
 */

// Test-scoped fixtures (per test)
interface TestIsolationFixtures {
  // page fixture will be extended to auto-inject headers
  apiRequest: any; // Playwright APIRequestContext for API calls
}

// Worker-scoped fixtures (per worker)
interface TestIsolationWorkerFixtures {
  workerStorageState: string;
  dbPath: string;
}

/**
 * Initialize worker-specific database
 * Copies template DB and updates test user to be worker-specific
 */
async function initializeWorkerDb(workerIndex: number, dbPath: string): Promise<void> {
  // Use the main database (which has test user from global setup) as template
  const templateDb = path.join(process.cwd(), '.data/canvas.db');

  // Fallback to user home directory if not found in .data
  const fallbackTemplateDb = path.join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.keimenon/canvas.db'
  );

  // Copy template if DB doesn't exist
  if (!fs.existsSync(dbPath)) {
    let sourceDb = templateDb;

    // Check if template exists, otherwise use fallback
    if (!fs.existsSync(templateDb) && fs.existsSync(fallbackTemplateDb)) {
      sourceDb = fallbackTemplateDb;
    }

    if (fs.existsSync(sourceDb)) {
      console.log(
        `[Worker ${workerIndex}] Copying main DB from ${path.basename(path.dirname(sourceDb))}...`
      );
      fs.copyFileSync(sourceDb, dbPath);
    } else {
      console.warn(
        `[Worker ${workerIndex}] Main DB not found at ${templateDb} or ${fallbackTemplateDb}. DB will be created on first API request.`
      );
      return; // API will create DB on first request
    }
  }

  // No need to modify user emails - each worker has isolated DB
  // Tests can use standard credentials (admin@admin.com)
  console.log(`[Worker ${workerIndex}] Worker DB initialized with standard test user`);

  // Future: could add worker-specific data initialization here if needed
}

/**
 * Create a wrapped API request context that automatically merges the X-Test-DB-Path header
 * with all request-specific headers.
 *
 * PROBLEM: Playwright's extraHTTPHeaders are NOT automatically merged when you specify
 * headers in individual requests. When you call apiRequest.post('/path', { headers: {...} }),
 * the request-specific headers OVERRIDE extraHTTPHeaders instead of merging them.
 *
 * SOLUTION: Wrap the APIRequestContext to automatically merge the X-Test-DB-Path header
 * with any request-specific headers for all HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD).
 *
 * This ensures test isolation works correctly even when tests specify their own headers
 * (like Authorization headers for authenticated requests).
 */
function createWrappedApiContext(rawContext: any, dbPath: string) {
  /**
   * Merge X-Test-DB-Path header with request-specific headers
   * The dbPath header is added FIRST so request headers can override if needed
   */
  const mergeHeaders = (requestOptions: any = {}) => {
    const merged = { ...requestOptions };
    merged.headers = {
      'X-Test-DB-Path': dbPath, // Always include the test DB path header
      ...(requestOptions.headers || {}), // Merge with request-specific headers (e.g., Authorization)
    };
    return merged;
  };

  // Create a wrapper object that proxies all HTTP methods and merges headers automatically
  return {
    // Proxy all standard HTTP methods to merge headers
    get: (url: string, options?: any) => rawContext.get(url, mergeHeaders(options)),
    post: (url: string, options?: any) => rawContext.post(url, mergeHeaders(options)),
    put: (url: string, options?: any) => rawContext.put(url, mergeHeaders(options)),
    patch: (url: string, options?: any) => rawContext.patch(url, mergeHeaders(options)),
    delete: (url: string, options?: any) => rawContext.delete(url, mergeHeaders(options)),
    head: (url: string, options?: any) => rawContext.head(url, mergeHeaders(options)),

    // Proxy fetch() method (used for custom HTTP methods)
    fetch: (urlOrRequest: string | any, options?: any) =>
      rawContext.fetch(urlOrRequest, mergeHeaders(options)),

    // Proxy utility methods without modification
    dispose: () => rawContext.dispose(),
    storageState: (options?: any) => rawContext.storageState(options),

    // Expose the raw context for advanced use cases (if needed)
    _rawContext: rawContext,
    _dbPath: dbPath, // Expose dbPath for debugging
  };
}

export const test = base.extend<TestIsolationFixtures, TestIsolationWorkerFixtures>({
  // Test-scoped: Provide API request context with correct baseURL
  // NEW: Wrap each test in savepoint for atomic cleanup (same as page fixture)
  // NEW: Automatically merge X-Test-DB-Path header with all requests
  apiRequest: async ({ playwright, dbPath }, use, testInfo) => {
    const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4001';

    // Create raw API context (without X-Test-DB-Path in extraHTTPHeaders)
    // We'll add X-Test-DB-Path via the wrapper instead
    const rawApiContext = await playwright.request.newContext({
      baseURL: API_BASE_URL,
      extraHTTPHeaders: {
        'x-test-source': 'playwright-e2e',
        // NOTE: Don't set Content-Type here - let Playwright set it based on request type
        // (application/json for data:, multipart/form-data for multipart:, etc.)
        Accept: 'application/json',
      },
    });

    // Wrap the raw context to automatically merge X-Test-DB-Path header
    const apiContext = createWrappedApiContext(rawApiContext, dbPath);

    console.log(`[Test Isolation] API Request context created with baseURL: ${API_BASE_URL}`);
    console.log(`[Test Isolation] Auto-injecting X-Test-DB-Path: ${dbPath}`);

    // Generate unique savepoint ID for this test
    const testId = `test_${testInfo.testId.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;

    try {
      // BEGIN SAVEPOINT before test
      // NOTE: No need to manually add X-Test-DB-Path header - wrapper handles it automatically
      const beginResponse = await apiContext.post(`${API_BASE_URL}/api/v1/test/savepoint`, {
        data: { action: 'begin', savepointId: testId },
      });

      if (!beginResponse.ok()) {
        console.warn(`[Test Isolation] ⚠️ Failed to begin savepoint: ${beginResponse.status()}`);
        // Continue anyway - test will run without savepoint protection
      } else {
        console.log(`[Test Isolation] ✅ Savepoint created: ${testId}`);
      }

      // Run the test with the wrapped context
      await use(apiContext);
    } finally {
      // ROLLBACK TO SAVEPOINT after test (even if test failed)
      try {
        // NOTE: No need to manually add X-Test-DB-Path header - wrapper handles it automatically
        const rollbackResponse = await apiContext.post(`${API_BASE_URL}/api/v1/test/savepoint`, {
          data: { action: 'rollback', savepointId: testId },
        });

        if (!rollbackResponse.ok()) {
          console.warn(
            `[Test Isolation] ⚠️ Failed to rollback savepoint: ${rollbackResponse.status()}`
          );
        } else {
          console.log(`[Test Isolation] ✅ Rolled back savepoint: ${testId}`);
        }
      } catch (error) {
        console.warn(`[Test Isolation] ⚠️ Savepoint rollback error:`, error);
        // Don't fail the test if cleanup fails
      }

      // Cleanup - dispose the raw context
      await rawApiContext.dispose();
    }
  },

  // Worker-scoped: Provide database path for this worker
  // NEW: Restore from pristine snapshot instead of copying main DB
  dbPath: [
    async ({}, use, workerInfo) => {
      const { DatabaseSnapshotManager } = await import('./database-snapshots');
      const snapshotManager = new DatabaseSnapshotManager();
      const path = await import('path');

      // Calculate worker DB path before restoration
      const testDbsDir = path.resolve(process.cwd(), '.test-dbs');
      const workerDbPath = path.join(testDbsDir, `worker-${workerInfo.workerIndex}.db`);

      // CRITICAL FIX #8: Close cached API database connection before restoring snapshot
      // This releases Windows file locks that prevent file deletion
      try {
        const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4001';
        const closeResponse = await fetch(`${API_BASE_URL}/api/v1/test/close-connection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ testDbPath: workerDbPath }),
        });

        if (closeResponse.ok) {
          const result = await closeResponse.json();
          console.log(
            `[Worker ${workerInfo.workerIndex}] ✅ Closed cached connection: ${result.message || 'success'}`
          );
        } else {
          // Not an error - connection might not be cached yet
          console.log(
            `[Worker ${workerInfo.workerIndex}] No cached connection to close (first run)`
          );
        }
      } catch (error) {
        // Don't fail if API not available yet
        console.log(
          `[Worker ${workerInfo.workerIndex}] Could not close connection (API not ready):`,
          error
        );
      }

      // Restore pristine snapshot to worker DB
      const dbPath = await snapshotManager.restoreToWorker(workerInfo.workerIndex);

      console.log(`[Worker ${workerInfo.workerIndex}] Restored from snapshot: ${dbPath}`);

      // Provide DB path to tests
      await use(dbPath);

      // Cleanup after all tests in this worker complete
      // (Optional - comment out to keep DBs for debugging)
      // if (fs.existsSync(dbPath)) {
      //   console.log(`[Worker ${workerInfo.workerIndex}] Cleaning up DB...`);
      //   fs.unlinkSync(dbPath);
      // }
    },
    { scope: 'worker' },
  ],

  // Test-scoped: Automatically inject X-Test-DB-Path header for all page requests
  // NEW: Wrap each test in savepoint for atomic cleanup
  // NEW: Clear browser state before and after each test for visual stability
  page: async ({ page, context, dbPath }, use, testInfo) => {
    const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4001';

    // CRITICAL: Clear browser state BEFORE test to ensure clean slate
    // This prevents state pollution from previous tests (auth tokens, cached data, etc.)
    await context.clearCookies();

    // Only attempt to clear storage if page is at a valid URL (not about:blank)
    // This prevents SecurityError warnings when page hasn't navigated yet
    const currentUrl = page?.url() || 'about:blank';
    if (currentUrl && currentUrl !== 'about:blank' && !currentUrl.startsWith('chrome-error://')) {
      try {
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
        console.log(
          `[Test Isolation] ✅ Browser state cleared (cookies, localStorage, sessionStorage)`
        );
      } catch (error: any) {
        // Ignore - page might have navigated away during cleanup
      }
    }

    // Set DB path header for all requests from this page
    await page.setExtraHTTPHeaders({
      'X-Test-DB-Path': dbPath,
    });

    // CRITICAL FIX #4: Inject test DB path into window so frontend JavaScript can access it
    // This is needed because setExtraHTTPHeaders() only affects page navigation,
    // NOT fetch() or XMLHttpRequest() calls made by the frontend code
    await page.addInitScript((testDbPath: string) => {
      // @ts-ignore - window object extension for test mode
      window.__TEST_DB_PATH__ = testDbPath;
    }, dbPath);

    console.log(`[Test Isolation] Page configured with DB: ${path.basename(dbPath)}`);

    // Generate unique savepoint ID for this test
    const testId = `test_${testInfo.testId.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;

    try {
      // BEGIN SAVEPOINT before test
      const beginResponse = await page.request.post(`${API_BASE_URL}/api/v1/test/savepoint`, {
        headers: { 'X-Test-DB-Path': dbPath },
        data: { action: 'begin', savepointId: testId },
      });

      if (!beginResponse.ok()) {
        console.warn(`[Test Isolation] ⚠️ Failed to begin savepoint: ${beginResponse.status()}`);
        // Continue anyway - test will run without savepoint protection
      } else {
        console.log(`[Test Isolation] ✅ Savepoint created: ${testId}`);
      }

      // Run the test
      await use(page);
    } finally {
      // FIX #1: Clear browser storage FIRST while page is still accessible
      // This prevents "Access is denied" errors from occurring after page navigation
      try {
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
        await context.clearCookies();
        console.log(`[Test Isolation] ✅ Browser state cleared after test`);
      } catch (error) {
        console.warn(`[Test Isolation] ⚠️ Post-test browser cleanup error:`, error);
        // Don't fail if cleanup fails
      }

      // ROLLBACK TO SAVEPOINT after test (even if test failed)
      // This undoes all database changes made during the test
      try {
        const rollbackResponse = await page.request.post(`${API_BASE_URL}/api/v1/test/savepoint`, {
          headers: { 'X-Test-DB-Path': dbPath },
          data: { action: 'rollback', savepointId: testId },
        });

        if (!rollbackResponse.ok()) {
          console.warn(
            `[Test Isolation] ⚠️ Failed to rollback savepoint: ${rollbackResponse.status()}`
          );
        } else {
          console.log(`[Test Isolation] ✅ Rolled back savepoint: ${testId}`);
        }
      } catch (error) {
        console.warn(`[Test Isolation] ⚠️ Savepoint rollback error:`, error);
        // Don't fail the test if cleanup fails
      }
    }
  },

  // Worker-scoped: Provide separate storage state per worker (for auth tokens, etc.)
  workerStorageState: [
    async ({}, use, workerInfo) => {
      const storageDir = path.join(process.cwd(), '.test-storage');

      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }

      const storagePath = path.join(storageDir, `worker-${workerInfo.workerIndex}.json`);

      await use(storagePath);

      // Cleanup storage state
      // if (fs.existsSync(storagePath)) {
      //   fs.unlinkSync(storagePath);
      // }
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';

/**
 * Environment variable setup for test isolation
 *
 * To use isolated DBs, the API server needs to know which DB to use.
 *
 * Option 1: Environment variable per worker (requires custom API logic)
 * Option 2: Separate API instances per worker (complex)
 * Option 3: API accepts DB path as header (recommended)
 *
 * Recommended approach:
 * 1. Add middleware to API that checks for X-Test-DB-Path header
 * 2. If present and in test mode, use that DB instead of default
 * 3. Tests can then pass worker-specific DB path via header
 *
 * Example middleware (apps/api/src/middleware/test-isolation.middleware.ts):
 *
 * ```typescript
 * export function testIsolationMiddleware(req, res, next) {
 *   if (process.env.NODE_ENV === 'test' && req.headers['x-test-db-path']) {
 *     req.dbPath = req.headers['x-test-db-path'];
 *   }
 *   next();
 * }
 * ```
 *
 * Example test usage:
 *
 * ```typescript
 * test('my test', async ({ page, dbPath }) => {
 *   // Set DB path header for all API requests
 *   await page.setExtraHTTPHeaders({
 *     'X-Test-DB-Path': dbPath
 *   });
 *
 *   // Now all API calls use this worker's isolated DB
 *   await page.goto('/login');
 * });
 * ```
 */
