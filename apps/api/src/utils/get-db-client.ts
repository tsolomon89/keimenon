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
 * Get non-transactional database client for jobs in test mode
 *
 * CRITICAL FIX: In test mode, jobs are saved inside SAVEPOINT transactions.
 * This makes them invisible to WorkerPool queries which use separate connections.
 *
 * Solution: Use a separate database connection for job save operations.
 * This connection bypasses the savepoint, making jobs immediately visible to WorkerPool.
 *
 * Architecture:
 * - Normal operations: Use transactional connection (getDbClient)
 * - Job saves only: Use non-transactional connection (this function)
 * - Production mode: Returns global client (no special behavior needed)
 *
 * @param req Express request object (optional)
 * @returns Database client bypassing savepoint transactions
 */
export async function getNonTransactionalJobsClient(req?: Request): Promise<any> {
  // In production mode, just return the global client (no savepoints exist)
  const isTestMode = process.env.NODE_ENV === 'test';
  if (!isTestMode || !req?.testDbPath) {
    return global.dbClient;
  }

  // In test mode with testDbPath, create a separate connection to the same DB
  // This connection will NOT be inside the savepoint transaction
  const testDbPath: string = req.testDbPath;
  const jobsClientKey = `${testDbPath}_jobs`; // Separate cache key for jobs connection

  // Check cache first
  if (testClientCache.has(jobsClientKey)) {
    const cachedClient = testClientCache.get(jobsClientKey);
    console.log(
      `[Get DB Client] Using cached non-transactional jobs client for ${path.basename(testDbPath)}`
    );
    return cachedClient;
  }

  // Check if connection is already in progress
  if (connectionPromises.has(jobsClientKey)) {
    console.log(
      `[Get DB Client] Non-transactional jobs connection in progress, waiting for ${path.basename(testDbPath)}`
    );
    return await connectionPromises.get(jobsClientKey);
  }

  console.log(`[Get DB Client] Creating non-transactional jobs client:`);
  console.log(`  - Worker DB: ${path.basename(testDbPath)}`);
  console.log(`  - Purpose: Job saves (bypasses savepoint isolation)`);

  // Create connection promise
  const connectionPromise = (async () => {
    try {
      const { SQLiteClient } = await import('@canvas-memory/db');

      // Create a new client instance for jobs (separate connection to same DB)
      const client = new SQLiteClient({
        databasePath: testDbPath,
        verbose: false,
      });

      await client.connect();
      client.enableDirectWrites();

      // Cache under separate key
      testClientCache.set(jobsClientKey, client);

      console.log(`[Get DB Client] ✅ Non-transactional jobs client created successfully`);
      return client;
    } catch (error) {
      console.log(`[Get DB Client] ❌ Failed to create non-transactional jobs client:`);
      console.log(`  - Error: ${error}`);
      connectionPromises.delete(jobsClientKey);
      throw error;
    } finally {
      connectionPromises.delete(jobsClientKey);
    }
  })();

  connectionPromises.set(jobsClientKey, connectionPromise);
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

    // Remove from both caches
    testClientCache.delete(testDbPath);
    connectionPromises.delete(testDbPath); // Also clear any pending connection promise
    console.log(`[Get DB Client] ✅ Removed from cache: ${path.basename(testDbPath)}`);

    return true;
  } catch (error) {
    console.error(`[Get DB Client] ❌ Error closing connection:`, error);
    // Still remove from both caches even if close failed
    testClientCache.delete(testDbPath);
    connectionPromises.delete(testDbPath);
    return false;
  }
}
