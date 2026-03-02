import { Router, Request, Response } from 'express';
import { BoardSchema } from '@keimenon/types';
import { nanoid } from 'nanoid';
import { getDbClient } from '../utils/get-db-client';

const router = Router();

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
 * GET /api/v1/boards
 * List all boards for a workspace (with account isolation)
 */
router.get('/', async (req: Request, res: Response) => {
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

    const { workspace_id = 'default_workspace' } = req.query;
    const db = await getDbClient(req);

    // Build account filter
    const accountFilter = req.user && req.user.accountType !== 'admin' ? req.user.accountId : null;

    // SQLite query with account filtering
    let query = `
      SELECT * FROM nodes
      WHERE kind = 'Board'
      AND json_extract(properties, '$.workspace_id') = ?
    `;
    const params: any[] = [workspace_id];

    if (accountFilter) {
      query += ' AND account_id = ?';
      params.push(accountFilter);
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.execute(query, params);
    const boards = result.records.map((row: any) => JSON.parse(row.properties));

    return res.json({ boards, count: boards.length });
  } catch (error: any) {
    console.error('List boards error:', error);
    return res.status(500).json({
      error: 'Failed to list boards',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/boards/:id
 * Get a board by ID (with account isolation)
 */
router.get('/:id', async (req: Request, res: Response) => {
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

    const { id } = req.params;
    const db = await getDbClient(req);

    const board = await db.getNode(id);

    if (!board || board.kind !== 'Board') {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Check account ownership if auth is enabled
    if (req.user) {
      const boardAccountId = (board as any).account_id;

      // Admin accounts can access all boards
      if (req.user.accountType !== 'admin') {
        // Client accounts can only access their own boards
        if (boardAccountId !== req.user.accountId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    return res.json({ board });
  } catch (error: any) {
    console.error('Get board error:', error);
    return res.status(500).json({
      error: 'Failed to get board',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/boards/:id/graph
 * Get full graph for a board (nodes + edges) (with account isolation)
 */
router.get('/:id/graph', async (req: Request, res: Response) => {
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

    const { id } = req.params;
    const { limit = 1000 } = req.query;
    const db = await getDbClient(req);

    // Check if board exists and user has access
    const board = await db.getNode(id);
    if (!board || board.kind !== 'Board') {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Check account ownership if auth is enabled
    if (req.user) {
      const boardAccountId = (board as any).account_id;

      // Admin accounts can access all boards
      if (req.user.accountType !== 'admin') {
        // Client accounts can only access their own boards
        if (boardAccountId !== req.user.accountId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    const limitNum = parseInt(limit as string, 10);
    let edges: any[];
    // Build account filter
    const accountFilter = req.user && req.user.accountType !== 'admin' ? req.user.accountId : null;

    // SQLite query for nodes with account filtering
    // Exclude the Board node itself by checking that board_id equals the requested board
    // Note: board_id is stored in metadata, not properties
    let nodesQuery = `
      SELECT * FROM nodes
      WHERE json_extract(properties, '$.metadata.board_id') = ?
        AND kind != 'Board'
    `;
    const nodesParams: any[] = [id];

    if (accountFilter) {
      nodesQuery += ' AND account_id = ?';
      nodesParams.push(accountFilter);
    }

    nodesQuery += ' ORDER BY created_at DESC LIMIT ?';
    nodesParams.push(limitNum);

    const nodesResult = await db.execute(nodesQuery, nodesParams);
    const nodes = nodesResult.records.map((row: any) => {
      const props = JSON.parse(row.properties);
      return props;
    });

    // Get node IDs
    const nodeIds = nodes.map((n: any) => n.id);

    // SQLite query for edges between these nodes
    if (nodeIds.length > 0) {
      const placeholders = nodeIds.map(() => '?').join(',');
      const edgesQuery = `
        SELECT * FROM edges
        WHERE from_id IN (${placeholders})
        AND to_id IN (${placeholders})
        LIMIT ?
      `;
      const edgesResult = await db.execute(edgesQuery, [...nodeIds, ...nodeIds, limitNum]);
      edges = edgesResult.records.map((row: any) => ({
        id: row.id,
        source: row.from_id,
        target: row.to_id,
        kind: row.kind,
        ...(row.properties ? JSON.parse(row.properties) : {}),
      }));
    } else {
      edges = [];
    }

    return res.json({
      board_id: id,
      nodes,
      edges,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
    });
  } catch (error: any) {
    console.error('Get board graph error:', error);
    return res.status(500).json({
      error: 'Failed to get board graph',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/boards
 * Create a new board (requires senior permission)
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

    // Validate required fields
    if (!req.body.name || req.body.name.trim() === '') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Board name is required',
      });
    }

    const boardData = {
      id: `board_${nanoid(12)}`,
      kind: 'Board',
      workspace_id: req.body.workspace_id || 'default_workspace',
      name: req.body.name,
      description: req.body.description || null,
      created_at: Date.now(),
      updated_at: Date.now(),
      settings: req.body.settings || { default_lens: '2D' },
    };

    const board = BoardSchema.parse(boardData);
    const db = await getDbClient(req);

    // Add account_id and created_by if auth is enabled
    if (req.user) {
      (board as any).account_id = req.user.accountId;
      (board as any).created_by = req.user.userId;
    }

    await db.createNode(board);

    return res.status(201).json({ success: true, board });
  } catch (error: any) {
    console.error('Create board error:', error);
    return res.status(500).json({
      error: 'Failed to create board',
      message: error.message,
    });
  }
});

/**
 * PUT /api/v1/boards/:id
 * Update a board (requires senior permission)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    // Apply auth if available
    if (requireAuth && requirePermission && isolateByAccount) {
      await new Promise<void>((resolve, reject) => {
        requireAuth(authService)(req, res, (err: any) => {
          if (err) reject(err);
          else {
            requirePermission('senior')(req, res, (err2: any) => {
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

    const { id } = req.params;
    const { name, description, settings } = req.body;
    const db = await getDbClient(req);

    // Get existing board
    const board = await db.getNode(id);
    if (!board || board.kind !== 'Board') {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Check account ownership if auth is enabled
    if (req.user) {
      const boardAccountId = (board as any).account_id;

      // Admin accounts can update all boards
      if (req.user.accountType !== 'admin') {
        // Client accounts can only update their own boards
        if (boardAccountId !== req.user.accountId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    // Update fields
    if (name !== undefined) board.name = name;
    if (description !== undefined) board.description = description;
    if (settings !== undefined) board.settings = settings;
    board.updated_at = Date.now();

    // Save updated node
    const query = `
      UPDATE nodes
      SET properties = ?, updated_at = ?
      WHERE id = ?
    `;
    await db.execute(query, [JSON.stringify(board), board.updated_at, id]);

    return res.json({ success: true, board });
  } catch (error: any) {
    console.error('Update board error:', error);
    return res.status(500).json({
      error: 'Failed to update board',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/v1/boards/:id
 * Delete a board (and optionally its contents) (requires leader permission)
 */
router.delete('/:id', async (req: Request, res: Response) => {
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

    const { id } = req.params;
    const { delete_contents = false } = req.query;
    const db = await getDbClient(req);

    // Check if board exists
    const board = await db.getNode(id);
    if (!board || board.kind !== 'Board') {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Check account ownership if auth is enabled
    if (req.user) {
      const boardAccountId = (board as any).account_id;

      // Admin accounts can delete all boards
      if (req.user.accountType !== 'admin') {
        // Client accounts can only delete their own boards
        if (boardAccountId !== req.user.accountId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    if (delete_contents === 'true') {
      // Delete board and all its nodes
      // Count nodes before deletion (check both metadata and properties)
      const countQuery = `
        SELECT COUNT(*) as count FROM nodes
        WHERE json_extract(properties, '$.metadata.board_id') = ?
      `;
      const countResult = await db.execute(countQuery, [id]);
      const nodesDeleted = countResult.records[0].count;

      // Delete nodes with this board_id
      const deleteNodesQuery = `
        DELETE FROM nodes
        WHERE json_extract(properties, '$.metadata.board_id') = ?
      `;
      await db.execute(deleteNodesQuery, [id]);

      // Delete the board itself
      await db.execute('DELETE FROM nodes WHERE id = ?', [id]);

      return res.json({
        success: true,
        deleted: { board: 1, nodes: nodesDeleted },
      });
    } else {
      // Just delete board, keep nodes
      await db.execute('DELETE FROM nodes WHERE id = ?', [id]);
      return res.json({ success: true, deleted: 1 });
    }
  } catch (error: any) {
    console.error('Delete board error:', error);
    return res.status(500).json({
      error: 'Failed to delete board',
      message: error.message,
    });
  }
});

export default router;
