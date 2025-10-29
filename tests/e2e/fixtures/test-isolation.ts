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
 * - Isolated test data - no cross-worker interference
 * - Automatic cleanup after tests complete
 *
 * Usage:
 *   import { test } from './fixtures/test-isolation';
 *
 *   test('my test', async ({ page, workerInfo }) => {
 *     // This test uses worker-{workerInfo.workerIndex}.db
 *     // No conflicts with other workers
 *   });
 */

interface TestIsolationFixtures {
  workerStorageState: string;
  dbPath: string;
}

export const test = base.extend<TestIsolationFixtures>({
  // Provide database path for this worker
  dbPath: async ({ workerInfo }, use) => {
    const dbDir = path.join(process.cwd(), '.test-dbs');

    // Create .test-dbs directory if it doesn't exist
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, `worker-${workerInfo.workerIndex}.db`);

    console.log(`[Worker ${workerInfo.workerIndex}] Using isolated DB: ${dbPath}`);

    // Initialize DB for this worker (copy from template if available)
    const templateDb = path.join(process.cwd(), 'packages/db/data/canvas-memory.db');
    if (fs.existsSync(templateDb) && !fs.existsSync(dbPath)) {
      console.log(`[Worker ${workerInfo.workerIndex}] Copying template DB...`);
      fs.copyFileSync(templateDb, dbPath);
    } else if (!fs.existsSync(dbPath)) {
      console.log(`[Worker ${workerInfo.workerIndex}] Creating new DB...`);
      // DB will be created by API on first request
    }

    // Provide DB path to tests
    await use(dbPath);

    // Cleanup after all tests in this worker complete
    // (Optional - comment out to keep DBs for debugging)
    // if (fs.existsSync(dbPath)) {
    //   console.log(`[Worker ${workerInfo.workerIndex}] Cleaning up DB...`);
    //   fs.unlinkSync(dbPath);
    // }
  },

  // Provide separate storage state per worker (for auth tokens, etc.)
  workerStorageState: async ({ workerInfo }, use) => {
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
