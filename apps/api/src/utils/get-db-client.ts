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
 * Cache of pending connection promises by path
 * Key: absolute database path
 * Value: Promise<SQLiteClient>
 *
 * CRITICAL FIX: This prevents race conditions where multiple concurrent requests
 * try to create database connections for the same worker database.
 * All concurrent requests wait for the same connection promise.
 */
const connectionPromises = new Map<string, Promise<any>>();

/**
 * Get database client for current request context
 *
 * @param req Express request object (optional)
 * @returns Database client (global or worker-specific)
 */
export async function getDbClient(req?: Request): Promise<any> {
  // Legacy/integration-test compatibility: allow request-scoped DB client injection.
  // Some route tests provide (req as any).db directly instead of global.dbClient.
  const requestDb = (req as any)?.db;
  if (requestDb) {
    return requestDb;
  }

  // When test DB path is present (from E2E tests), use worker-specific database
  if (req?.testDbPath) {
    // Capture testDbPath in a const to help TypeScript understand it's non-undefined
    const testDbPath: string = req.testDbPath;

    // Check cache first to ensure same client instance is used across requests
    if (testClientCache.has(testDbPath)) {
      return testClientCache.get(testDbPath);
    }

    // Check if connection is already in progress for this path
    if (connectionPromises.has(testDbPath)) {
      return await connectionPromises.get(testDbPath);
    }

    // Create connection promise and cache it immediately
    const connectionPromise = (async () => {
      try {
        // Import SQLiteClient directly to bypass DatabaseFactory's singleton
        const { SQLiteClient } = await import('@keimenon/db');

        // Create a new client instance for this worker's database (bypasses singleton)
        const client = new SQLiteClient({
          databasePath: testDbPath,
          verbose: false,
          ignoreGlobalContext: true,
        });

        // Connect to the database
        await client.connect();

        // Enable direct writes for test clients (E2E tests need to create test data)
        client.enableDirectWrites();

        // Cache the client for this database path
        testClientCache.set(testDbPath, client);
        return client;
      } catch (error: any) {
        // Remove failed promise from cache so next request can retry
        connectionPromises.delete(testDbPath);
        console.error(`[get-db-client] Failed to create test database client: ${error.message}`);
        throw error;
      } finally {
        // Remove connection promise after it resolves (success or failure)
        // The client cache will be used for subsequent requests
        connectionPromises.delete(testDbPath);
      }
    })();

    // Cache the promise immediately to prevent concurrent connection attempts
    connectionPromises.set(testDbPath, connectionPromise);

    return await connectionPromise;
  }

  // Otherwise, use the global client
  if (!global.dbClient) {
    throw new Error('Global database client not initialized');
  }

  return global.dbClient;
}

/**
 * Get jobs database client (separate database file in test mode)
 *
 * Test suites may use a separate jobs database so job polling is not coupled to
 * route-level SAVEPOINT isolation in the worker data database. Production always
 * uses the main database.
 *
 * @param req Express request object (optional)
 * @returns Database client for jobs operations
 */
export async function getJobsDbClient(req?: Request): Promise<any> {
  if (!req?.testDbPath) {
    // Production mode: jobs are in main database
    return global.dbClient;
  }

  const testDbPath: string = req.testDbPath;

  let jobsDbPath = testDbPath;
  if (!testDbPath.endsWith('-jobs.db')) {
    const dir = path.dirname(testDbPath);
    const ext = path.extname(testDbPath);
    const name = path.basename(testDbPath, ext);
    jobsDbPath = path.join(dir, `${name}-jobs${ext}`);
  }

  if (testClientCache.has(jobsDbPath)) {
    return testClientCache.get(jobsDbPath);
  }

  if (connectionPromises.has(jobsDbPath)) {
    return await connectionPromises.get(jobsDbPath);
  }

  const connectionPromise = (async () => {
    try {
      const { SQLiteClient } = await import('@keimenon/db');

      const client = new SQLiteClient({
        databasePath: jobsDbPath,
        verbose: false,
        ignoreGlobalContext: true,
      });

      await client.connect();
      client.enableDirectWrites();

      testClientCache.set(jobsDbPath, client);
      return client;
    } catch (error: any) {
      connectionPromises.delete(jobsDbPath);
      console.error(`[get-db-client] Failed to create jobs database client: ${error.message}`);
      throw error;
    } finally {
      connectionPromises.delete(jobsDbPath);
    }
  })();

  connectionPromises.set(jobsDbPath, connectionPromise);
  return await connectionPromise;
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
 * Get all active test database paths.
 *
 * @returns Array of absolute paths to all active test databases
 */
export function getActiveTestDatabases(): string[] {
  return Array.from(testClientCache.keys());
}

/**
 * Get active test jobs databases only.
 */
export function getActiveJobsDatabases(): string[] {
  return getActiveTestDatabases().filter((dbPath) => dbPath.endsWith('-jobs.db'));
}

/**
 * Close and remove cached database connections for a specific test DB path
 *
 * CRITICAL FIX #8: This function releases Windows file locks by closing
 * both data and jobs database connections before snapshot restoration.
 *
 * In test mode with separate jobs database:
 *   - Closes data database connection (worker-0.db)
 *   - Closes jobs database connection (worker-0-jobs.db)
 *   - Removes both from cache
 *
 * @param testDbPath Absolute path to worker data database file
 * @returns true if any connection was closed, false if none found
 */
export async function closeDbConnection(testDbPath: string): Promise<boolean> {
  let closedAny = false;

  // Close data database connection
  if (testClientCache.has(testDbPath)) {
    try {
      const client = testClientCache.get(testDbPath);

      // Close the database connection (releases file lock)
      if (client && typeof client.close === 'function') {
        await client.close();
      }

      // Remove from both caches
      testClientCache.delete(testDbPath);
      connectionPromises.delete(testDbPath);
      closedAny = true;
    } catch (error) {
      console.error(`[get-db-client] Error closing data DB connection:`, error);
      // Still remove from caches even if close failed
      testClientCache.delete(testDbPath);
      connectionPromises.delete(testDbPath);
    }
  }

  // Close jobs database connection
  const dir = path.dirname(testDbPath);
  const ext = path.extname(testDbPath);
  const name = path.basename(testDbPath, ext);
  const jobsDbPath = path.join(dir, `${name}-jobs${ext}`);

  if (testClientCache.has(jobsDbPath)) {
    try {
      const jobsClient = testClientCache.get(jobsDbPath);

      // Close the jobs database connection (releases file lock)
      if (jobsClient && typeof jobsClient.close === 'function') {
        await jobsClient.close();
      }

      // Remove from both caches
      testClientCache.delete(jobsDbPath);
      connectionPromises.delete(jobsDbPath);
      closedAny = true;
    } catch (error) {
      console.error(`[get-db-client] Error closing jobs DB connection:`, error);
      // Still remove from caches even if close failed
      testClientCache.delete(jobsDbPath);
      connectionPromises.delete(jobsDbPath);
    }
  }

  return closedAny;
}
