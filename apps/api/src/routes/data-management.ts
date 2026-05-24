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
import { randomUUID } from 'crypto';

type ExportFormat = 'json' | 'csv' | 'graphml';

type ExportNode = Record<string, any> & {
  id: string;
  kind: string;
  account_id: string;
  properties: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

type ExportEdge = Record<string, any> & {
  id: string;
  kind: string;
  account_id: string;
  from_id: string;
  to_id: string;
  properties: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

function resolveExportFormat(formatQuery: unknown): ExportFormat | null {
  if (typeof formatQuery === 'undefined') {
    return 'json';
  }

  const rawFormat = Array.isArray(formatQuery) ? formatQuery[0] : formatQuery;
  if (typeof rawFormat !== 'string') {
    return null;
  }

  const normalized = rawFormat.trim().toLowerCase();
  if (normalized === 'json' || normalized === 'csv' || normalized === 'graphml') {
    return normalized;
  }

  return null;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value == null) {
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== 'string') {
    return { value };
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed == null) {
      return {};
    }
    if (Array.isArray(parsed)) {
      return { items: parsed };
    }
    if (typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { _malformed: value };
  }
}

function escapeCsvValue(value: unknown): string {
  if (value == null) {
    return '';
  }

  const str = typeof value === 'string' ? value : String(value);
  const needsQuoting = /[",\r\n]/.test(str);
  const escaped = str.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

function toCsv(nodes: ExportNode[], edges: ExportEdge[]): string {
  const headers = [
    'record_type',
    'id',
    'kind',
    'account_id',
    'source_id',
    'target_id',
    'created_by',
    'created_at',
    'updated_at',
    'data_tag',
    'properties',
    'metadata',
  ];

  const rows: string[] = [headers.join(',')];

  for (const node of nodes) {
    const row = [
      'node',
      node.id,
      node.kind,
      node.account_id,
      '',
      '',
      node.created_by ?? '',
      node.created_at ?? '',
      node.updated_at ?? '',
      node.data_tag ?? '',
      JSON.stringify(node.properties ?? {}),
      JSON.stringify(node.metadata ?? {}),
    ].map(escapeCsvValue);

    rows.push(row.join(','));
  }

  for (const edge of edges) {
    const row = [
      'edge',
      edge.id ?? '',
      edge.kind,
      edge.account_id,
      edge.from_id ?? '',
      edge.to_id ?? '',
      edge.created_by ?? '',
      edge.created_at ?? '',
      edge.updated_at ?? '',
      edge.data_tag ?? '',
      JSON.stringify(edge.properties ?? {}),
      JSON.stringify(edge.metadata ?? {}),
    ].map(escapeCsvValue);

    rows.push(row.join(','));
  }

  return rows.join('\n');
}

function escapeXml(value: unknown): string {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function graphmlData(key: string, value: unknown): string {
  return `      <data key="${escapeXml(key)}">${escapeXml(value)}</data>`;
}

function toGraphMl(nodes: ExportNode[], edges: ExportEdge[]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns"',
    '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '         xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">',
    '  <key id="node_kind" for="node" attr.name="kind" attr.type="string"/>',
    '  <key id="node_account_id" for="node" attr.name="account_id" attr.type="string"/>',
    '  <key id="node_created_by" for="node" attr.name="created_by" attr.type="string"/>',
    '  <key id="node_created_at" for="node" attr.name="created_at" attr.type="string"/>',
    '  <key id="node_updated_at" for="node" attr.name="updated_at" attr.type="string"/>',
    '  <key id="node_data_tag" for="node" attr.name="data_tag" attr.type="string"/>',
    '  <key id="node_properties" for="node" attr.name="properties" attr.type="string"/>',
    '  <key id="node_metadata" for="node" attr.name="metadata" attr.type="string"/>',
    '  <key id="edge_kind" for="edge" attr.name="kind" attr.type="string"/>',
    '  <key id="edge_account_id" for="edge" attr.name="account_id" attr.type="string"/>',
    '  <key id="edge_created_by" for="edge" attr.name="created_by" attr.type="string"/>',
    '  <key id="edge_created_at" for="edge" attr.name="created_at" attr.type="string"/>',
    '  <key id="edge_updated_at" for="edge" attr.name="updated_at" attr.type="string"/>',
    '  <key id="edge_data_tag" for="edge" attr.name="data_tag" attr.type="string"/>',
    '  <key id="edge_weight" for="edge" attr.name="weight" attr.type="string"/>',
    '  <key id="edge_properties" for="edge" attr.name="properties" attr.type="string"/>',
    '  <key id="edge_metadata" for="edge" attr.name="metadata" attr.type="string"/>',
    '  <graph id="keimenon-export" edgedefault="directed">',
  ];

  for (const node of nodes) {
    lines.push(`    <node id="${escapeXml(node.id)}">`);
    lines.push(graphmlData('node_kind', node.kind));
    lines.push(graphmlData('node_account_id', node.account_id));
    lines.push(graphmlData('node_created_by', node.created_by ?? ''));
    lines.push(graphmlData('node_created_at', node.created_at ?? ''));
    lines.push(graphmlData('node_updated_at', node.updated_at ?? ''));
    lines.push(graphmlData('node_data_tag', node.data_tag ?? ''));
    lines.push(graphmlData('node_properties', JSON.stringify(node.properties ?? {})));
    lines.push(graphmlData('node_metadata', JSON.stringify(node.metadata ?? {})));
    lines.push('    </node>');
  }

  for (const edge of edges) {
    lines.push(
      `    <edge id="${escapeXml(edge.id ?? `${edge.from_id}-${edge.to_id}`)}" source="${escapeXml(edge.from_id)}" target="${escapeXml(edge.to_id)}">`
    );
    lines.push(graphmlData('edge_kind', edge.kind));
    lines.push(graphmlData('edge_account_id', edge.account_id));
    lines.push(graphmlData('edge_created_by', edge.created_by ?? ''));
    lines.push(graphmlData('edge_created_at', edge.created_at ?? ''));
    lines.push(graphmlData('edge_updated_at', edge.updated_at ?? ''));
    lines.push(graphmlData('edge_data_tag', edge.data_tag ?? ''));
    lines.push(graphmlData('edge_weight', edge.weight ?? ''));
    lines.push(graphmlData('edge_properties', JSON.stringify(edge.properties ?? {})));
    lines.push(graphmlData('edge_metadata', JSON.stringify(edge.metadata ?? {})));
    lines.push('    </edge>');
  }

  lines.push('  </graph>');
  lines.push('</graphml>');
  return lines.join('\n');
}

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
      const isAdmin = (req as any).user.accountType === 'admin';
      const dataTag = req.query.data_tag as string | undefined;
      const now = Date.now();

      // Clear any running imports for this account before clearing data
      const workerPool = (global as any).workerPool;
      if (workerPool) {
        const poolStatus = workerPool.getStatus();
        const activeImports = poolStatus.currentJobs.filter(
          (j: any) => j.type === 'import' && (isAdmin || j.accountId === accountId)
        );

        if (activeImports.length > 0) {
          console.log(
            `[Data Management] ⛔ Found ${activeImports.length} active import(s) during clear request. Canceling...`
          );
          for (const activeJob of activeImports) {
            await workerPool.cancelJob(
              activeJob.jobId,
              activeJob.accountId || accountId,
              'Canceled due to data management clear operation'
            );
          }
          // Sleep for 500ms to allow worker to cooperatively yield database locks
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Build WHERE clause based on admin status and data_tag filter
      // Admin users can see and delete ALL data (matching graph view behavior)
      const accountFilter = isAdmin ? '' : 'AND account_id = ?';
      const dataTagFilter = dataTag ? `AND data_tag = ?` : '';
      const params = isAdmin
        ? dataTag
          ? [dataTag]
          : []
        : dataTag
          ? [accountId, dataTag]
          : [accountId];

      // Get counts before deletion for response
      // Uses node kind constants from packages/types/src/node-kinds.ts
      const nodesCounts = database
        .prepare(
          `
      SELECT kind, COUNT(*) as count
      FROM nodes
      WHERE 1=1
        ${accountFilter}
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
      WHERE 1=1
        ${accountFilter}
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
        WHERE 1=1
          ${accountFilter}
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
        WHERE 1=1
          ${accountFilter}
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

      // Clear any running imports before clearing all client data
      const workerPool = (global as any).workerPool;
      if (workerPool) {
        const poolStatus = workerPool.getStatus();
        const activeImports = poolStatus.currentJobs.filter((j: any) => j.type === 'import');

        if (activeImports.length > 0) {
          console.log(
            `[Data Management] ⛔ Found ${activeImports.length} active import(s) during clear-all request. Canceling...`
          );
          for (const activeJob of activeImports) {
            await workerPool.cancelJob(
              activeJob.jobId,
              activeJob.accountId || adminAccountId,
              'Canceled due to admin data management clear-all operation'
            );
          }
          // Sleep for 500ms to allow worker to cooperatively yield database locks
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

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
      const isAdmin = (req as any).user.accountType === 'admin';

      try {
        // Get node counts by kind
        // Admin users see ALL data (matching graph view behavior)
        // Uses node kind constants from packages/types/src/node-kinds.ts
        const nodeCounts = isAdmin
          ? (database
              .prepare(
                `
        SELECT kind, COUNT(*) as count
        FROM nodes
        WHERE kind IN (${getKeimenonDataInClause()})
        GROUP BY kind
      `
              )
              .all() as any[])
          : (database
              .prepare(
                `
        SELECT kind, COUNT(*) as count
        FROM nodes
        WHERE account_id = ?
          AND kind IN (${getKeimenonDataInClause()})
        GROUP BY kind
      `
              )
              .all(accountId) as any[]);

        // Get edge counts
        const edgeCount = isAdmin
          ? (database
              .prepare(
                `
        SELECT COUNT(*) as count
        FROM edges
        WHERE kind IN ('CONTAINS', 'DERIVES_FROM', 'IN_GROUP', 'FOLDS_INTO_FOLDER', 'DUP_OF')
      `
              )
              .get() as any)
          : (database
              .prepare(
                `
        SELECT COUNT(*) as count
        FROM edges
        WHERE account_id = ?
          AND kind IN ('CONTAINS', 'DERIVES_FROM', 'IN_GROUP', 'FOLDS_INTO_FOLDER', 'DUP_OF')
      `
              )
              .get(accountId) as any);

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
      const format = resolveExportFormat(req.query.format);

      if (!format) {
        return res.status(400).json({
          error: 'Invalid export format',
          supportedFormats: ['json', 'csv', 'graphml'],
        });
      }

      try {
        // Fetch all Keimenon data nodes
        const nodes = database
          .prepare(
            `
          SELECT *
          FROM nodes
          WHERE account_id = ?
            AND kind IN (${getKeimenonDataInClause()})
          ORDER BY id ASC
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
          ORDER BY id ASC
        `
          )
          .all(accountId) as any[];

        // Parse properties for nodes/edges where applicable
        const formattedNodes: ExportNode[] = nodes.map((n) => ({
          ...n,
          properties: parseJsonObject(n.properties),
          metadata: parseJsonObject(n.metadata),
        }));

        const formattedEdges: ExportEdge[] = edges.map((e) => ({
          ...e,
          properties: parseJsonObject(e.properties),
          metadata: parseJsonObject(e.metadata),
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

        if (format === 'json') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 'attachment; filename="keimenon-export.json"');
          return res.json(exportData);
        }

        if (format === 'csv') {
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', 'attachment; filename="keimenon-export.csv"');
          return res.send(toCsv(formattedNodes, formattedEdges));
        }

        res.setHeader('Content-Type', 'application/graphml+xml; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="keimenon-export.graphml"');
        return res.send(toGraphMl(formattedNodes, formattedEdges));
      } catch (error: any) {
        throw ErrorFactory.database(
          error.message || 'Failed to export data',
          'dataManagement.exportData',
          { accountId, errorName: error.name }
        );
      }
    })
  );

  /**
   * POST /api/v1/data/reset-hard
   * Personal/Desktop only: Escape hatch nuclear option.
   * Completely stops active jobs, disconnects SQLite, physically deletes the .db files,
   * and boots a fresh, clean database seeded with default admin user.
   */
  router.post(
    '/reset-hard',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      console.log('[Hard Reset] 🚨 Initiating nuclear hard reset...');

      const workerPool = (global as any).workerPool;
      const writeQueue = (global as any).writeQueue;
      const dbClient = (global as any).dbClient;

      if (!dbClient) {
        return res.status(500).json({ success: false, error: 'Database client not initialized' });
      }

      const dbPath = dbClient.config.databasePath;
      console.log(`[Hard Reset] Database file path: ${dbPath}`);

      // 1. Abort and stop all background workers
      if (workerPool) {
        console.log('[Hard Reset] Stopping worker pool...');
        await workerPool.stop();
      }

      // 2. Stop and drain the write queue
      if (writeQueue) {
        console.log('[Hard Reset] Stopping write queue...');
        await writeQueue.stop();
      }

      // 3. Disconnect SQLite and reset the factory singleton
      console.log('[Hard Reset] Disconnecting from SQLite...');
      const { DatabaseFactory } = await import('@keimenon/db');
      await DatabaseFactory.closeAll();

      // 4. Physically delete SQLite database files from disk
      const fs = await import('fs/promises');
      try {
        await fs.rm(dbPath, { force: true });
        await fs.rm(`${dbPath}-wal`, { force: true });
        await fs.rm(`${dbPath}-shm`, { force: true });
        console.log('[Hard Reset] Physical database files deleted.');
      } catch (err: any) {
        console.error('[Hard Reset] Warning: Error deleting database files:', err.message);
      }

      // 5. Re-create a fresh database client (will automatically connect and run migrations)
      console.log('[Hard Reset] Creating a fresh database client...');
      const newDbClient = await DatabaseFactory.getClient({
        mode: 'local',
        local: {
          databasePath: dbPath,
          verbose: process.env.NODE_ENV === 'development',
        },
      });
      global.dbClient = newDbClient;

      // 6. Assert compatibility and seed default admin account
      if ((newDbClient as any).assertImportSchemaCompatibility) {
        (newDbClient as any).assertImportSchemaCompatibility();
      }
      const { seedAdminAccount } = await import('@keimenon/db');
      await seedAdminAccount(newDbClient as any);
      console.log('[Hard Reset] Fresh database schema and seed completed.');

      // 7. Update AuthService database reference
      const activeAuthService = (global as any).authService || authService;
      if (activeAuthService) {
        (activeAuthService as any).db = newDbClient;
        console.log('[Hard Reset] AuthService updated.');
      }

      // 8. Re-create and start the DatabaseWriteQueue
      const { DatabaseWriteQueue } = await import('../services/DatabaseWriteQueue');
      const newWriteQueue = new DatabaseWriteQueue(newDbClient, (global as any).sseBroadcaster);
      newWriteQueue.start();
      (global as any).writeQueue = newWriteQueue;
      console.log('[Hard Reset] DatabaseWriteQueue re-initialized.');

      // 9. Re-create and start the WorkerPool
      const { SQLiteJobRepository } = await import('../modules/jobs/infrastructure/JobRepository');
      const newJobRepository = new SQLiteJobRepository((newDbClient as any).db);
      (global as any).jobRepository = newJobRepository;

      if ((global as any).sseBroadcaster) {
        (global as any).sseBroadcaster.setJobRepository(newJobRepository);
      }

      const { WorkerPool } = await import('../modules/workers/domain/WorkerPool');
      const { ConcurrencyGuard } = await import('../modules/workers/domain/ConcurrencyGuard');
      const { StartJob } = await import('../modules/jobs/application/StartJob');
      const { ImportWorker } = await import('../modules/workers/infrastructure/ImportWorker');
      const { DeleteWorker } = await import('../modules/workers/infrastructure/DeleteWorker');

      const newWorkerPool = new WorkerPool(
        newJobRepository,
        new ConcurrencyGuard(newJobRepository),
        new StartJob(newJobRepository),
        {
          maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '3', 10),
          pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000', 10),
        },
        (global as any).sseBroadcaster
      );

      newWorkerPool.registerWorker(new ImportWorker(newDbClient, newWriteQueue));
      newWorkerPool.registerWorker(new DeleteWorker(newDbClient));
      await newWorkerPool.start();
      (global as any).workerPool = newWorkerPool;
      console.log('[Hard Reset] WorkerPool re-initialized.');

      return res.json({
        success: true,
        message: 'Keimenon has been successfully hard reset to a clean, fresh state.',
      });
    })
  );

  return router;
}
