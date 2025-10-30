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
  const templateDb = path.join(process.cwd(), '.data/canvas-memory.db');

  // Fallback to user home directory if not found in .data
  const fallbackTemplateDb = path.join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.canvas-memory/canvas.db'
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

export const test = base.extend<TestIsolationFixtures, TestIsolationWorkerFixtures>({
  // Worker-scoped: Provide database path for this worker
  dbPath: [
    async ({}, use, workerInfo) => {
      const dbDir = path.join(process.cwd(), '.test-dbs');

      // Create .test-dbs directory if it doesn't exist
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      const dbPath = path.join(dbDir, `worker-${workerInfo.workerIndex}.db`);

      console.log(`[Worker ${workerInfo.workerIndex}] Using isolated DB: ${dbPath}`);

      // Initialize worker-specific database
      await initializeWorkerDb(workerInfo.workerIndex, dbPath);

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
  page: async ({ page, dbPath }, use) => {
    // Set DB path header for all requests from this page
    await page.setExtraHTTPHeaders({
      'X-Test-DB-Path': dbPath,
    });

    console.log(`[Test Isolation] Page configured with DB: ${path.basename(dbPath)}`);

    await use(page);
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
