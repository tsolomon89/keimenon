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
 * Cache of worker-specific database clients by path
 * Key: absolute database path
 * Value: SQLiteClient instance
 */
const testClientCache = new Map<string, any>();

/**
 * Get database client for current request context
 *
 * @param req Express request object (optional)
 * @returns Database client (global or worker-specific)
 */
export async function getDbClient(req?: Request): Promise<any> {
  // When test DB path is present (from E2E tests), use worker-specific database
  if (req?.testDbPath) {
    // Check cache first to ensure same client instance is used across requests
    if (testClientCache.has(req.testDbPath)) {
      const cachedClient = testClientCache.get(req.testDbPath);
      console.log(`[Get DB Client] Using cached test client for ${path.basename(req.testDbPath)}`);
      return cachedClient;
    }

    console.log(`[Get DB Client] Creating test-specific client:`);
    console.log(`  - Worker DB: ${path.basename(req.testDbPath)}`);
    console.log(`  - Full path: ${req.testDbPath}`);

    try {
      // Import SQLiteClient directly to bypass DatabaseFactory's singleton
      const { SQLiteClient } = await import('@canvas-memory/db');

      // Create a new client instance for this worker's database (bypasses singleton)
      const client = new SQLiteClient({
        databasePath: req.testDbPath,
        verbose: false,
      });

      // Connect to the database
      await client.connect();

      // Enable direct writes for test clients (E2E tests need to create test data)
      client.enableDirectWrites();

      // Cache the client for this database path
      testClientCache.set(req.testDbPath, client);

      console.log(`[Get DB Client] ✅ Test client created and cached successfully`);
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

/**
 * Close and remove cached database connection for a specific test DB path
 *
 * CRITICAL FIX #8: This function releases Windows file locks by closing
 * the database connection before snapshot restoration attempts file deletion.
 *
 * @param testDbPath Absolute path to worker database file
 * @returns true if connection was closed, false if not found in cache
 */
export async function closeDbConnection(testDbPath: string): Promise<boolean> {
  if (!testClientCache.has(testDbPath)) {
    console.log(`[Get DB Client] No cached connection for ${path.basename(testDbPath)}`);
    return false;
  }

  try {
    const client = testClientCache.get(testDbPath);

    // Close the database connection (releases file lock)
    if (client && typeof client.close === 'function') {
      await client.close();
      console.log(`[Get DB Client] ✅ Closed connection for ${path.basename(testDbPath)}`);
    }

    // Remove from cache
    testClientCache.delete(testDbPath);
    console.log(`[Get DB Client] ✅ Removed from cache: ${path.basename(testDbPath)}`);

    return true;
  } catch (error) {
    console.error(`[Get DB Client] ❌ Error closing connection:`, error);
    // Still remove from cache even if close failed
    testClientCache.delete(testDbPath);
    return false;
  }
}
