/**
 * Data Management API Routes
 * Handles clearing canvas data while preserving user accounts and settings
 */

import { Router, Request, Response } from 'express';
import { SQLiteClient } from '@canvas-memory/db';
import { AuthService } from '../services/auth.service';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { asyncHandler, ErrorFactory } from '../middleware/error-handler.middleware';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

export function createDataManagementRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();
  const database = db.getDatabase();

  /**
   * DELETE /api/v1/data/canvas
   * Clear current user's canvas data (keeps user/account/settings)
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
    '/canvas',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const accountId = (req as any).user.accountId;
      const userId = (req as any).user.userId;
      const now = Date.now();

      // Get counts before deletion for response
      const nodesCounts = database
        .prepare(
          `
      SELECT kind, COUNT(*) as count
      FROM nodes
      WHERE account_id = ?
        AND kind IN ('ChatThread', 'Message', 'Source', 'CodeBlock', 'Group', 'Folder')
      GROUP BY kind
    `
        )
        .all(accountId) as any[];

      const edgesCount = database
        .prepare(
          `
      SELECT COUNT(*) as count
      FROM edges
      WHERE account_id = ?
        AND kind IN ('CONTAINS', 'DERIVES_FROM', 'IN_GROUP', 'FOLDS_INTO_FOLDER', 'DUP_OF')
    `
        )
        .get(accountId) as any;

      // Check if there's any data to delete
      const totalNodes = nodesCounts.reduce((sum, n) => sum + n.count, 0);
      if (totalNodes === 0 && edgesCount.count === 0) {
        return res.json({
          success: true,
          message: 'No canvas data to clear',
          deleted: {
            nodes: [],
            edges: 0,
          },
        });
      }

      // Start transaction for atomic deletion
      try {
        database.prepare('BEGIN TRANSACTION').run();
      } catch (error: any) {
        if (
          error.message?.includes('SQLITE_BUSY') ||
          error.message?.includes('database is locked')
        ) {
          throw ErrorFactory.database('Database is currently busy', 'dataManagement.clearCanvas', {
            accountId,
            userId,
            error: error.message,
          });
        }
        throw error;
      }

      try {
        // 1. Delete canvas data edges first (before nodes to avoid FK issues)
        database
          .prepare(
            `
        DELETE FROM edges
        WHERE account_id = ?
          AND kind IN ('CONTAINS', 'DERIVES_FROM', 'IN_GROUP', 'FOLDS_INTO_FOLDER', 'DUP_OF')
      `
          )
          .run(accountId);

        // 2. Delete canvas data nodes (FTS trigger will clean up automatically)
        const nodesDeleted = database
          .prepare(
            `
        DELETE FROM nodes
        WHERE account_id = ?
          AND kind IN ('ChatThread', 'Message', 'Source', 'CodeBlock', 'Group', 'Folder')
      `
          )
          .run(accountId);

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
            'CanvasData',
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

        // Commit transaction
        database.prepare('COMMIT').run();

        return res.json({
          success: true,
          message: 'Canvas data cleared successfully',
          deleted: {
            nodes: nodesCounts,
            edges: edgesCount.count,
          },
        });
      } catch (error: any) {
        // Rollback on error
        try {
          database.prepare('ROLLBACK').run();
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
            'dataManagement.clearCanvas.transaction',
            { accountId, userId, nodesCounts, edgesCount: edgesCount.count }
          );
        }

        if (error.message?.includes('FOREIGN KEY constraint failed')) {
          throw ErrorFactory.database(
            'Failed to delete data due to integrity constraints',
            'dataManagement.clearCanvas.foreignKey',
            { accountId, userId, error: error.message }
          );
        }

        // Generic database error
        throw ErrorFactory.database(
          error.message || 'Failed to clear canvas data',
          'dataManagement.clearCanvas',
          { accountId, userId, errorName: error.name }
        );
      }
    })
  );

  /**
   * DELETE /api/v1/data/all-clients
   * Admin only: Clear ALL client canvas data (preserves admin data, users, accounts, settings)
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

      // Start transaction
      try {
        database.prepare('BEGIN TRANSACTION').run();
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
          // Delete canvas data edges first
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

          // Delete canvas data nodes (FTS trigger will clean up automatically)
          const nodesResult = database
            .prepare(
              `
          DELETE FROM nodes
          WHERE account_id = ?
            AND kind IN ('ChatThread', 'Message', 'Source', 'CodeBlock', 'Group', 'Folder')
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

        // Commit transaction
        database.prepare('COMMIT').run();

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
        // Rollback on error
        try {
          database.prepare('ROLLBACK').run();
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
   * Get current canvas data statistics
   * Useful for showing user what will be cleared
   */
  router.get(
    '/stats',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const accountId = (req as any).user.accountId;

      try {
        // Get node counts by kind
        const nodeCounts = database
          .prepare(
            `
        SELECT kind, COUNT(*) as count
        FROM nodes
        WHERE account_id = ?
          AND kind IN ('ChatThread', 'Message', 'Source', 'CodeBlock', 'Group', 'Folder')
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

  return router;
}
