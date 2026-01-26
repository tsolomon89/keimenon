import { Router, Request, Response } from 'express';
import { SourceNodeSchema, GroupNodeSchema, ObjectiveClaimSchema } from '@keimenon/types';
import { getDbClient } from '../utils/get-db-client';
import { requireAuth, requirePermission, isolateByAccount } from '../middleware/auth.middleware';
import { AuthService } from '../services/auth.service';

// Create routes with auth service (will be called from app.ts)
export function createNodesRoutes(authService: AuthService): Router {
  const router = Router();

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
        console.error('Create source error:', error);

        // Handle Zod validation errors - return 400 instead of 500
        if (error.name === 'ZodError') {
          return res.status(400).json({
            error: 'Validation failed',
            details: error.errors,
            message: 'Invalid node data provided',
          });
        }

        return res.status(500).json({
          error: 'Failed to create source node',
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
        const { kind, limit = '100', skip = '0' } = req.query;
        const db = await getDbClient(req);

        const limitNum = parseInt(limit as string, 10);
        const skipNum = parseInt(skip as string, 10);
        const storageMode = process.env.STORAGE_MODE || 'local';

        let nodes;
        let total = 0;

        // Build account filter
        const accountFilter =
          req.user && req.user.accountType !== 'admin' ? req.user.accountId : null;

        // Log user info for debugging
        if (req.user) {
          console.log(
            `👤 Request from: ${req.user.email} (${req.user.accountType}) | account_id=${req.user.accountId}`
          );
        } else {
          console.log('👤 Request from: unauthenticated user');
        }

        if (storageMode === 'local') {
          // SQLite queries with account filtering
          if (accountFilter) {
            // Client account - filter by account_id
            if (kind) {
              const query =
                'SELECT id, kind, properties, created_at, updated_at FROM nodes WHERE kind = ? AND account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
              const result = await db.execute(query, [kind, accountFilter, limitNum, skipNum]);
              console.log(
                `📊 Query returned ${result.records?.length || 0} records for kind=${kind}, account=${accountFilter}`
              );

              nodes = result.records.map((row: any) => {
                let parsedProperties;
                try {
                  parsedProperties =
                    typeof row.properties === 'string'
                      ? JSON.parse(row.properties)
                      : row.properties;
                } catch (e) {
                  console.error('Failed to parse properties for node:', row.id, e);
                  parsedProperties = {};
                }

                // Spread the parsed node and override with authoritative database values
                return {
                  ...parsedProperties,
                  id: row.id,
                  kind: row.kind,
                  created_at: row.created_at,
                  updated_at: row.updated_at,
                };
              });

              const countResult = await db.execute(
                'SELECT COUNT(*) as count FROM nodes WHERE kind = ? AND account_id = ?',
                [kind, accountFilter]
              );
              total = countResult.records[0].count;
            } else {
              const query =
                'SELECT id, kind, properties, created_at, updated_at FROM nodes WHERE account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
              const result = await db.execute(query, [accountFilter, limitNum, skipNum]);
              console.log(
                `📊 Query returned ${result.records?.length || 0} records for account=${accountFilter}`
              );

              nodes = result.records.map((row: any) => {
                let parsedProperties;
                try {
                  parsedProperties =
                    typeof row.properties === 'string'
                      ? JSON.parse(row.properties)
                      : row.properties;
                } catch (e) {
                  console.error('Failed to parse properties for node:', row.id, e);
                  parsedProperties = {};
                }

                // Spread the parsed node and override with authoritative database values
                return {
                  ...parsedProperties,
                  id: row.id,
                  kind: row.kind,
                  created_at: row.created_at,
                  updated_at: row.updated_at,
                };
              });

              const countResult = await db.execute(
                'SELECT COUNT(*) as count FROM nodes WHERE account_id = ?',
                [accountFilter]
              );
              total = countResult.records[0].count;
            }
          } else {
            // Admin account - see all data
            if (kind) {
              const query =
                'SELECT id, kind, properties, created_at, updated_at FROM nodes WHERE kind = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
              const result = await db.execute(query, [kind, limitNum, skipNum]);
              console.log(
                `📊 Query returned ${result.records?.length || 0} records (admin mode, kind=${kind})`
              );

              nodes = result.records.map((row: any) => {
                let parsedProperties;
                try {
                  parsedProperties =
                    typeof row.properties === 'string'
                      ? JSON.parse(row.properties)
                      : row.properties;
                } catch (e) {
                  console.error('Failed to parse properties for node:', row.id, e);
                  parsedProperties = {};
                }

                // Spread the parsed node and override with authoritative database values
                return {
                  ...parsedProperties,
                  id: row.id,
                  kind: row.kind,
                  created_at: row.created_at,
                  updated_at: row.updated_at,
                };
              });

              const countResult = await db.execute(
                'SELECT COUNT(*) as count FROM nodes WHERE kind = ?',
                [kind]
              );
              total = countResult.records[0].count;
            } else {
              const query =
                'SELECT id, kind, properties, created_at, updated_at FROM nodes ORDER BY created_at DESC LIMIT ? OFFSET ?';
              const result = await db.execute(query, [limitNum, skipNum]);
              console.log(
                `📊 Query returned ${result.records?.length || 0} records (admin mode, all nodes)`
              );

              nodes = result.records.map((row: any) => {
                let parsedProperties;
                try {
                  parsedProperties =
                    typeof row.properties === 'string'
                      ? JSON.parse(row.properties)
                      : row.properties;
                } catch (e) {
                  console.error('Failed to parse properties for node:', row.id, e);
                  parsedProperties = {};
                }

                // Spread the parsed node and override with authoritative database values
                return {
                  ...parsedProperties,
                  id: row.id,
                  kind: row.kind,
                  created_at: row.created_at,
                  updated_at: row.updated_at,
                };
              });

              const countResult = await db.execute('SELECT COUNT(*) as count FROM nodes');
              total = countResult.records[0].count;
            }
          }
        } else {
          // Neo4j queries - similar pattern
          if (accountFilter) {
            if (kind) {
              const query =
                'MATCH (n:Node) WHERE n.kind = $kind AND n.account_id = $accountId RETURN n ORDER BY n.created_at DESC SKIP $skip LIMIT $limit';
              const result = await db.execute(query, {
                kind,
                accountId: accountFilter,
                skip: skipNum,
                limit: limitNum,
              });
              nodes = result.records.map((r: any) => r.get('n').properties);
            } else {
              const query =
                'MATCH (n:Node) WHERE n.account_id = $accountId RETURN n ORDER BY n.created_at DESC SKIP $skip LIMIT $limit';
              const result = await db.execute(query, {
                accountId: accountFilter,
                skip: skipNum,
                limit: limitNum,
              });
              nodes = result.records.map((r: any) => r.get('n').properties);
            }
          } else {
            if (kind) {
              const query =
                'MATCH (n:Node) WHERE n.kind = $kind RETURN n ORDER BY n.created_at DESC SKIP $skip LIMIT $limit';
              const result = await db.execute(query, { kind, skip: skipNum, limit: limitNum });
              nodes = result.records.map((r: any) => r.get('n').properties);
            } else {
              const query =
                'MATCH (n:Node) RETURN n ORDER BY n.created_at DESC SKIP $skip LIMIT $limit';
              const result = await db.execute(query, { skip: skipNum, limit: limitNum });
              nodes = result.records.map((r: any) => r.get('n').properties);
            }
          }
        }

        console.log(`📤 Returning ${nodes?.length || 0} nodes, total: ${total}`);
        if (nodes && nodes.length > 0) {
          console.log('Sample node:', {
            id: nodes[0].id,
            kind: nodes[0].kind,
            hasProperties: !!nodes[0].properties,
          });
        }

        return res.json({ nodes, count: nodes?.length || 0, total });
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
          const storageMode = process.env.STORAGE_MODE || 'local';
          if (storageMode === 'local') {
            await db.execute('DELETE FROM nodes WHERE id = ?', [id]);
          } else {
            await db.execute('MATCH (n:Node {id: $id}) DETACH DELETE n', { id });
          }
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

// Legacy export for backward compatibility
// TODO: Remove after all imports updated to use createNodesRoutes
export default createNodesRoutes as any;
