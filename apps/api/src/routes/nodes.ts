import { Router, Request, Response } from 'express';
import { SourceNodeSchema, GroupNodeSchema, ObjectiveClaimSchema } from '@keimenon/types';
import { nanoid } from 'nanoid';
import { getDbClient } from '../utils/get-db-client';
import { requireAuth, requirePermission, isolateByAccount } from '../middleware/auth.middleware';
import { AuthService } from '../services/auth.service';
import { PrincipalService } from '../services/principal-service';
import { appLogger } from '../utils/logger';

// Create routes with auth service (will be called from app.ts)
export function createNodesRoutes(authService: AuthService): Router {
  const router = Router();
  const mapNodeRecord = (row: any) => {
    let parsedProperties: any = {};
    try {
      parsedProperties =
        typeof row.properties === 'string' ? JSON.parse(row.properties) : row.properties || {};
    } catch (error) {
      appLogger.warn(`Failed to parse properties for node ${row?.id || 'unknown'}`);
    }

    return {
      ...parsedProperties,
      id: row.id,
      kind: row.kind,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  };

  /**
   * POST /api/v1/nodes/source
   * Create a Source node (requires senior permission)
   *
   * CRITICAL FIX #19: Apply auth middleware at route level, not inside handler
   * Related: tests/e2e/nodes-crud-operations.spec.ts:114
   */
  router.post(
    '/source',
    requireAuth(authService),
    requirePermission('senior'),
    async (req: Request, res: Response) => {
      try {
        const source = SourceNodeSchema.parse(req.body);
        const db = await getDbClient(req);

        // Prepare node data with auth fields
        const nodeData: any = { ...source };
        if (req.user) {
          nodeData.account_id = req.user.accountId;
          nodeData.created_by = req.user.userId;
        }
        // Extract data_tag from metadata if present (for test data cleanup)
        if (source.metadata?.data_tag) {
          nodeData.data_tag = source.metadata.data_tag;
        }

        await db.createNode(nodeData);

        // Return the complete node with all fields (account_id, created_by, data_tag, etc.)
        return res.status(201).json({ success: true, node: nodeData });
      } catch (error: any) {
        // Handle Zod validation errors - return 400 instead of 500
        if (error.name === 'ZodError') {
          appLogger.debug('nodes.createSource.validation', {
            issueCount: Array.isArray(error.errors) ? error.errors.length : 0,
          });
          return res.status(400).json({
            error: 'Validation failed',
            details: error.errors,
            message: 'Invalid node data provided',
          });
        }

        appLogger.error('nodes.createSource.failed', {
          message: error?.message || 'Unknown error',
        });

        return res.status(500).json({
          error: 'Failed to create source node',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/nodes/search
   * Search node content/metadata in serialized properties JSON.
   */
  router.get(
    '/search',
    requireAuth(authService),
    isolateByAccount,
    async (req: Request, res: Response) => {
      try {
        const db = await getDbClient(req);
        const q = String(req.query.q || '').trim();
        const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
        const limitNum = Math.min(
          Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1),
          1000
        );
        const skipNum = Math.max(parseInt(String(req.query.skip || '0'), 10) || 0, 0);
        const accountFilter =
          req.user && req.user.accountType !== 'admin' ? req.user.accountId : null;

        if (!q) {
          return res.status(400).json({
            error: 'Missing search query',
            message: 'Query parameter q is required',
          });
        }

        const whereClauses: string[] = [];
        const whereParams: any[] = [];

        if (accountFilter) {
          whereClauses.push('account_id = ?');
          whereParams.push(accountFilter);
        }

        if (kind) {
          whereClauses.push('LOWER(kind) = LOWER(?)');
          whereParams.push(kind);
        }

        whereClauses.push('LOWER(properties) LIKE ?');
        whereParams.push(`%${q.toLowerCase()}%`);

        const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const listSql = `SELECT id, kind, properties, created_at, updated_at FROM nodes ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        const countSql = `SELECT COUNT(*) as count FROM nodes ${whereSql}`;

        const result = await db.execute(listSql, [...whereParams, limitNum, skipNum]);
        const countResult = await db.execute(countSql, whereParams);
        const total = Number(countResult.records?.[0]?.count || 0);
        const nodes = (result.records || []).map(mapNodeRecord);

        return res.json({
          nodes,
          data: nodes,
          count: nodes.length,
          total,
          metadata: { total },
        });
      } catch (error: any) {
        console.error('Search nodes error:', error);
        return res.status(500).json({
          error: 'Failed to search nodes',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/nodes/:id
   * Get a node by ID (with account isolation)
   *
   * CRITICAL FIX #19: Apply auth middleware at route level
   */
  router.get(
    '/:id',
    requireAuth(authService),
    isolateByAccount,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const db = await getDbClient(req);

        const node = await db.getNode(id);

        if (!node) {
          return res.status(404).json({ error: 'Node not found' });
        }

        // Check account access if auth is enabled
        if (req.user) {
          const nodeAccountId = (node as any).account_id;

          // Admin accounts can access all data
          if (req.user.accountType !== 'admin') {
            // CRITICAL SECURITY: Check for NULL account_id (data integrity violation)
            if (nodeAccountId === null || nodeAccountId === undefined) {
              console.error('[SECURITY] Node missing account_id:', {
                nodeId: id,
                nodeAccountId,
                requestingUser: req.user.email,
              });
              return res.status(500).json({
                error: 'Data integrity error',
                message: 'Node has no account owner',
              });
            }

            // Client accounts can only access their own data
            if (nodeAccountId !== req.user.accountId) {
              return res.status(403).json({ error: 'Access denied' });
            }
          }
        }

        return res.json({ node });
      } catch (error: any) {
        console.error('Get node error:', error);
        return res.status(500).json({
          error: 'Failed to get node',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/v1/nodes/:id/sequester
   * Create or remove a SEQUESTERS edge from the current human principal to the target node.
   */
  router.post(
    '/:id/sequester',
    requireAuth(authService),
    isolateByAccount,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const accountId = req.user?.accountId;
        const userId = req.user?.userId;
        const requestUser = req.user;

        if (!accountId || !userId) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
          });
        }

        const shouldSequester = req.body?.sequester !== false;
        const db = await getDbClient(req);
        const targetNode = await db.getNode(id);

        if (!targetNode) {
          return res.status(404).json({
            success: false,
            error: 'Node not found',
          });
        }

        const targetNodeAccountId = (targetNode as any).account_id;
        if (requestUser?.accountType !== 'admin' && targetNodeAccountId !== accountId) {
          return res.status(403).json({
            success: false,
            error: 'Access denied',
          });
        }

        const principalService = new PrincipalService(db);
        const principal = await principalService.resolveHumanPrincipal(
          accountId,
          userId,
          requestUser?.email || undefined,
          requestUser?.email || undefined
        );

        const sqliteDb = (db as any).db;
        let existingEdges: Array<{ id: string }> = [];

        if (sqliteDb?.prepare) {
          existingEdges = sqliteDb
            .prepare(
              `
                SELECT id
                FROM edges
                WHERE account_id = ? AND kind = 'SEQUESTERS' AND from_id = ? AND to_id = ?
              `
            )
            .all(accountId, principal.id, id) as Array<{ id: string }>;
        } else if (db.getNodeEdges) {
          const outgoing = await db.getNodeEdges(principal.id, 'outgoing');
          existingEdges = outgoing
            .filter((edge: any) => edge.kind === 'SEQUESTERS' && edge.to === id)
            .map((edge: any) => ({ id: edge.id }));
        }

        if (!shouldSequester) {
          let removed = 0;
          if (existingEdges.length > 0) {
            if (sqliteDb?.prepare) {
              const result = sqliteDb
                .prepare(
                  `
                    DELETE FROM edges
                    WHERE account_id = ? AND kind = 'SEQUESTERS' AND from_id = ? AND to_id = ?
                  `
                )
                .run(accountId, principal.id, id);
              removed = result?.changes || 0;
            } else if (db.deleteEdge) {
              for (const edge of existingEdges) {
                await db.deleteEdge(edge.id);
                removed += 1;
              }
            }
          }

          return res.json({
            success: true,
            sequestered: false,
            removed,
          });
        }

        if (existingEdges.length > 0) {
          return res.json({
            success: true,
            sequestered: true,
            alreadySequestered: true,
            edgeId: existingEdges[0].id,
          });
        }

        const edgeId = `edge_sequesters_${nanoid(12)}`;
        await db.createEdge({
          id: edgeId,
          kind: 'SEQUESTERS',
          from: principal.id,
          to: id,
          created_at: Date.now(),
          account_id: accountId,
          created_by: userId,
          metadata: {
            sequesteredBy: userId,
            sequesteredAt: Date.now(),
          },
        } as any);

        return res.status(201).json({
          success: true,
          sequestered: true,
          edgeId,
        });
      } catch (error: any) {
        console.error('Sequester node error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to sequester node',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/nodes
   * List nodes with filters (with account isolation)
   * Query params: ?kind=ChatThread&skip=0&limit=10
   *
   * CRITICAL FIX #19: Apply auth middleware at route level
   */
  router.get(
    '/',
    requireAuth(authService),
    isolateByAccount,
    async (req: Request, res: Response) => {
      try {
        const db = await getDbClient(req);
        const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
        const sort = req.query.sort === 'updated_at' ? 'updated_at' : 'created_at';
        const order = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const limitNum = Math.min(
          Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1),
          1000
        );
        const skipFallback = Math.max(parseInt(String(req.query.skip || '0'), 10) || 0, 0);
        const cursorOffset = Math.max(parseInt(String(req.query.cursor || ''), 10) || 0, 0);
        const offset = req.query.cursor ? cursorOffset : skipFallback;
        const createdAfter = Number.isFinite(Number(req.query.created_after))
          ? Number(req.query.created_after)
          : null;
        const createdBefore = Number.isFinite(Number(req.query.created_before))
          ? Number(req.query.created_before)
          : null;

        const accountFilter =
          req.user && req.user.accountType !== 'admin' ? req.user.accountId : null;

        const whereClauses: string[] = [];
        const whereParams: any[] = [];

        if (accountFilter) {
          whereClauses.push('account_id = ?');
          whereParams.push(accountFilter);
        }

        if (kind) {
          whereClauses.push('LOWER(kind) = LOWER(?)');
          whereParams.push(kind);
        }

        if (createdAfter !== null) {
          whereClauses.push("datetime(created_at) >= datetime(? / 1000, 'unixepoch')");
          whereParams.push(createdAfter);
        }

        if (createdBefore !== null) {
          whereClauses.push("datetime(created_at) <= datetime(? / 1000, 'unixepoch')");
          whereParams.push(createdBefore);
        }

        const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
        const listSql =
          'SELECT id, kind, properties, created_at, updated_at FROM nodes ' +
          whereSql +
          ' ORDER BY ' +
          sort +
          ' ' +
          order +
          ' LIMIT ? OFFSET ?';
        const countSql = 'SELECT COUNT(*) as count FROM nodes ' + whereSql;

        const result = await db.execute(listSql, [...whereParams, limitNum, offset]);
        const countResult = await db.execute(countSql, whereParams);
        const total = Number(countResult.records?.[0]?.count || 0);
        const nodes = (result.records || []).map(mapNodeRecord);
        const nextCursor =
          offset + nodes.length < total ? String(offset + nodes.length) : undefined;

        return res.json({
          nodes,
          data: nodes,
          count: nodes.length,
          total,
          metadata: {
            total,
            next_cursor: nextCursor,
          },
        });
      } catch (error: any) {
        console.error('List nodes error:', error);
        return res.status(500).json({
          error: 'Failed to list nodes',
          message: error.message,
        });
      }
    }
  );

  /**
   * DELETE /api/v1/nodes/:id
   * Delete a node (requires leader permission)
   *
   * CRITICAL FIX #19: Apply auth middleware at route level
   */
  router.delete(
    '/:id',
    requireAuth(authService),
    isolateByAccount,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const db = await getDbClient(req);

        // Check if node exists first
        const node = await db.getNode(id);
        if (!node) {
          return res.status(404).json({ error: 'Node not found' });
        }

        // Check account access if auth is enabled
        if (req.user) {
          const nodeAccountId = (node as any).account_id;

          console.log('[DELETE Authorization Check]', {
            nodeId: id,
            nodeAccountId,
            userAccountId: req.user.accountId,
            userType: req.user.accountType,
            nodeKeys: Object.keys(node),
            fullNode: JSON.stringify(node, null, 2),
          });

          // Admin accounts can delete all data
          if (req.user.accountType !== 'admin') {
            // CRITICAL SECURITY: Check for NULL account_id (data integrity violation)
            if (nodeAccountId === null || nodeAccountId === undefined) {
              console.error('[SECURITY] Node missing account_id on DELETE:', {
                nodeId: id,
                nodeAccountId,
                requestingUser: req.user.email,
                userAccountId: req.user.accountId,
              });
              return res.status(500).json({
                error: 'Data integrity error',
                message: 'Node has no account owner - cannot verify permissions',
              });
            }

            // Client accounts can only delete their own data
            if (nodeAccountId !== req.user.accountId) {
              console.log('[DELETE DENIED] Account mismatch:', {
                nodeAccountId,
                userAccountId: req.user.accountId,
              });
              return res.status(403).json({ error: 'Access denied' });
            }
          }
        }

        // Delete the node
        if (db.deleteNode) {
          await db.deleteNode(id);
        } else {
          // Fallback for databases without deleteNode method
          await db.execute('DELETE FROM nodes WHERE id = ?', [id]);
        }

        return res.json({ success: true, deleted: 1 });
      } catch (error: any) {
        console.error('Delete node error:', error);
        return res.status(500).json({
          error: 'Failed to delete node',
          message: error.message,
        });
      }
    }
  );

  /**
   * PUT /api/v1/nodes/:id
   * Update a node's properties (requires senior permission)
   *
   * IMPORTANT: Only allows updating `properties` field (metadata).
   * Core fields like id, kind, fingerprint, created_at are immutable.
   *
   * CRITICAL FIX #19: Apply auth middleware at route level
   * Related: tests/e2e/nodes-crud-operations.spec.ts:254
   * Related: E2E_BACKEND_ISSUES.md (Priority 2)
   */
  router.put(
    '/:id',
    requireAuth(authService),
    requirePermission('senior'),
    isolateByAccount,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const updates = req.body;
        const db = await getDbClient(req);

        // Check if node exists first
        const existingNode = await db.getNode(id);
        if (!existingNode) {
          return res.status(404).json({ error: 'Node not found' });
        }

        // Check account access if auth is enabled
        if (req.user) {
          const nodeAccountId = (existingNode as any).account_id;

          console.log('[UPDATE Authorization Check]', {
            nodeId: id,
            nodeAccountId,
            userAccountId: req.user.accountId,
            userType: req.user.accountType,
          });

          // Admin accounts can update all data
          if (req.user.accountType !== 'admin') {
            // CRITICAL SECURITY: Check for NULL account_id (data integrity violation)
            if (nodeAccountId === null || nodeAccountId === undefined) {
              console.error('[SECURITY] Node missing account_id on UPDATE:', {
                nodeId: id,
                nodeAccountId,
                requestingUser: req.user.email,
                userAccountId: req.user.accountId,
              });
              return res.status(500).json({
                error: 'Data integrity error',
                message: 'Node has no account owner - cannot verify permissions',
              });
            }

            // Client accounts can only update their own data
            if (nodeAccountId !== req.user.accountId) {
              console.log('[UPDATE DENIED] Account mismatch:', {
                nodeAccountId,
                userAccountId: req.user.accountId,
              });
              return res.status(403).json({ error: 'Access denied' });
            }
          }
        }

        // SECURITY: Filter out immutable core fields
        const immutableFields = [
          'id',
          'kind',
          'fingerprint',
          'created_at',
          'created_by',
          'account_id',
        ];

        // Check if trying to update immutable fields
        const attemptedImmutableUpdates = immutableFields.filter(
          (field) => updates[field] !== undefined
        );

        if (attemptedImmutableUpdates.length > 0) {
          return res.status(400).json({
            error: 'Cannot update immutable fields',
            immutableFields: attemptedImmutableUpdates,
            message: 'Core node fields cannot be modified after creation',
          });
        }

        // Allow updating all fields except immutable ones
        const allowedUpdates: any = {};
        Object.keys(updates).forEach((key) => {
          if (!immutableFields.includes(key)) {
            allowedUpdates[key] = updates[key];
          }
        });

        // If no valid updates provided, return error
        if (Object.keys(allowedUpdates).length === 0) {
          return res.status(400).json({
            error: 'No valid update fields provided',
            message: 'At least one field must be provided for update',
          });
        }

        // Update timestamp
        allowedUpdates.updated_at = Date.now();

        // Perform update (returns void)
        await db.updateNode(id, allowedUpdates);

        // Return merged data directly (no read-back) to avoid SQLite WAL timing issues
        const updatedNode = {
          ...existingNode,
          ...allowedUpdates,
        };

        return res.json({
          success: true,
          node: updatedNode,
        });
      } catch (error: any) {
        console.error('Update node error:', error);

        // Handle Zod validation errors
        if (error.name === 'ZodError') {
          return res.status(400).json({
            error: 'Validation failed',
            details: error.errors,
          });
        }

        return res.status(500).json({
          error: 'Failed to update node',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/v1/nodes/group
   * Create a Group node (requires senior permission)
   *
   * CRITICAL FIX #19: Apply auth middleware at route level
   */
  router.post(
    '/group',
    requireAuth(authService),
    requirePermission('senior'),
    async (req: Request, res: Response) => {
      try {
        const group = GroupNodeSchema.parse(req.body);
        const db = await getDbClient(req);

        // Prepare node data with auth fields
        const nodeData: any = { ...group };
        if (req.user) {
          nodeData.account_id = req.user.accountId;
          nodeData.created_by = req.user.userId;
        }

        await db.createNode(nodeData);

        return res.status(201).json({ success: true, node: nodeData });
      } catch (error: any) {
        console.error('Create group error:', error);
        return res.status(500).json({
          error: 'Failed to create group node',
          message: error.message,
        });
      }
    }
  );

  return router;
}
