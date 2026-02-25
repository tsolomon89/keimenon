/**
 * Workspace Routes
 *
 * World Model V5: Workspace CRUD endpoints
 * Workspaces are Sources with source_role='workspace' that define working contexts.
 *
 * Key relationships:
 * - CREATED_BY edge: Workspace -> Principal (creator)
 * - ATTACHED_TO edge: Workspace -> Principal (agent)
 * - PINS_CONTEXT edge: Workspace -> Node (context root)
 *
 * Endpoints:
 * - POST /api/v1/workspaces - Create workspace with context_pins and attached_agents
 * - GET /api/v1/workspaces/:id - Get workspace with relationships
 * - GET /api/v1/workspaces - List workspaces for account
 * - PUT /api/v1/workspaces/:id - Update pins/agents
 * - DELETE /api/v1/workspaces/:id - Delete workspace
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { SQLiteClient } from '@keimenon/db';
import { AuthService } from '../services/auth.service';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { getDbClient } from '../utils/get-db-client';

// ============================================================================
// Request Schemas
// ============================================================================

const CreateWorkspaceSchema = z.object({
  title: z.string().min(1, 'Title required'),
  description: z.string().optional(),
  context_pins: z.array(z.string()).default([]), // Node IDs to pin as context
  attached_agents: z.array(z.string()).default([]), // Principal IDs of agents
  purpose: z.enum(['summarize', 'cluster', 'draft', 'research', 'refactor', 'verify', 'general']).default('general'),
  metadata: z.record(z.any()).optional(),
});

const UpdateWorkspaceSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  context_pins: z.array(z.string()).optional(),
  attached_agents: z.array(z.string()).optional(),
  purpose: z.enum(['summarize', 'cluster', 'draft', 'research', 'refactor', 'verify', 'general']).optional(),
  metadata: z.record(z.any()).optional(),
});

// ============================================================================
// Route Factory
// ============================================================================

export function createWorkspaceRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();

  /**
   * POST /api/v1/workspaces
   * Create a new workspace with context pins and attached agents
   */
  router.post('/', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      // Validate request body
      const body = CreateWorkspaceSchema.parse(req.body);
      const accountId = req.user!.accountId;
      const userId = req.user!.userId;

      // Generate workspace (Source) ID
      const workspaceId = `workspace_${nanoid()}`;
      const now = Date.now();

      // Build properties JSON for the Source node
      const properties = JSON.stringify({
        title: body.title,
        description: body.description,
        source_role: 'workspace',
        purpose: body.purpose,
        attached_agents: body.attached_agents,
        context_pins: body.context_pins,
        metadata: body.metadata || {},
        // World Model V5: Full provenance
        provenance: {
          origin_principal_id: userId,
          origin_type: 'user_created',
          origin_ref: workspaceId,
          trust_state: 'ugc',
          retrieved_at: now,
        },
      });

      // Insert Source node with source_role='workspace'
      database.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Source', ?, ?, ?, ?, ?)
      `).run(workspaceId, properties, accountId, userId, now, now);

      // Create CREATED_BY edge (Workspace -> Principal creator)
      const createdByEdgeId = `edge_created_by_${nanoid()}`;
      database.prepare(`
        INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
        VALUES (?, 'CREATED_BY', ?, ?, '{}', ?, ?, ?)
      `).run(createdByEdgeId, workspaceId, userId, accountId, userId, now);

      // Create ATTACHED_TO edges for each agent
      for (const agentId of body.attached_agents) {
        const attachedEdgeId = `edge_attached_${nanoid()}`;
        database.prepare(`
          INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
          VALUES (?, 'ATTACHED_TO', ?, ?, '{}', ?, ?, ?)
        `).run(attachedEdgeId, workspaceId, agentId, accountId, userId, now);
      }

      // Create PINS_CONTEXT edges for each context pin
      for (const pinId of body.context_pins) {
        const pinEdgeId = `edge_pins_${nanoid()}`;
        const pinProps = JSON.stringify({ pin_type: 'explicit' });
        database.prepare(`
          INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
          VALUES (?, 'PINS_CONTEXT', ?, ?, ?, ?, ?, ?)
        `).run(pinEdgeId, workspaceId, pinId, pinProps, accountId, userId, now);
      }

      // Return created workspace
      return res.status(201).json({
        success: true,
        workspace: {
          id: workspaceId,
          kind: 'Source',
          title: body.title,
          description: body.description,
          source_role: 'workspace',
          purpose: body.purpose,
          attached_agents: body.attached_agents,
          context_pins: body.context_pins,
          account_id: accountId,
          created_by: userId,
          created_at: now,
          updated_at: now,
        },
      });
    } catch (error: any) {
      console.error('[Workspaces] Create error:', error);

      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to create workspace',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/workspaces
   * List workspaces for account
   */
  router.get('/', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      const accountId = req.user!.accountId;

      // Parse query params
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      // Query for Source nodes with source_role='workspace'
      const rows = database.prepare(`
        SELECT * FROM nodes
        WHERE kind = 'Source'
          AND account_id = ?
          AND json_extract(properties, '$.source_role') = 'workspace'
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(accountId, limit, offset) as any[];

      // Parse properties and map to response format
      const workspaces = rows.map((row) => {
        const props = JSON.parse(row.properties);
        return {
          id: row.id,
          kind: row.kind,
          title: props.title,
          description: props.description,
          source_role: props.source_role,
          purpose: props.purpose,
          attached_agents: props.attached_agents || [],
          context_pins: props.context_pins || [],
          account_id: row.account_id,
          created_by: row.created_by,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      });

      // Get total count
      const countResult = database.prepare(`
        SELECT COUNT(*) as count FROM nodes
        WHERE kind = 'Source'
          AND account_id = ?
          AND json_extract(properties, '$.source_role') = 'workspace'
      `).get(accountId) as any;

      return res.json({
        success: true,
        workspaces,
        pagination: {
          total: countResult.count,
          limit,
          offset,
        },
      });
    } catch (error: any) {
      console.error('[Workspaces] List error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to list workspaces',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/workspaces/:id
   * Get workspace by ID with relationships
   */
  router.get('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      const { id } = req.params;
      const accountId = req.user!.accountId;

      // F2: Account Boundary - only return workspaces from same account
      const row = database.prepare(`
        SELECT * FROM nodes
        WHERE id = ?
          AND kind = 'Source'
          AND account_id = ?
          AND json_extract(properties, '$.source_role') = 'workspace'
      `).get(id, accountId) as any;

      if (!row) {
        return res.status(404).json({
          success: false,
          error: 'Workspace not found',
        });
      }

      const props = JSON.parse(row.properties);

      // Get related edges
      const createdByEdges = database.prepare(`
        SELECT * FROM edges WHERE kind = 'CREATED_BY' AND from_id = ? AND account_id = ?
      `).all(id, accountId) as any[];

      const attachedToEdges = database.prepare(`
        SELECT * FROM edges WHERE kind = 'ATTACHED_TO' AND from_id = ? AND account_id = ?
      `).all(id, accountId) as any[];

      const pinsContextEdges = database.prepare(`
        SELECT * FROM edges WHERE kind = 'PINS_CONTEXT' AND from_id = ? AND account_id = ?
      `).all(id, accountId) as any[];

      return res.json({
        success: true,
        workspace: {
          id: row.id,
          kind: row.kind,
          title: props.title,
          description: props.description,
          source_role: props.source_role,
          purpose: props.purpose,
          attached_agents: props.attached_agents || [],
          context_pins: props.context_pins || [],
          provenance: props.provenance,
          metadata: props.metadata,
          account_id: row.account_id,
          created_by: row.created_by,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        relationships: {
          created_by: createdByEdges.map((e) => ({ edge_id: e.id, principal_id: e.to_id })),
          attached_to: attachedToEdges.map((e) => ({ edge_id: e.id, agent_id: e.to_id })),
          pins_context: pinsContextEdges.map((e) => ({
            edge_id: e.id,
            node_id: e.to_id,
            pin_type: JSON.parse(e.properties || '{}').pin_type,
          })),
        },
      });
    } catch (error: any) {
      console.error('[Workspaces] Get error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get workspace',
        message: error.message,
      });
    }
  });

  /**
   * PUT /api/v1/workspaces/:id
   * Update workspace (title, description, pins, agents)
   */
  router.put('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      const { id } = req.params;
      const accountId = req.user!.accountId;
      const userId = req.user!.userId;

      // Validate request body
      const updates = UpdateWorkspaceSchema.parse(req.body);

      // F2: Account Boundary
      const row = database.prepare(`
        SELECT * FROM nodes
        WHERE id = ?
          AND kind = 'Source'
          AND account_id = ?
          AND json_extract(properties, '$.source_role') = 'workspace'
      `).get(id, accountId) as any;

      if (!row) {
        return res.status(404).json({
          success: false,
          error: 'Workspace not found',
        });
      }

      const props = JSON.parse(row.properties);
      const now = Date.now();

      // Update properties
      if (updates.title !== undefined) props.title = updates.title;
      if (updates.description !== undefined) props.description = updates.description;
      if (updates.purpose !== undefined) props.purpose = updates.purpose;
      if (updates.metadata !== undefined) props.metadata = updates.metadata;

      // Update context_pins if provided
      if (updates.context_pins !== undefined) {
        // Remove old PINS_CONTEXT edges
        database.prepare(`
          DELETE FROM edges WHERE kind = 'PINS_CONTEXT' AND from_id = ? AND account_id = ?
        `).run(id, accountId);

        // Create new PINS_CONTEXT edges
        for (const pinId of updates.context_pins) {
          const pinEdgeId = `edge_pins_${nanoid()}`;
          const pinProps = JSON.stringify({ pin_type: 'explicit' });
          database.prepare(`
            INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
            VALUES (?, 'PINS_CONTEXT', ?, ?, ?, ?, ?, ?)
          `).run(pinEdgeId, id, pinId, pinProps, accountId, userId, now);
        }

        props.context_pins = updates.context_pins;
      }

      // Update attached_agents if provided
      if (updates.attached_agents !== undefined) {
        // Remove old ATTACHED_TO edges
        database.prepare(`
          DELETE FROM edges WHERE kind = 'ATTACHED_TO' AND from_id = ? AND account_id = ?
        `).run(id, accountId);

        // Create new ATTACHED_TO edges
        for (const agentId of updates.attached_agents) {
          const attachedEdgeId = `edge_attached_${nanoid()}`;
          database.prepare(`
            INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
            VALUES (?, 'ATTACHED_TO', ?, ?, '{}', ?, ?, ?)
          `).run(attachedEdgeId, id, agentId, accountId, userId, now);
        }

        props.attached_agents = updates.attached_agents;
      }

      // Save updated properties
      database.prepare(`
        UPDATE nodes SET properties = ?, updated_at = ?
        WHERE id = ? AND account_id = ?
      `).run(JSON.stringify(props), now, id, accountId);

      return res.json({
        success: true,
        workspace: {
          id: row.id,
          kind: row.kind,
          title: props.title,
          description: props.description,
          source_role: props.source_role,
          purpose: props.purpose,
          attached_agents: props.attached_agents || [],
          context_pins: props.context_pins || [],
          account_id: row.account_id,
          created_by: row.created_by,
          created_at: row.created_at,
          updated_at: now,
        },
      });
    } catch (error: any) {
      console.error('[Workspaces] Update error:', error);

      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to update workspace',
        message: error.message,
      });
    }
  });

  /**
   * DELETE /api/v1/workspaces/:id
   * Delete workspace and associated edges
   */
  router.delete(
    '/:id',
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const dbClient = await getDbClient(req);
        const database = dbClient.getDatabase();
        const { id } = req.params;
        const accountId = req.user!.accountId;

        // F2: Account Boundary
        const row = database.prepare(`
          SELECT * FROM nodes
          WHERE id = ?
            AND kind = 'Source'
            AND account_id = ?
            AND json_extract(properties, '$.source_role') = 'workspace'
        `).get(id, accountId) as any;

        if (!row) {
          return res.status(404).json({
            success: false,
            error: 'Workspace not found',
          });
        }

        // Delete associated edges first
        database.prepare(`
          DELETE FROM edges WHERE (from_id = ? OR to_id = ?) AND account_id = ?
        `).run(id, id, accountId);

        // Delete workspace node
        database.prepare(`
          DELETE FROM nodes WHERE id = ? AND account_id = ?
        `).run(id, accountId);

        return res.json({
          success: true,
          message: 'Workspace deleted successfully',
        });
      } catch (error: any) {
        console.error('[Workspaces] Delete error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to delete workspace',
          message: error.message,
        });
      }
    }
  );

  return router;
}
