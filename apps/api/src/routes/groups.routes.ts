/**
 * Groups Navigation Routes
 *
 * UI-focused routes for folder/group navigation with multi-tenant isolation.
 * Separate from auto-grouping jobs in groups.ts.
 *
 * Contracts:
 * - Folder: hierarchical container (can contain folders or groups)
 * - Group: membership set (manual, smart/query-backed, or cluster)
 * - Edges: FOLDS_INTO_FOLDER (hierarchy), IN_GROUP (membership)
 */

import { Router, Request, Response } from 'express';
import { SQLiteClient } from '@canvas-memory/db';
import { AuthService } from '../services/auth.service';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { randomUUID } from 'crypto';

export function createGroupsRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();

  /**
   * GET /api/v1/groups
   * List root folders and groups (tenant-scoped)
   */
  router.get('/', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX #16-A: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const accountId = (req as any).user.accountId;

      // Get root-level folders and groups (no parent FOLDS_INTO_FOLDER edge)
      const roots = database
        .prepare(
          `
        SELECT
          n.id,
          n.kind,
          n.properties,
          (
            SELECT COUNT(*)
            FROM edges e
            WHERE e.kind = 'FOLDS_INTO_FOLDER'
              AND e.to_id = n.id
              AND e.account_id = ?
          ) as child_count,
          (
            SELECT COUNT(*)
            FROM edges e
            WHERE e.kind = 'IN_GROUP'
              AND e.to_id = n.id
              AND e.account_id = ?
          ) as member_count
        FROM nodes n
        WHERE n.kind IN ('Folder', 'Group')
          AND n.account_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM edges e
            WHERE e.kind = 'FOLDS_INTO_FOLDER'
              AND e.from_id = n.id
              AND e.account_id = ?
          )
        ORDER BY n.kind DESC, json_extract(n.properties, '$.name')
      `
        )
        .all(accountId, accountId, accountId, accountId) as any[];

      // Transform to TreeNode format
      const treeNodes = roots.map((row) => {
        const props = JSON.parse(row.properties);
        const isFolder = row.kind === 'Folder';
        const groupKind = props.group_kind || 'manual';

        // Determine icon
        let icon = 'tag'; // default for manual groups
        if (isFolder) {
          icon = 'folder';
        } else if (groupKind === 'smart') {
          icon = 'filter';
        } else if (groupKind === 'cluster') {
          icon = 'grid';
        }

        return {
          id: row.id,
          label: props.name || props.title || row.id,
          kind: row.kind,
          group_kind: isFolder ? undefined : groupKind,
          icon,
          badge: isFolder ? row.child_count : row.member_count,
          badgeColor: isFolder ? 'slate' : 'blue',
          isLeaf: !isFolder,
          properties: props, // CRITICAL FIX #16: Include parsed properties for API consistency
          metadata: {
            ...props,
            child_count: row.child_count,
            member_count: row.member_count,
          },
        };
      });

      return res.json({
        success: true,
        groups: treeNodes,
        count: treeNodes.length,
      });
    } catch (error: any) {
      console.error('List groups error:', error);
      return res.status(500).json({ error: error.message || 'Failed to list groups' });
    }
  });

  /**
   * GET /api/v1/groups/:id
   * Get folder children OR group members
   */
  router.get('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX #16-A: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const { id } = req.params;
      const accountId = (req as any).user.accountId;

      // Get the group/folder node
      const node = database
        .prepare(
          `
        SELECT * FROM nodes
        WHERE id = ? AND account_id = ?
      `
        )
        .get(id, accountId) as any;

      if (!node) {
        return res.status(404).json({ error: 'Group or folder not found' });
      }

      const props = JSON.parse(node.properties);
      const isFolder = node.kind === 'Folder';

      if (isFolder) {
        // Return children (folders + groups)
        const children = database
          .prepare(
            `
          SELECT
            n.id,
            n.kind,
            n.properties,
            (
              SELECT COUNT(*)
              FROM edges e
              WHERE e.kind = 'FOLDS_INTO_FOLDER'
                AND e.to_id = n.id
                AND e.account_id = ?
            ) as child_count,
            (
              SELECT COUNT(*)
              FROM edges e
              WHERE e.kind = 'IN_GROUP'
                AND e.to_id = n.id
                AND e.account_id = ?
            ) as member_count
          FROM edges f
          JOIN nodes n ON n.id = f.from_id
          WHERE f.kind = 'FOLDS_INTO_FOLDER'
            AND f.to_id = ?
            AND f.account_id = ?
          ORDER BY n.kind DESC, json_extract(n.properties, '$.name')
        `
          )
          .all(accountId, accountId, id, accountId) as any[];

        const treeNodes = children.map((row) => {
          const childProps = JSON.parse(row.properties);
          const isChildFolder = row.kind === 'Folder';
          const groupKind = childProps.group_kind || 'manual';

          let icon = 'tag';
          if (isChildFolder) {
            icon = 'folder';
          } else if (groupKind === 'smart') {
            icon = 'filter';
          } else if (groupKind === 'cluster') {
            icon = 'grid';
          }

          return {
            id: row.id,
            label: childProps.name || childProps.title || row.id,
            kind: row.kind,
            group_kind: isChildFolder ? undefined : groupKind,
            icon,
            badge: isChildFolder ? row.child_count : row.member_count,
            badgeColor: isChildFolder ? 'slate' : 'blue',
            isLeaf: !isChildFolder,
            metadata: {
              ...childProps,
              child_count: row.child_count,
              member_count: row.member_count,
            },
          };
        });

        // CRITICAL FIX #16b: Flatten response structure to match test expectations
        const response = {
          ...node,
          properties: props, // CRITICAL FIX #16: Ensure properties is parsed object, not JSON string
          children: treeNodes,
          count: treeNodes.length,
        };
        console.log(
          '[DEBUG GET /:id FOLDER] Response structure:',
          JSON.stringify(response, null, 2)
        );
        return res.json(response);
      } else {
        // Return group members (node IDs only, for performance)
        const limit = parseInt(req.query.limit as string) || 1000;
        const offset = parseInt(req.query.offset as string) || 0;

        const members = database
          .prepare(
            `
          SELECT n.id, n.kind, n.properties
          FROM edges e
          JOIN nodes n ON n.id = e.from_id
          WHERE e.kind = 'IN_GROUP'
            AND e.to_id = ?
            AND e.account_id = ?
          ORDER BY n.created_at DESC
          LIMIT ? OFFSET ?
        `
          )
          .all(id, accountId, limit, offset) as any[];

        const totalCount = database
          .prepare(
            `
          SELECT COUNT(*) as count
          FROM edges e
          WHERE e.kind = 'IN_GROUP'
            AND e.to_id = ?
            AND e.account_id = ?
        `
          )
          .get(id, accountId) as any;

        // CRITICAL FIX #16b: Flatten response structure to match test expectations
        // Tests expect: response.properties.name (flat structure)
        // Not: response.group.properties.name (nested structure)
        const response = {
          ...node,
          properties: props, // CRITICAL FIX #16: Ensure properties is parsed object, not JSON string
          members: members.map((m) => ({
            id: m.id,
            kind: m.kind,
            ...JSON.parse(m.properties),
          })),
          count: totalCount.count,
          limit,
          offset,
        };
        console.log(
          '[DEBUG GET /:id GROUP] Response structure:',
          JSON.stringify(response, null, 2)
        );
        console.log(
          '[DEBUG GET /:id GROUP] typeof response.properties:',
          typeof response.properties
        );
        return res.json(response);
      }
    } catch (error: any) {
      console.error('Get group error:', error);
      return res.status(500).json({ error: error.message || 'Failed to get group' });
    }
  });

  /**
   * GET /api/v1/groups/:id/nodes
   * Get member nodes (with ?recursive=true for union of descendants)
   */
  router.get('/:id/nodes', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX #16-A: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const { id } = req.params;
      const accountId = (req as any).user.accountId;
      const recursive = req.query.recursive === 'true';

      // Get the group/folder node
      const node = database
        .prepare(
          `
        SELECT * FROM nodes
        WHERE id = ? AND account_id = ?
      `
        )
        .get(id, accountId) as any;

      if (!node) {
        return res.status(404).json({ error: 'Group or folder not found' });
      }

      let nodeIds: string[] = [];

      if (node.kind === 'Group') {
        // Direct group members
        const members = database
          .prepare(
            `
          SELECT e.from_id as node_id
          FROM edges e
          WHERE e.kind = 'IN_GROUP'
            AND e.to_id = ?
            AND e.account_id = ?
        `
          )
          .all(id, accountId) as any[];

        nodeIds = members.map((m) => m.node_id);
      } else if (node.kind === 'Folder' && recursive) {
        // Recursive: get all descendant groups' members
        // Use a CTE to traverse the folder hierarchy
        const descendants = database
          .prepare(
            `
          WITH RECURSIVE folder_tree AS (
            -- Base case: start with the given folder
            SELECT id FROM nodes WHERE id = ? AND account_id = ?
            UNION ALL
            -- Recursive case: find children
            SELECT n.id
            FROM nodes n
            JOIN edges e ON e.from_id = n.id
            JOIN folder_tree ft ON e.to_id = ft.id
            WHERE e.kind = 'FOLDS_INTO_FOLDER' AND e.account_id = ?
          )
          SELECT DISTINCT m.from_id as node_id
          FROM folder_tree ft
          JOIN nodes g ON g.id = ft.id AND g.kind = 'Group'
          JOIN edges m ON m.to_id = g.id AND m.kind = 'IN_GROUP' AND m.account_id = ?
        `
          )
          .all(id, accountId, accountId, accountId) as any[];

        nodeIds = descendants.map((d) => d.node_id);
      }

      // CRITICAL FIX #16: Fetch full node data, not just IDs
      const nodes =
        nodeIds.length > 0
          ? (database
              .prepare(
                `
            SELECT * FROM nodes
            WHERE id IN (${nodeIds.map(() => '?').join(',')})
              AND account_id = ?
          `
              )
              .all(...nodeIds, accountId) as any[])
          : [];

      // Parse properties field for each node
      const parsedNodes = nodes.map((n) => ({
        ...n,
        properties: JSON.parse(n.properties),
      }));

      return res.json({
        success: true,
        nodes: parsedNodes, // Return full nodes with parsed properties
        node_ids: nodeIds, // Keep node_ids for backward compatibility
        count: nodeIds.length,
      });
    } catch (error: any) {
      console.error('Get group nodes error:', error);
      return res.status(500).json({ error: error.message || 'Failed to get group nodes' });
    }
  });

  /**
   * POST /api/v1/groups
   * Create a new folder or group
   */
  router.post('/', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX #16-A: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      // CRITICAL FIX #13: Support both formats - properties object AND top-level fields
      // Test format: { kind: 'Group', properties: { name, ... }, member_ids: [] }
      // UI format: { name, kind, group_kind, parentId, query }
      const { kind, group_kind, parentId, query, member_ids } = req.body;
      const propsFromBody = req.body.properties || {};
      const name = req.body.name || propsFromBody.name;

      const accountId = (req as any).user.accountId;
      const userId = (req as any).user.userId;

      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      if (!kind || !['Folder', 'Group'].includes(kind)) {
        return res.status(400).json({ error: 'kind must be Folder or Group' });
      }

      const now = Date.now();
      const groupId = randomUUID();

      // Create node - merge properties from both sources
      const properties = {
        id: groupId,
        kind,
        name,
        group_kind:
          kind === 'Group' ? group_kind || propsFromBody.group_kind || 'manual' : undefined,
        query: query || propsFromBody.query || undefined,
        ...propsFromBody, // Merge any additional properties (description, data_tag, etc.)
        created_at: now,
        updated_at: now,
      };

      database
        .prepare(
          `
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(groupId, kind, JSON.stringify(properties), accountId, userId, now, now);

      // If parentId provided, create FOLDS_INTO_FOLDER edge
      if (parentId) {
        const edgeId = randomUUID();
        database
          .prepare(
            `
          INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            edgeId,
            'FOLDS_INTO_FOLDER',
            groupId,
            parentId,
            JSON.stringify({}),
            accountId,
            userId,
            now
          );
      }

      // CRITICAL FIX #13 (continued): Handle member_ids array to create IN_GROUP edges
      if (member_ids && Array.isArray(member_ids) && kind === 'Group') {
        for (const nodeId of member_ids) {
          // Verify node exists and belongs to same account (security check)
          const nodeOwnership = database
            .prepare(
              `
            SELECT id FROM nodes
            WHERE id = ? AND account_id = ?
          `
            )
            .get(nodeId, accountId);

          if (nodeOwnership) {
            const edgeId = randomUUID();
            database
              .prepare(
                `
              INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `
              )
              .run(edgeId, 'IN_GROUP', nodeId, groupId, JSON.stringify({}), accountId, userId, now);
          }
        }
      }

      // Audit log
      database
        .prepare(
          `
        INSERT INTO audit_log (
          id, actor_user_id, actor_account_id, target_account_id,
          action, resource_type, resource_id, mode, success, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(randomUUID(), userId, accountId, accountId, 'create', kind, groupId, 'native', 1, now);

      return res.json({
        success: true,
        group: properties,
      });
    } catch (error: any) {
      console.error('Create group error:', error);
      return res.status(500).json({ error: error.message || 'Failed to create group' });
    }
  });

  /**
   * PATCH /api/v1/groups/:id
   * Update folder/group (rename, move, update query)
   */
  router.patch('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX #16-A: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const { id } = req.params;
      const { name, parentId, query } = req.body;
      const accountId = (req as any).user.accountId;
      const userId = (req as any).user.userId;

      // Get existing node
      const existing = database
        .prepare(
          `
        SELECT * FROM nodes
        WHERE id = ? AND account_id = ?
      `
        )
        .get(id, accountId) as any;

      if (!existing) {
        return res.status(404).json({ error: 'Group or folder not found' });
      }

      const props = JSON.parse(existing.properties);
      const now = Date.now();

      // Update properties
      if (name !== undefined) props.name = name;
      if (query !== undefined) props.query = query;
      props.updated_at = now;

      database
        .prepare(
          `
        UPDATE nodes
        SET properties = ?, updated_at = ?
        WHERE id = ? AND account_id = ?
      `
        )
        .run(JSON.stringify(props), now, id, accountId);

      // Handle parent change
      if (parentId !== undefined) {
        // Remove existing FOLDS_INTO_FOLDER edge
        database
          .prepare(
            `
          DELETE FROM edges
          WHERE kind = 'FOLDS_INTO_FOLDER'
            AND from_id = ?
            AND account_id = ?
        `
          )
          .run(id, accountId);

        // Add new edge if parentId is not null
        if (parentId) {
          const edgeId = randomUUID();
          database
            .prepare(
              `
            INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `
            )
            .run(
              edgeId,
              'FOLDS_INTO_FOLDER',
              id,
              parentId,
              JSON.stringify({}),
              accountId,
              userId,
              now
            );
        }
      }

      // Audit log
      database
        .prepare(
          `
        INSERT INTO audit_log (
          id, actor_user_id, actor_account_id, target_account_id,
          action, resource_type, resource_id, mode, success, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          randomUUID(),
          userId,
          accountId,
          accountId,
          'update',
          existing.kind,
          id,
          'native',
          1,
          now
        );

      return res.json({
        success: true,
        group: props,
      });
    } catch (error: any) {
      console.error('Update group error:', error);
      return res.status(500).json({ error: error.message || 'Failed to update group' });
    }
  });

  /**
   * DELETE /api/v1/groups/:id
   * Delete folder/group (cascade edges via foreign keys)
   */
  router.delete('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX #16-A: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const { id } = req.params;
      const accountId = (req as any).user.accountId;
      const userId = (req as any).user.userId;

      // Get node to verify ownership and for audit log
      const node = database
        .prepare(
          `
        SELECT * FROM nodes
        WHERE id = ? AND account_id = ?
      `
        )
        .get(id, accountId) as any;

      if (!node) {
        return res.status(404).json({ error: 'Group or folder not found' });
      }

      const now = Date.now();

      // Delete node (edges cascade automatically via foreign keys)
      database
        .prepare(
          `
        DELETE FROM nodes
        WHERE id = ? AND account_id = ?
      `
        )
        .run(id, accountId);

      // Audit log
      database
        .prepare(
          `
        INSERT INTO audit_log (
          id, actor_user_id, actor_account_id, target_account_id,
          action, resource_type, resource_id, mode, success, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(randomUUID(), userId, accountId, accountId, 'delete', node.kind, id, 'native', 1, now);

      return res.json({
        success: true,
        message: `${node.kind} deleted`,
        id,
      });
    } catch (error: any) {
      console.error('Delete group error:', error);
      return res.status(500).json({ error: error.message || 'Failed to delete group' });
    }
  });

  /**
   * GET /api/v1/groups/nodes/:nodeId/groups
   * Reverse lookup: Get all groups that contain this node
   * Used for Canvas ↔ Navigation bidirectional sync
   */
  router.get(
    '/nodes/:nodeId/groups',
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        // CRITICAL FIX #16-A: Get per-request database client for test isolation
        const { getDbClient } = await import('../utils/get-db-client');
        const dbClient = await getDbClient(req);
        const database = dbClient.getDatabase();

        const { nodeId } = req.params;
        const accountId = (req as any).user.accountId;

        // Find all groups that contain this node (IN_GROUP edges)
        const groups = database
          .prepare(
            `
        SELECT
          g.id,
          g.kind,
          g.properties
        FROM edges e
        JOIN nodes g ON g.id = e.to_id
        WHERE e.kind = 'IN_GROUP'
          AND e.from_id = ?
          AND e.account_id = ?
          AND g.kind = 'Group'
      `
          )
          .all(nodeId, accountId) as any[];

        const groupList = groups.map((g) => ({
          id: g.id,
          kind: g.kind,
          ...JSON.parse(g.properties),
        }));

        return res.json({
          success: true,
          node_id: nodeId,
          groups: groupList,
          count: groupList.length,
        });
      } catch (error: any) {
        console.error('Get node groups error:', error);
        return res.status(500).json({ error: error.message || 'Failed to get node groups' });
      }
    }
  );

  /**
   * POST /api/v1/groups/:id/members:batch
   * Batch add/remove IN_GROUP edges (manual curation)
   */
  router.post(
    '/:id/members:batch',
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        // CRITICAL FIX #16-A: Get per-request database client for test isolation
        const { getDbClient } = await import('../utils/get-db-client');
        const dbClient = await getDbClient(req);
        const database = dbClient.getDatabase();

        const { id } = req.params;
        const { add, remove } = req.body;
        const accountId = (req as any).user.accountId;
        const userId = (req as any).user.userId;

        // Verify group exists and user has access
        const group = database
          .prepare(
            `
        SELECT * FROM nodes
        WHERE id = ? AND account_id = ? AND kind = 'Group'
      `
          )
          .get(id, accountId) as any;

        if (!group) {
          return res.status(404).json({ error: 'Group not found' });
        }

        const now = Date.now();
        let addedCount = 0;
        let removedCount = 0;

        // Add members
        if (add && Array.isArray(add)) {
          // CRITICAL FIX #16b: Validate ALL nodes upfront before adding any
          // This prevents partial success and ensures atomic operation
          for (const nodeId of add) {
            const nodeOwnership = database
              .prepare(
                `
            SELECT id FROM nodes
            WHERE id = ? AND account_id = ?
          `
              )
              .get(nodeId, accountId);

            if (!nodeOwnership) {
              // Node doesn't exist or belongs to different account - return error
              return res.status(403).json({
                error: 'Cannot add nodes from a different account',
                details: 'All nodes must belong to the same account as the group',
              });
            }
          }

          // All nodes validated - now add them
          for (const nodeId of add) {
            // Check if edge already exists
            const existing = database
              .prepare(
                `
            SELECT id FROM edges
            WHERE kind = 'IN_GROUP'
              AND from_id = ?
              AND to_id = ?
              AND account_id = ?
          `
              )
              .get(nodeId, id, accountId);

            if (!existing) {
              const edgeId = randomUUID();
              database
                .prepare(
                  `
              INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `
                )
                .run(edgeId, 'IN_GROUP', nodeId, id, JSON.stringify({}), accountId, userId, now);
              addedCount++;
            }
          }
        }

        // Remove members
        if (remove && Array.isArray(remove)) {
          for (const nodeId of remove) {
            const result = database
              .prepare(
                `
            DELETE FROM edges
            WHERE kind = 'IN_GROUP'
              AND from_id = ?
              AND to_id = ?
              AND account_id = ?
          `
              )
              .run(nodeId, id, accountId);

            if (result.changes > 0) {
              removedCount++;
            }
          }
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
            userId,
            accountId,
            accountId,
            'update',
            'Group',
            id,
            'native',
            1,
            JSON.stringify({ added: addedCount, removed: removedCount }),
            now
          );

        return res.json({
          success: true,
          added: addedCount,
          removed: removedCount,
        });
      } catch (error: any) {
        console.error('Batch update members error:', error);
        return res.status(500).json({ error: error.message || 'Failed to update members' });
      }
    }
  );

  return router;
}
