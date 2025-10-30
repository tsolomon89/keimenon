/**
 * Database Client Helper
 *
 * Provides per-request database client selection for E2E test isolation.
 *
 * How it works:
 * 1. In test mode with X-Test-DB-Path header → uses worker-specific DB
 * 2. Otherwise → uses global dbClient singleton
 *
 * This enables parallel E2E tests to use isolated databases without conflicts.
 *
 * Usage in routes:
 * ```typescript
 * import { getDbClient } from '../utils/get-db-client';
 *
 * router.get('/api/v1/nodes', async (req, res) => {
 *   const dbClient = await getDbClient(req);
 *   const nodes = await dbClient.execute('SELECT * FROM nodes');
 *   res.json(nodes);
 * });
 * ```
 */

import { Request } from 'express';
import path from 'path';

/**
 * Get database client for current request context
 *
 * @param req Express request object (optional)
 * @returns Database client (global or worker-specific)
 */
export async function getDbClient(req?: Request): Promise<any> {
  // When test DB path is present (from E2E tests), use worker-specific database
  if (req?.testDbPath) {
    console.log(`[Get DB Client] Creating test-specific client:`);
    console.log(`  - Worker DB: ${path.basename(req.testDbPath)}`);
    console.log(`  - Full path: ${req.testDbPath}`);

    try {
      // Import DatabaseFactory here to avoid circular dependencies
      const { DatabaseFactory } = await import('@canvas-memory/db');

      // Create a new client instance for this worker's database
      const client = await DatabaseFactory.getClient({
        mode: 'local',
        local: {
          databasePath: req.testDbPath,
          verbose: false,
        },
      });

      console.log(`[Get DB Client] ✅ Test client created successfully`);
      return client;
    } catch (error) {
      console.log(`[Get DB Client] ❌ Failed to create test client:`);
      console.log(`  - Error: ${error}`);
      throw error;
    }
  }

  // Otherwise, use the global client
  if (!global.dbClient) {
    throw new Error('Global database client not initialized');
  }

  return global.dbClient;
}

/**
 * Check if request should use test isolation
 *
 * @param req Express request object
 * @returns true if using test DB, false otherwise
 */
export function isTestIsolationActive(req: Request): boolean {
  return !!req.testDbPath;
}
