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
  // When test DB path is present (from E2E tests), use worker-specific database
  if (req?.testDbPath) {
    // Capture testDbPath in a const to help TypeScript understand it's non-undefined
    const testDbPath: string = req.testDbPath;

    // Check cache first to ensure same client instance is used across requests
    if (testClientCache.has(testDbPath)) {
      const cachedClient = testClientCache.get(testDbPath);
      console.log(`[Get DB Client] Using cached test client for ${path.basename(testDbPath)}`);
      return cachedClient;
    }

    // Check if connection is already in progress for this path
    if (connectionPromises.has(testDbPath)) {
      console.log(
        `[Get DB Client] Connection already in progress, waiting for ${path.basename(testDbPath)}`
      );
      return await connectionPromises.get(testDbPath);
    }

    console.log(`[Get DB Client] Creating test-specific client:`);
    console.log(`  - Worker DB: ${path.basename(testDbPath)}`);
    console.log(`  - Full path: ${testDbPath}`);

    // Create connection promise and cache it immediately
    const connectionPromise = (async () => {
      try {
        // Import SQLiteClient directly to bypass DatabaseFactory's singleton
        const { SQLiteClient } = await import('@canvas-memory/db');

        // Create a new client instance for this worker's database (bypasses singleton)
        const client = new SQLiteClient({
          databasePath: testDbPath,
          verbose: false,
        });

        // Connect to the database
        await client.connect();

        // Enable direct writes for test clients (E2E tests need to create test data)
        client.enableDirectWrites();

        // Cache the client for this database path
        testClientCache.set(testDbPath, client);

        console.log(`[Get DB Client] ✅ Test client created and cached successfully`);
        return client;
      } catch (error) {
        console.log(`[Get DB Client] ❌ Failed to create test client:`);
        console.log(`  - Error: ${error}`);
        // Remove failed promise from cache so next request can retry
        connectionPromises.delete(testDbPath);
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
 * CRITICAL FIX: In test mode, jobs are saved to a completely separate database file
 * to avoid SQLite locking conflicts when creating jobs inside SAVEPOINT transactions.
 *
 * Architecture:
 *   Test Mode:
 *     - Data database: worker-0.db (has SAVEPOINT transactions for test isolation)
 *     - Jobs database: worker-0-jobs.db (NO savepoints, jobs globally visible)
 *   Production Mode:
 *     - Single database: canvas.db (contains all data including jobs)
 *
 * Why separate database:
 * - SQLite does not allow creating a second connection to a database with active SAVEPOINT
 * - Separate database files = no lock contention
 * - Jobs remain visible to WorkerPool while data remains isolated
 *
 * @param req Express request object (optional)
 * @returns Database client for jobs operations
 */
export async function getJobsDbClient(req?: Request): Promise<any> {
  const isTestMode = process.env.NODE_ENV === 'test';

  if (!isTestMode || !req?.testDbPath) {
    // Production mode: jobs are in main database
    return global.dbClient;
  }

  // Test mode: jobs are in separate database file
  const testDbPath: string = req.testDbPath;
  const jobsDbPath = testDbPath.replace('.db', '-jobs.db'); // worker-0.db → worker-0-jobs.db

  // Check cache first
  if (testClientCache.has(jobsDbPath)) {
    const cachedClient = testClientCache.get(jobsDbPath);
    console.log(`[Get DB Client] Using cached jobs DB client for ${path.basename(jobsDbPath)}`);
    return cachedClient;
  }

  // Check if connection is already in progress
  if (connectionPromises.has(jobsDbPath)) {
    console.log(
      `[Get DB Client] Jobs DB connection in progress, waiting for ${path.basename(jobsDbPath)}`
    );
    return await connectionPromises.get(jobsDbPath);
  }

  console.log(`[Get DB Client] Creating jobs database client:`);
  console.log(`  - Jobs DB: ${path.basename(jobsDbPath)}`);
  console.log(`  - Purpose: Separate database for jobs (avoids SAVEPOINT locking)`);

  // Create connection promise
  const connectionPromise = (async () => {
    try {
      const { SQLiteClient } = await import('@canvas-memory/db');

      // Create client instance for jobs database (separate file from data database)
      const client = new SQLiteClient({
        databasePath: jobsDbPath,
        verbose: false,
      });

      await client.connect();
      client.enableDirectWrites();

      // Cache the client for this database path
      testClientCache.set(jobsDbPath, client);

      console.log(`[Get DB Client] ✅ Jobs database client created successfully`);
      return client;
    } catch (error) {
      console.log(`[Get DB Client] ❌ Failed to create jobs database client:`);
      console.log(`  - Error: ${error}`);
      connectionPromises.delete(jobsDbPath);
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
 * Get all active test database paths
 *
 * CRITICAL FIX: Enables WorkerPool to query all test databases when polling for jobs
 * This solves the issue where test jobs are saved to test DBs but worker pool only queries production
 *
 * @returns Array of absolute paths to all active test databases
 */
export function getActiveTestDatabases(): string[] {
  return Array.from(testClientCache.keys());
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
        console.log(`[Get DB Client] ✅ Closed data DB connection: ${path.basename(testDbPath)}`);
      }

      // Remove from both caches
      testClientCache.delete(testDbPath);
      connectionPromises.delete(testDbPath);
      console.log(`[Get DB Client] ✅ Removed data DB from cache: ${path.basename(testDbPath)}`);
      closedAny = true;
    } catch (error) {
      console.error(`[Get DB Client] ❌ Error closing data DB connection:`, error);
      // Still remove from caches even if close failed
      testClientCache.delete(testDbPath);
      connectionPromises.delete(testDbPath);
    }
  }

  // Close jobs database connection
  const jobsDbPath = testDbPath.replace('.db', '-jobs.db');

  if (testClientCache.has(jobsDbPath)) {
    try {
      const jobsClient = testClientCache.get(jobsDbPath);

      // Close the jobs database connection (releases file lock)
      if (jobsClient && typeof jobsClient.close === 'function') {
        await jobsClient.close();
        console.log(`[Get DB Client] ✅ Closed jobs DB connection: ${path.basename(jobsDbPath)}`);
      }

      // Remove from both caches
      testClientCache.delete(jobsDbPath);
      connectionPromises.delete(jobsDbPath);
      console.log(`[Get DB Client] ✅ Removed jobs DB from cache: ${path.basename(jobsDbPath)}`);
      closedAny = true;
    } catch (error) {
      console.error(`[Get DB Client] ❌ Error closing jobs DB connection:`, error);
      // Still remove from caches even if close failed
      testClientCache.delete(jobsDbPath);
      connectionPromises.delete(jobsDbPath);
    }
  }

  if (!closedAny) {
    console.log(`[Get DB Client] No cached connections for ${path.basename(testDbPath)}`);
  }

  return closedAny;
}
