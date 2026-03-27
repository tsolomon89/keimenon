import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { getDbClient } from '../utils/get-db-client';

const router = Router();

function getQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value.find((item): item is string => typeof item === 'string' && item.length > 0);
    return first;
  }
  return undefined;
}

// Auth middleware will be added by server.ts when authService is available
let authService: any = null;
let requireAuth: any = null;
let requirePermission: any = null;
let isolateByAccount: any = null;

// Export function to set auth dependencies
export function setAuthDependencies(
  service: any,
  authMiddleware: any,
  permissionMiddleware: any,
  isolationMiddleware: any
) {
  authService = service;
  requireAuth = authMiddleware;
  requirePermission = permissionMiddleware;
  isolateByAccount = isolationMiddleware;
}

/**
 * GET /api/v1/edges
 * List edges with optional filters (with account isolation)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const parseProperties = (raw: unknown): Record<string, unknown> => {
      if (typeof raw !== 'string' || raw.length === 0) return {};
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    };

    // Apply auth if available
    if (requireAuth && isolateByAccount) {
      await new Promise<void>((resolve, reject) => {
        requireAuth(authService)(req, res, (err: any) => {
          if (err) reject(err);
          else {
            isolateByAccount(req, res, (err2: any) => {
              if (err2) reject(err2);
              else resolve();
            });
          }
        });
      });
    }

    const fromNodeId = getQueryValue(req.query.from) ?? getQueryValue(req.query.from_id);
    const toNodeId = getQueryValue(req.query.to) ?? getQueryValue(req.query.to_id);
    const kind = getQueryValue(req.query.kind);
    const sort = getQueryValue(req.query.sort) === 'updated_at' ? 'updated_at' : 'created_at';
    const order = getQueryValue(req.query.order)?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const limitRaw = getQueryValue(req.query.limit) ?? '100';
    const offsetRaw = getQueryValue(req.query.offset);
    const skipRaw = getQueryValue(req.query.skip) ?? '0';
    const cursorRaw = getQueryValue(req.query.cursor);
    const db = await getDbClient(req);

    const parsedLimit = parseInt(limitRaw, 10);
    const parsedOffset = parseInt(cursorRaw ?? offsetRaw ?? skipRaw, 10);
    const limitNum = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 100;
    const offsetNum = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

    // Build account filter
    const accountFilter = req.user && req.user.accountType !== 'admin' ? req.user.accountId : null;

    // SQLite query with account filtering
    let query = 'SELECT e.* FROM edges e';
    const conditions: string[] = [];
    const params: any[] = [];

    // If client account, only show edges where both nodes belong to their account
    if (accountFilter) {
      query += ' INNER JOIN nodes n1 ON e.from_id = n1.id INNER JOIN nodes n2 ON e.to_id = n2.id';
      conditions.push('n1.account_id = ?');
      conditions.push('n2.account_id = ?');
      params.push(accountFilter, accountFilter);
    }

    if (fromNodeId) {
      conditions.push('e.from_id = ?');
      params.push(fromNodeId);
    }
    if (toNodeId) {
      conditions.push('e.to_id = ?');
      params.push(toNodeId);
    }
    if (kind) {
      conditions.push('e.kind = ?');
      params.push(kind);
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
    query += whereClause;
    query += ` ORDER BY e.${sort} ${order} LIMIT ? OFFSET ?`;

    const dataParams = [...params, limitNum, offsetNum];
    const countQuery = `SELECT COUNT(*) as count FROM edges e${
      accountFilter ? ' INNER JOIN nodes n1 ON e.from_id = n1.id INNER JOIN nodes n2 ON e.to_id = n2.id' : ''
    }${whereClause}`;

    const [result, countResult] = await Promise.all([
      db.execute(query, dataParams),
      db.execute(countQuery, params),
    ]);
    const edges = result.records.map((row: any) => ({
      id: row.id,
      from: row.from_id,
      to: row.to_id,
      kind: row.kind,
      created_at: row.created_at,
      properties: parseProperties(row.properties),
    }));
    const total = Number(countResult.records?.[0]?.count || 0);
    const nextCursor = offsetNum + edges.length < total ? String(offsetNum + edges.length) : undefined;

    return res.json({
      edges,
      count: edges.length,
      total,
      metadata: { total, next_cursor: nextCursor },
    });
  } catch (error: any) {
    console.error('List edges error:', error);
    return res.status(500).json({
      error: 'Failed to list edges',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/edges
 * Create a new edge (requires senior permission)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Apply auth if available
    if (requireAuth && requirePermission) {
      await new Promise<void>((resolve, reject) => {
        requireAuth(authService)(req, res, (err: any) => {
          if (err) reject(err);
          else {
            requirePermission('senior')(req, res, (err2: any) => {
              if (err2) reject(err2);
              else resolve();
            });
          }
        });
      });
    }

    // Support both 'from'/'to' and 'from_id'/'to_id' field names
    const { from, to, from_id, to_id, kind, ...metadata } = req.body;
    const fromNodeId = from || from_id;
    const toNodeId = to || to_id;

    if (!fromNodeId || !toNodeId || !kind) {
      return res.status(400).json({
        error: 'Missing required fields: from/from_id, to/to_id, kind',
      });
    }

    const db = await getDbClient(req);

    // Validate kind is allowed
    const allowedKinds = [
      'CONTAINS',
      'SEQUESTERS',
      'DERIVES_FROM',
      'IN_SCOPE_FOR',
      'EQUIVALENT_TO',
      'DUP_OF',
      'SUPPORTS',
      'REFUTES',
      'VERIFIED_BY',
      'OWNED_BY',
    ];

    if (!allowedKinds.includes(kind)) {
      return res.status(400).json({
        error: `Invalid edge kind. Allowed: ${allowedKinds.join(', ')}`,
      });
    }

    // Verify nodes exist
    const fromNode = await db.getNode(fromNodeId);
    const toNode = await db.getNode(toNodeId);

    if (!fromNode || !toNode) {
      return res.status(404).json({
        error: 'Source or target node not found',
      });
    }

    // Check account ownership if auth is enabled
    if (req.user) {
      const fromNodeAccountId = (fromNode as any).account_id;
      const toNodeAccountId = (toNode as any).account_id;

      // Admin accounts can create edges between any nodes
      if (req.user.accountType !== 'admin') {
        // Client accounts can only create edges between their own nodes
        if (fromNodeAccountId !== req.user.accountId || toNodeAccountId !== req.user.accountId) {
          return res.status(403).json({
            error: 'Access denied: You can only create edges between nodes in your account',
          });
        }
      }
    }

    // Create edge
    const edge = {
      id: `edge_${nanoid(12)}`,
      kind,
      from: fromNodeId,
      to: toNodeId,
      created_at: Date.now(),
      metadata,
    };

    // Add account_id and created_by if auth is enabled
    if (req.user) {
      (edge as any).account_id = req.user.accountId;
      (edge as any).created_by = req.user.userId;
    }

    await db.createEdge(edge);

    return res.status(201).json({ success: true, edge });
  } catch (error: any) {
    console.error('Create edge error:', error);
    return res.status(500).json({
      error: 'Failed to create edge',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/v1/edges
 * Delete an edge by source, target, and kind (requires leader permission)
 */
router.delete('/', async (req: Request, res: Response) => {
  try {
    // Apply auth if available
    if (requireAuth && requirePermission && isolateByAccount) {
      await new Promise<void>((resolve, reject) => {
        requireAuth(authService)(req, res, (err: any) => {
          if (err) reject(err);
          else {
            requirePermission('leader')(req, res, (err2: any) => {
              if (err2) reject(err2);
              else {
                isolateByAccount(req, res, (err3: any) => {
                  if (err3) reject(err3);
                  else resolve();
                });
              }
            });
          }
        });
      });
    }

    const fromNodeId = getQueryValue(req.query.from) ?? getQueryValue(req.query.from_id);
    const toNodeId = getQueryValue(req.query.to) ?? getQueryValue(req.query.to_id);
    const kind = getQueryValue(req.query.kind);

    if (!fromNodeId || !toNodeId || !kind) {
      return res.status(400).json({
        error: 'Missing required query params: from/from_id, to/to_id, kind',
      });
    }

    const db = await getDbClient(req);

    // Verify nodes exist and check ownership
    const fromNode = await db.getNode(fromNodeId);
    const toNode = await db.getNode(toNodeId);

    if (!fromNode || !toNode) {
      return res.status(404).json({
        error: 'Source or target node not found',
      });
    }

    // Check account ownership if auth is enabled
    if (req.user) {
      const fromNodeAccountId = (fromNode as any).account_id;
      const toNodeAccountId = (toNode as any).account_id;

      // Admin accounts can delete edges between any nodes
      if (req.user.accountType !== 'admin') {
        // Client accounts can only delete edges between their own nodes
        if (fromNodeAccountId !== req.user.accountId || toNodeAccountId !== req.user.accountId) {
          return res.status(403).json({
            error: 'Access denied: You can only delete edges between nodes in your account',
          });
        }
      }
    }

    let deleted = 0;
    const query = 'DELETE FROM edges WHERE from_id = ? AND to_id = ? AND kind = ?';
    const result = await db.execute(query, [fromNodeId, toNodeId, kind]);
    deleted = (result as any).changes || 0;

    if (deleted === 0) {
      return res.status(404).json({ error: 'Edge not found' });
    }

    return res.json({ success: true, deleted });
  } catch (error: any) {
    console.error('Delete edge error:', error);
    return res.status(500).json({
      error: 'Failed to delete edge',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/edges/node/:nodeId
 * Get all edges connected to a node (with account isolation)
 */
router.get('/node/:nodeId', async (req: Request, res: Response) => {
  try {
    // Apply auth if available
    if (requireAuth && isolateByAccount) {
      await new Promise<void>((resolve, reject) => {
        requireAuth(authService)(req, res, (err: any) => {
          if (err) reject(err);
          else {
            isolateByAccount(req, res, (err2: any) => {
              if (err2) reject(err2);
              else resolve();
            });
          }
        });
      });
    }

    const { nodeId } = req.params;
    const db = await getDbClient(req);

    // Check if node exists
    const node = await db.getNode(nodeId);
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    // Check account ownership if auth is enabled
    if (req.user) {
      const nodeAccountId = (node as any).account_id;

      // Admin accounts can access all nodes
      if (req.user.accountType !== 'admin') {
        // Client accounts can only access their own nodes
        if (nodeAccountId !== req.user.accountId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    // Use the getNodeEdges method if available
    if (db.getNodeEdges) {
      const edges = await db.getNodeEdges(nodeId, 'both');
      const outgoing = edges.filter((e: any) => e.from === nodeId);
      const incoming = edges.filter((e: any) => e.to === nodeId);

      return res.json({
        nodeId,
        outgoing,
        incoming,
        total: edges.length,
      });
    }

    // Fallback: manual query
    const outgoingQuery = 'SELECT * FROM edges WHERE from_id = ?';
    const incomingQuery = 'SELECT * FROM edges WHERE to_id = ?';

    const outgoingResult = await db.execute(outgoingQuery, [nodeId]);
    const incomingResult = await db.execute(incomingQuery, [nodeId]);

    const outgoing = outgoingResult.records.map((row: any) => ({
      id: row.id,
      from: row.from_id,
      to: row.to_id,
      kind: row.kind,
      created_at: row.created_at,
      ...(row.properties ? JSON.parse(row.properties) : {}),
    }));

    const incoming = incomingResult.records.map((row: any) => ({
      id: row.id,
      from: row.from_id,
      to: row.to_id,
      kind: row.kind,
      created_at: row.created_at,
      ...(row.properties ? JSON.parse(row.properties) : {}),
    }));

    return res.json({
      nodeId,
      outgoing,
      incoming,
      total: outgoing.length + incoming.length,
    });
  } catch (error: any) {
    console.error('Get node edges error:', error);
    return res.status(500).json({
      error: 'Failed to get node edges',
      message: error.message,
    });
  }
});

export default router;
