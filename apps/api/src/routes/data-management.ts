/**
 * Data Management API Routes
 * Handles clearing keimenon data while preserving user accounts and settings
 */

import { Router, Request, Response } from 'express';
import { SQLiteClient } from '@keimenon/db';
import { AuthService } from '../services/auth.service';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { asyncHandler, ErrorFactory } from '../middleware/error-handler.middleware';
import { getKeimenonDataInClause } from '@keimenon/types';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

export function createDataManagementRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();
  // CRITICAL FIX: Database client must be obtained per-request for test isolation
  // See: apps/api/src/middleware/db-context.middleware.ts, tests/e2e/fixtures/test-isolation.ts

  /**
   * DELETE /api/v1/data/keimenon
   * Clear current user's keimenon data (keeps user/account/settings)
   *
   * Deletes:
   * - ChatThread, Message, Source, CodeBlock, Group, Folder nodes
   * - CONTAINS, DERIVES_FROM, IN_GROUP, FOLDS_INTO_FOLDER, DUP_OF edges
   * - FTS entries for deleted nodes
   *
   * Preserves:
   * - User, Account, Membership nodes
   * - Settings
   * - Audit logs
   */
  router.delete(
    '/keimenon',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const accountId = (req as any).user.accountId;
      const userId = (req as any).user.userId;
      const dataTag = req.query.data_tag as string | undefined;
      const now = Date.now();

      // Build WHERE clause based on whether data_tag filter is provided
      const dataTagFilter = dataTag ? `AND data_tag = ?` : '';
      const params = dataTag ? [accountId, dataTag] : [accountId];

      // Get counts before deletion for response
      // Uses node kind constants from packages/types/src/node-kinds.ts
      const nodesCounts = database
        .prepare(
          `
      SELECT kind, COUNT(*) as count
      FROM nodes
      WHERE account_id = ?
        ${dataTagFilter}
        AND kind IN (${getKeimenonDataInClause()})
      GROUP BY kind
    `
        )
        .all(...params) as any[];

      const edgesCount = database
        .prepare(
          `
      SELECT COUNT(*) as count
      FROM edges
      WHERE account_id = ?
        ${dataTagFilter}
        AND kind IN ('CONTAINS', 'DERIVES_FROM', 'IN_GROUP', 'FOLDS_INTO_FOLDER', 'DUP_OF')
    `
        )
        .get(...params) as any;

      // Check if there's any data to delete
      const totalNodes = nodesCounts.reduce((sum, n) => sum + n.count, 0);
      if (totalNodes === 0 && edgesCount.count === 0) {
        return res.json({
          success: true,
          message: 'No keimenon data to clear',
          deleted: {
            nodes: [],
            edges: 0,
          },
        });
      }

      // Use savepoint instead of transaction for compatibility with test isolation
      // Savepoints work within existing transactions (e.g., from E2E test fixtures)
      const savepointId = `clear_keimenon_${Date.now()}`;

      try {
        database.prepare(`SAVEPOINT ${savepointId}`).run();
      } catch (error: any) {
        if (
          error.message?.includes('SQLITE_BUSY') ||
          error.message?.includes('database is locked')
        ) {
          throw ErrorFactory.database(
            'Database is currently busy',
            'dataManagement.clearKeimenon',
            {
              accountId,
              userId,
              error: error.message,
            }
          );
        }
        throw error;
      }

      try {
        // 1. Delete keimenon data edges first (before nodes to avoid FK issues)
        database
          .prepare(
            `
        DELETE FROM edges
        WHERE account_id = ?
          ${dataTagFilter}
          AND kind IN ('CONTAINS', 'DERIVES_FROM', 'IN_GROUP', 'FOLDS_INTO_FOLDER', 'DUP_OF')
      `
          )
          .run(...params);

        // 2. Delete keimenon data nodes (FTS trigger will clean up automatically)
        // Uses node kind constants from packages/types/src/node-kinds.ts
        const nodesDeleted = database
          .prepare(
            `
        DELETE FROM nodes
        WHERE account_id = ?
          ${dataTagFilter}
          AND kind IN (${getKeimenonDataInClause()})
      `
          )
          .run(...params);

        // 3. Audit log
        database
          .prepare(
            `
        INSERT INTO audit_log (
          id, actor_user_id, actor_account_id, target_account_id,
          action, resource_type, resource_id, mode, success,
          metadata, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
          )
          .run(
            randomUUID(),
            userId,
            accountId,
            accountId,
            'delete',
            'KeimenonData',
            accountId,
            'native',
            1,
            JSON.stringify({
              nodes_deleted: nodesCounts,
              edges_deleted: edgesCount.count,
              initiated_by: 'user',
            }),
            now
          );

        // Release savepoint (commit)
        database.prepare(`RELEASE SAVEPOINT ${savepointId}`).run();

        return res.json({
          success: true,
          message: 'Keimenon data cleared successfully',
          deleted: {
            nodes: nodesCounts,
            edges: edgesCount.count,
          },
        });
      } catch (error: any) {
        // Rollback to savepoint on error
        try {
          database.prepare(`ROLLBACK TO SAVEPOINT ${savepointId}`).run();
          database.prepare(`RELEASE SAVEPOINT ${savepointId}`).run();
        } catch (rollbackError: any) {
          console.error('[Data Management] Rollback failed:', rollbackError);
        }

        // Handle specific database errors
        if (
          error.message?.includes('SQLITE_BUSY') ||
          error.message?.includes('database is locked')
        ) {
          throw ErrorFactory.database(
            'Database is currently busy',
            'dataManagement.clearKeimenon.transaction',
            { accountId, userId, nodesCounts, edgesCount: edgesCount.count }
          );
        }

        if (error.message?.includes('FOREIGN KEY constraint failed')) {
          throw ErrorFactory.database(
            'Failed to delete data due to integrity constraints',
            'dataManagement.clearKeimenon.foreignKey',
            { accountId, userId, error: error.message }
          );
        }

        // Generic database error
        throw ErrorFactory.database(
          error.message || 'Failed to clear keimenon data',
          'dataManagement.clearKeimenon',
          { accountId, userId, errorName: error.name }
        );
      }
    })
  );

  /**
   * DELETE /api/v1/data/all-clients
   * Admin only: Clear ALL client keimenon data (preserves admin data, users, accounts, settings)
   *
   * Deletes (for all client accounts):
   * - ChatThread, Message, Source, CodeBlock, Group, Folder nodes
   * - CONTAINS, DERIVES_FROM, IN_GROUP, FOLDS_INTO_FOLDER, DUP_OF edges
   * - FTS entries for deleted nodes
   *
   * Preserves:
   * - Admin account data
   * - All user/account records
   * - Settings
   * - Audit logs
   */
  router.delete(
    '/all-clients',
    requireAuth(authService),
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const adminUserId = (req as any).user.userId;
      const adminAccountId = (req as any).user.accountId;
      const now = Date.now();

      // Get all client accounts linked to this admin (enforce account_links authorization)
      const clientAccounts = database
        .prepare(
          `
      SELECT DISTINCT al.client_account_id as account_id
      FROM account_links al
      WHERE al.admin_account_id = ?
    `
        )
        .all(adminAccountId) as any[];

      if (clientAccounts.length === 0) {
        return res.json({
          success: true,
          message: 'No client data to clear',
          cleared_accounts: 0,
        });
      }

      // Use savepoint instead of transaction for compatibility with test isolation
      const savepointId = `clear_all_clients_${Date.now()}`;

      try {
        database.prepare(`SAVEPOINT ${savepointId}`).run();
      } catch (error: any) {
        if (
          error.message?.includes('SQLITE_BUSY') ||
          error.message?.includes('database is locked')
        ) {
          throw ErrorFactory.database(
            'Database is currently busy',
            'dataManagement.clearAllClients',
            { adminAccountId, adminUserId, clientAccountsCount: clientAccounts.length }
          );
        }
        throw error;
      }

      try {
        let totalNodesDeleted = 0;
        let totalEdgesDeleted = 0;

        // Clear data for each client account
        for (const { account_id } of clientAccounts) {
          // Delete keimenon data edges first
          const edgesResult = database
            .prepare(
              `
          DELETE FROM edges
          WHERE account_id = ?
            AND kind IN ('CONTAINS', 'DERIVES_FROM', 'IN_GROUP', 'FOLDS_INTO_FOLDER', 'DUP_OF')
        `
            )
            .run(account_id);
          totalEdgesDeleted += edgesResult.changes;

          // Delete keimenon data nodes (FTS trigger will clean up automatically)
          // Uses node kind constants from packages/types/src/node-kinds.ts
          const nodesResult = database
            .prepare(
              `
          DELETE FROM nodes
          WHERE account_id = ?
            AND kind IN (${getKeimenonDataInClause()})
        `
            )
            .run(account_id);
          totalNodesDeleted += nodesResult.changes;
        }

        // Audit log
        database
          .prepare(
            `
        INSERT INTO audit_log (
          id, actor_user_id, actor_account_id, target_account_id,
          action, resource_type, resource_id, mode, success,
          metadata, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
          )
          .run(
            randomUUID(),
            adminUserId,
            adminAccountId,
            null, // Affects multiple accounts
            'delete',
            'AllClientData',
            'all_clients',
            'native',
            1,
            JSON.stringify({
              accounts_cleared: clientAccounts.length,
              nodes_deleted: totalNodesDeleted,
              edges_deleted: totalEdgesDeleted,
              initiated_by: 'admin',
            }),
            now
          );

        // Release savepoint (commit)
        database.prepare(`RELEASE SAVEPOINT ${savepointId}`).run();

        return res.json({
          success: true,
          message: `Cleared data for ${clientAccounts.length} client account(s)`,
          cleared_accounts: clientAccounts.length,
          deleted: {
            nodes: totalNodesDeleted,
            edges: totalEdgesDeleted,
          },
        });
      } catch (error: any) {
        // Rollback to savepoint on error
        try {
          database.prepare(`ROLLBACK TO SAVEPOINT ${savepointId}`).run();
          database.prepare(`RELEASE SAVEPOINT ${savepointId}`).run();
        } catch (rollbackError: any) {
          console.error('[Data Management] Rollback failed:', rollbackError);
        }

        // Handle specific database errors
        if (
          error.message?.includes('SQLITE_BUSY') ||
          error.message?.includes('database is locked')
        ) {
          throw ErrorFactory.database(
            'Database is currently busy',
            'dataManagement.clearAllClients.transaction',
            { adminAccountId, adminUserId, clientAccountsCount: clientAccounts.length }
          );
        }

        if (error.message?.includes('FOREIGN KEY constraint failed')) {
          throw ErrorFactory.database(
            'Failed to delete data due to integrity constraints',
            'dataManagement.clearAllClients.foreignKey',
            { adminAccountId, adminUserId, error: error.message }
          );
        }

        // Generic database error
        throw ErrorFactory.database(
          error.message || 'Failed to clear all client data',
          'dataManagement.clearAllClients',
          { adminAccountId, adminUserId, errorName: error.name }
        );
      }
    })
  );

  /**
   * GET /api/v1/data/stats
   * Get current keimenon data statistics
   * Useful for showing user what will be cleared
   */
  router.get(
    '/stats',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const accountId = (req as any).user.accountId;

      try {
        // Get node counts by kind
        // Uses node kind constants from packages/types/src/node-kinds.ts
        const nodeCounts = database
          .prepare(
            `
        SELECT kind, COUNT(*) as count
        FROM nodes
        WHERE account_id = ?
          AND kind IN (${getKeimenonDataInClause()})
        GROUP BY kind
      `
          )
          .all(accountId) as any[];

        // Get edge counts
        const edgeCount = database
          .prepare(
            `
        SELECT COUNT(*) as count
        FROM edges
        WHERE account_id = ?
          AND kind IN ('CONTAINS', 'DERIVES_FROM', 'IN_GROUP', 'FOLDS_INTO_FOLDER', 'DUP_OF')
      `
          )
          .get(accountId) as any;

        return res.json({
          success: true,
          stats: {
            nodes: nodeCounts,
            edges: edgeCount.count,
          },
        });
      } catch (error: any) {
        // Handle database errors
        throw ErrorFactory.database(
          error.message || 'Failed to get data stats',
          'dataManagement.getStats',
          { accountId, errorName: error.name }
        );
      }
    })
  );

  /**
   * GET /api/v1/data/export
   * Export all Keimenon graph data for the current user/account
   *
   * Returns a JSON payload containing all nodes and edges belonging
   * to the account.
   */
  router.get(
    '/export',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      // Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const accountId = (req as any).user.accountId;

      try {
        // Fetch all Keimenon data nodes
        const nodes = database
          .prepare(
            `
          SELECT *
          FROM nodes
          WHERE account_id = ?
            AND kind IN (${getKeimenonDataInClause()})
        `
          )
          .all(accountId) as any[];

        // Fetch all edges (excluding system edges)
        const edges = database
          .prepare(
            `
          SELECT *
          FROM edges
          WHERE account_id = ?
            AND kind IN ('CONTAINS', 'DERIVES_FROM', 'IN_GROUP', 'FOLDS_INTO_FOLDER', 'DUP_OF')
        `
          )
          .all(accountId) as any[];

        // Parse properties for nodes/edges where applicable
        const formattedNodes = nodes.map((n) => ({
          ...n,
          properties: n.properties ? JSON.parse(n.properties) : {},
          metadata: n.metadata ? JSON.parse(n.metadata) : {},
        }));

        const formattedEdges = edges.map((e) => ({
          ...e,
          properties: e.properties ? JSON.parse(e.properties) : {},
          metadata: e.metadata ? JSON.parse(e.metadata) : {},
        }));

        const exportData = {
          version: '1.0',
          timestamp: new Date().toISOString(),
          accountId: accountId,
          graph: {
            nodes: formattedNodes,
            edges: formattedEdges,
          },
        };

        // Set headers for file download
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="keimenon-export.json"');

        return res.json(exportData);
      } catch (error: any) {
        throw ErrorFactory.database(
          error.message || 'Failed to export data',
          'dataManagement.exportData',
          { accountId, errorName: error.name }
        );
      }
    })
  );

  return router;
}
