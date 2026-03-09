/**
 * Test Helper Routes
 *
 * Provides endpoints for E2E test database management:
 * - Savepoint control (begin/rollback/commit) for atomic test isolation
 * - Comprehensive cleanup across all tables
 *
 * SECURITY: Only available when NODE_ENV === 'test'
 * Returns empty router in production/development to prevent misuse
 *
 * Usage:
 *   POST /api/v1/test/savepoint { action: 'begin', savepointId: 'test_123' }
 *   POST /api/v1/test/savepoint { action: 'rollback', savepointId: 'test_123' }
 *   DELETE /api/v1/test/cleanup
 */

import express, { Router, Request, Response } from 'express';
import { SQLiteClient } from '@keimenon/db';
import { closeDbConnection } from '../utils/get-db-client';

export function createTestHelperRoutes(db: SQLiteClient): Router {
  const router = Router();

  // SECURITY: Only enable in test environment
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[Test Helpers] Routes disabled - NODE_ENV is not "test"');
    return router; // Return empty router
  }

  console.log('[Test Helpers] Routes enabled for test environment');

  // Track active savepoints per database path (for debugging)
  const activeSavepoints = new Map<string, Set<string>>();
  const verboseSavepointLogs = process.env.TEST_HELPERS_VERBOSE_SAVEPOINT === '1';

  /**
   * POST /api/v1/test/savepoint
   *
   * Manage SQLite savepoints for atomic test isolation
   *
   * Body:
   *   - action: 'begin' | 'rollback' | 'commit'
   *   - savepointId: unique identifier for this savepoint
   *
   * How it works:
   *   1. BEGIN SAVEPOINT creates a transaction checkpoint
   *   2. All changes after BEGIN are tracked
   *   3. ROLLBACK TO SAVEPOINT undoes all changes since BEGIN
   *   4. RELEASE SAVEPOINT commits changes
   */
  router.post(
    '/savepoint',
    express.json({ limit: '10mb' }),
    async (req: Request, res: Response) => {
      let { action, savepointId } = req.body;
      const dbPath = req.testDbPath || 'global';

      // Fallback: manually parse raw stream if express.json() missed it due to missing Content-Type
      if (!action || !savepointId) {
        try {
          const rawBody = await new Promise<string>((resolve, reject) => {
            let data = '';
            req.on('data', (chunk) => {
              data += chunk;
            });
            req.on('end', () => resolve(data));
            req.on('error', reject);
          });
          if (rawBody) {
            const parsed = JSON.parse(rawBody);
            action = parsed.action || action;
            savepointId = parsed.savepointId || savepointId;
          }
        } catch (e) {
          // Ignore parsing errors, let the validation below catch missing fields
        }
      }

      if (verboseSavepointLogs) {
        console.log('[Test Helpers] /savepoint request', {
          dbPath,
          action,
          savepointId,
          headers: req.headers,
          body: req.body,
        });
      }

      if (!action || !savepointId) {
        console.error(
          `[Test Helpers ERROR] Missing action or savepointId. Body: ${JSON.stringify(req.body)}`
        );
        return res.status(400).json({
          error: `Missing required fields: action, savepointId. Received body: ${JSON.stringify(req.body)}`,
        });
      }

      if (!['begin', 'rollback', 'commit'].includes(action)) {
        return res.status(400).json({
          error: `Invalid action: ${action}. Must be begin|rollback|commit`,
        });
      }

      try {
        // CRITICAL FIX: Get per-request database client for test isolation
        const { getDbClient } = await import('../utils/get-db-client');
        const dbClient = await getDbClient(req);
        const database = dbClient.getDatabase();

        if (action === 'begin') {
          // Create savepoint (transaction checkpoint)
          database.prepare(`SAVEPOINT ${savepointId}`).run();

          // Track active savepoint
          if (!activeSavepoints.has(dbPath)) {
            activeSavepoints.set(dbPath, new Set());
          }
          activeSavepoints.get(dbPath)!.add(savepointId);

          console.log(`[Test Helpers] ✅ Savepoint created: ${savepointId} (DB: ${dbPath})`);
          console.log(
            `[Test Helpers] Active savepoints: ${activeSavepoints.get(dbPath)?.size || 0}`
          );

          return res.json({
            success: true,
            message: `Savepoint ${savepointId} created`,
            activeSavepoints: Array.from(activeSavepoints.get(dbPath) || []),
          });
        } else if (action === 'rollback') {
          // CRITICAL FIX: Robust savepoint rollback with error handling
          // If savepoint doesn't exist, treat as success (desired state achieved)
          try {
            // Rollback to savepoint (undo all changes since BEGIN)
            database.prepare(`ROLLBACK TO SAVEPOINT ${savepointId}`).run();

            // Release savepoint (free resources)
            database.prepare(`RELEASE SAVEPOINT ${savepointId}`).run();

            console.log(`[Test Helpers] ✅ Rolled back to savepoint: ${savepointId}`);
          } catch (rollbackError: any) {
            // Check if error is "no such savepoint"
            if (rollbackError.message?.includes('no such savepoint')) {
              console.log(
                `[Test Helpers] ⚠️ Savepoint already released: ${savepointId} (treating as success)`
              );
              // Don't throw - this is actually fine, the savepoint is already gone
            } else {
              // Other error - this is a real problem
              throw rollbackError;
            }
          }

          // Untrack savepoint
          activeSavepoints.get(dbPath)?.delete(savepointId);

          console.log(
            `[Test Helpers] Remaining savepoints: ${activeSavepoints.get(dbPath)?.size || 0}`
          );

          return res.json({
            success: true,
            message: `Rolled back to savepoint ${savepointId}`,
            activeSavepoints: Array.from(activeSavepoints.get(dbPath) || []),
          });
        } else if (action === 'commit') {
          // Release savepoint (commit changes)
          database.prepare(`RELEASE SAVEPOINT ${savepointId}`).run();

          // Untrack savepoint
          activeSavepoints.get(dbPath)?.delete(savepointId);

          console.log(`[Test Helpers] ✅ Committed savepoint: ${savepointId}`);

          return res.json({
            success: true,
            message: `Savepoint ${savepointId} committed`,
            activeSavepoints: Array.from(activeSavepoints.get(dbPath) || []),
          });
        }

        // This should never be reached due to validation above, but TypeScript requires it
        return res.status(400).json({ error: 'Invalid action' });
      } catch (error: any) {
        console.error(`[Test Helpers] ❌ Savepoint error:`, error.message);
        return res.status(500).json({
          error: `Savepoint ${action} failed: ${error.message}`,
        });
      }
    }
  );

  /**
   * DELETE /api/v1/test/cleanup
   *
   * Comprehensive cleanup of ALL test data across ALL tables
   *
   * This is a FALLBACK if savepoint mechanism fails.
   * Normally, savepoints should handle cleanup automatically.
   *
   * Deletes:
   *   - All rows with data_tag='test' (nodes, edges, jobs, sessions, etc.)
   *   - All login_attempts (safe to clear in tests)
   *   - Job events/items for test jobs
   *
   * Query params:
   *   - data_tag: 'test' | 'automated' (default: 'test')
   */
  router.delete('/cleanup', async (req: Request, res: Response) => {
    const dataTag = (req.query.data_tag as string) || 'test';
    const dbPath = req.testDbPath || 'global';

    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const deletedCounts: Record<string, number> = {};

      // Use transaction for atomic cleanup
      database.prepare('BEGIN TRANSACTION').run();

      try {
        // 1. Delete sessions with data_tag
        const sessionsResult = database
          .prepare(`DELETE FROM sessions WHERE data_tag = ?`)
          .run(dataTag);
        deletedCounts.sessions = sessionsResult.changes || 0;

        // 2. Delete login_attempts with data_tag (or all in tests)
        const loginAttemptsResult = database
          .prepare(`DELETE FROM login_attempts WHERE data_tag = ?`)
          .run(dataTag);
        deletedCounts.login_attempts = loginAttemptsResult.changes || 0;

        // 3. Delete job_events for test jobs
        const jobEventsResult = database
          .prepare(
            `DELETE FROM job_events WHERE job_id IN (
            SELECT id FROM jobs WHERE data_tag = ?
          )`
          )
          .run(dataTag);
        deletedCounts.job_events = jobEventsResult.changes || 0;

        // 4. Delete job_items for test jobs
        const jobItemsResult = database
          .prepare(
            `DELETE FROM job_items WHERE job_id IN (
            SELECT id FROM jobs WHERE data_tag = ?
          )`
          )
          .run(dataTag);
        deletedCounts.job_items = jobItemsResult.changes || 0;

        // 5. Delete jobs
        const jobsResult = database.prepare(`DELETE FROM jobs WHERE data_tag = ?`).run(dataTag);
        deletedCounts.jobs = jobsResult.changes || 0;

        // 6. Delete edges (CASCADE will handle edge-node relationships)
        const edgesResult = database.prepare(`DELETE FROM edges WHERE data_tag = ?`).run(dataTag);
        deletedCounts.edges = edgesResult.changes || 0;

        // 7. Delete nodes (CASCADE will handle node-edge relationships)
        const nodesResult = database.prepare(`DELETE FROM nodes WHERE data_tag = ?`).run(dataTag);
        deletedCounts.nodes = nodesResult.changes || 0;

        // 8. Delete settings_config
        const settingsConfigResult = database
          .prepare(`DELETE FROM settings_config WHERE data_tag = ?`)
          .run(dataTag);
        deletedCounts.settings_config = settingsConfigResult.changes || 0;

        // 9. Delete settings_changes
        const settingsChangesResult = database
          .prepare(`DELETE FROM settings_changes WHERE data_tag = ?`)
          .run(dataTag);
        deletedCounts.settings_changes = settingsChangesResult.changes || 0;

        // Commit transaction
        database.prepare('COMMIT').run();

        const totalDeleted = Object.values(deletedCounts).reduce((sum, count) => sum + count, 0);

        console.log(`[Test Helpers] ✅ Cleanup complete (data_tag='${dataTag}', DB: ${dbPath})`);
        console.log(`[Test Helpers] Deleted counts:`, deletedCounts);
        console.log(`[Test Helpers] Total deleted: ${totalDeleted} rows`);

        return res.json({
          success: true,
          message: `Cleaned up ${totalDeleted} test records`,
          deletedCounts,
          dataTag,
        });
      } catch (error) {
        // Rollback on error
        database.prepare('ROLLBACK').run();
        throw error;
      }
    } catch (error: any) {
      console.error(`[Test Helpers] ❌ Cleanup error:`, error.message);
      return res.status(500).json({
        error: `Cleanup failed: ${error.message}`,
      });
    }
  });

  /**
   * POST /api/v1/test/close-connection
   *
   * Close cached database connection for a worker-specific test database
   *
   * CRITICAL FIX #8: This endpoint releases Windows file locks by closing
   * the database connection before snapshot restoration.
   *
   * Body:
   *   - testDbPath: absolute path to worker database file
   *
   * Returns:
   *   - success: true if connection closed, false if not found
   *   - message: description of what happened
   */
  router.post('/close-connection', async (req: Request, res: Response) => {
    const { testDbPath } = req.body;

    if (!testDbPath) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: testDbPath',
      });
    }

    try {
      const closed = await closeDbConnection(testDbPath);

      if (closed) {
        return res.json({
          success: true,
          message: `Closed connection for ${testDbPath}`,
        });
      } else {
        return res.json({
          success: false,
          message: `No cached connection found for ${testDbPath}`,
        });
      }
    } catch (error: any) {
      console.error(`[Test Helpers] ❌ Close connection error:`, error.message);
      return res.status(500).json({
        success: false,
        error: `Failed to close connection: ${error.message}`,
      });
    }
  });

  /**
   * GET /api/v1/test/status
   *
   * Get current test database status
   * Useful for debugging
   */
  router.get('/status', async (req: Request, res: Response) => {
    const dbPath = req.testDbPath || 'global';

    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      // Count records by data_tag
      const counts: Record<string, any> = {};

      const tables = [
        'sessions',
        'login_attempts',
        'jobs',
        'job_events',
        'job_items',
        'nodes',
        'edges',
        'settings_config',
        'settings_changes',
      ];

      for (const table of tables) {
        try {
          const testCount = database
            .prepare(`SELECT COUNT(*) as count FROM ${table} WHERE data_tag = 'test'`)
            .get() as any;
          const realCount = database
            .prepare(`SELECT COUNT(*) as count FROM ${table} WHERE data_tag = 'real'`)
            .get() as any;
          const totalCount = database
            .prepare(`SELECT COUNT(*) as count FROM ${table}`)
            .get() as any;

          counts[table] = {
            test: testCount?.count || 0,
            real: realCount?.count || 0,
            total: totalCount?.count || 0,
          };
        } catch (error) {
          // Table might not have data_tag column yet (pre-migration)
          counts[table] = { error: 'data_tag column not found (migration pending?)' };
        }
      }

      return res.json({
        success: true,
        dbPath,
        activeSavepoints: Array.from(activeSavepoints.get(dbPath) || []),
        counts,
      });
    } catch (error: any) {
      return res.status(500).json({
        error: `Status check failed: ${error.message}`,
      });
    }
  });

  return router;
}
