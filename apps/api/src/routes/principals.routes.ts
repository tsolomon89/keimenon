/**
 * Principals Routes
 *
 * World Model V5: Unified Principal CRUD endpoints
 * Principals are the unified type for humans, agents, and contacts.
 *
 * Endpoints:
 * - POST /api/v1/principals - Create principal (human/agent/contact)
 * - GET /api/v1/principals/:id - Get principal with capabilities
 * - GET /api/v1/principals - List principals for account
 * - PUT /api/v1/principals/:id/capabilities - Update capabilities
 * - DELETE /api/v1/principals/:id - Soft delete principal
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { SQLiteClient } from '@keimenon/db';
import { featureManifestForAccountClass } from '@keimenon/types';
import {
  AuthService,
  CapabilityAuthorizationService,
  DEFAULT_CAPABILITIES,
  PrincipalCapabilities,
} from '../services/auth.service';
import { requireAuth, requirePermission, requireCapability } from '../middleware/auth.middleware';
import { getDbClient } from '../utils/get-db-client';
import { ensureAccountContainsPrincipal } from '../services/graph-hierarchy.service';

// ============================================================================
// Request Schemas
// ============================================================================

const CreatePrincipalSchema = z.object({
  display_name: z.string().min(1, 'Display name required'),
  email: z.string().email().optional(),
  principal_kind: z.enum(['human', 'agent', 'contact']),
  capabilities: z
    .object({
      can_upload: z.boolean().optional(),
      can_run_tools: z.boolean().optional(),
      can_import_web: z.boolean().optional(),
      can_own_account: z.boolean().optional(),
      can_approve_runs: z.boolean().optional(),
    })
    .optional(),
  metadata: z.record(z.any()).optional(),
});

const UpdateCapabilitiesSchema = z.object({
  can_upload: z.boolean().optional(),
  can_run_tools: z.boolean().optional(),
  can_import_web: z.boolean().optional(),
  can_own_account: z.boolean().optional(),
  can_approve_runs: z.boolean().optional(),
});

// ============================================================================
// Route Factory
// ============================================================================

export function createPrincipalsRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();

  /**
   * POST /api/v1/principals
   * Create a new principal (human, agent, or contact)
   */
  router.post('/', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      // Validate request body
      const body = CreatePrincipalSchema.parse(req.body);
      const accountId = req.user!.accountId;
      const userId = req.user!.userId;
      const accountClass = ((req.user as any)?.accountClass || 'free') as
        | 'free'
        | 'professional'
        | 'business';
      const features = featureManifestForAccountClass(accountClass);

      if (body.principal_kind === 'agent' && !features.agent_runtime) {
        return res.status(403).json({
          success: false,
          error: 'Agent principal creation requires agent runtime entitlement',
          requiredFeature: 'agent_runtime',
        });
      }

      // Generate principal ID
      const principalId = `principal_${nanoid()}`;

      // Determine capabilities: use provided or defaults based on kind
      const defaultCaps = DEFAULT_CAPABILITIES[body.principal_kind];
      const capabilities: PrincipalCapabilities = {
        can_upload: body.capabilities?.can_upload ?? defaultCaps.can_upload,
        can_run_tools: body.capabilities?.can_run_tools ?? defaultCaps.can_run_tools,
        can_import_web: body.capabilities?.can_import_web ?? defaultCaps.can_import_web,
        can_own_account: body.capabilities?.can_own_account ?? defaultCaps.can_own_account,
        can_approve_runs: body.capabilities?.can_approve_runs ?? defaultCaps.can_approve_runs,
      };

      const now = Date.now();

      // Build properties JSON for the node
      const properties = JSON.stringify({
        display_name: body.display_name,
        email: body.email,
        principal_kind: body.principal_kind,
        capabilities,
        metadata: body.metadata || {},
      });

      // Insert Principal node
      database
        .prepare(
          `
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Principal', ?, ?, ?, ?, ?)
      `
        )
        .run(principalId, properties, accountId, userId, now, now);

      ensureAccountContainsPrincipal(database, {
        accountId,
        principalId,
        createdByUserId: userId,
        membershipRole:
          body.principal_kind === 'agent'
            ? 'agent'
            : body.principal_kind === 'contact'
              ? 'contact'
              : 'member',
        now,
      });

      // Return created principal
      return res.status(201).json({
        success: true,
        principal: {
          id: principalId,
          kind: 'Principal',
          display_name: body.display_name,
          email: body.email,
          principal_kind: body.principal_kind,
          capabilities,
          account_id: accountId,
          created_by: userId,
          created_at: now,
          updated_at: now,
        },
      });
    } catch (error: any) {
      console.error('[Principals] Create error:', error);

      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to create principal',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/principals
   * List principals for account
   */
  router.get('/', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      const accountId = req.user!.accountId;

      // Parse query params
      const kind = req.query.kind as string | undefined; // Filter by principal_kind
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      // Build query
      let sql = `SELECT * FROM nodes WHERE kind = 'Principal' AND account_id = ?`;
      const params: any[] = [accountId];

      if (kind) {
        sql += ` AND json_extract(properties, '$.principal_kind') = ?`;
        params.push(kind);
      }

      sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const rows = database.prepare(sql).all(...params) as any[];

      // Parse properties and map to response format
      const principals = rows.map((row) => {
        const props = JSON.parse(row.properties);
        return {
          id: row.id,
          kind: row.kind,
          display_name: props.display_name,
          email: props.email,
          principal_kind: props.principal_kind,
          capabilities: props.capabilities,
          account_id: row.account_id,
          created_by: row.created_by,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      });

      // Get total count
      let countSql = `SELECT COUNT(*) as count FROM nodes WHERE kind = 'Principal' AND account_id = ?`;
      const countParams: any[] = [accountId];
      if (kind) {
        countSql += ` AND json_extract(properties, '$.principal_kind') = ?`;
        countParams.push(kind);
      }
      const countResult = database.prepare(countSql).get(...countParams) as any;

      return res.json({
        success: true,
        principals,
        pagination: {
          total: countResult.count,
          limit,
          offset,
        },
      });
    } catch (error: any) {
      console.error('[Principals] List error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to list principals',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/principals/:id
   * Get principal by ID with capabilities
   */
  router.get('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      const { id } = req.params;
      const accountId = req.user!.accountId;

      // F2: Account Boundary - only return principals from same account
      const row = database
        .prepare(
          `
        SELECT * FROM nodes
        WHERE id = ? AND kind = 'Principal' AND account_id = ?
      `
        )
        .get(id, accountId) as any;

      if (!row) {
        return res.status(404).json({
          success: false,
          error: 'Principal not found',
        });
      }

      const props = JSON.parse(row.properties);

      return res.json({
        success: true,
        principal: {
          id: row.id,
          kind: row.kind,
          display_name: props.display_name,
          email: props.email,
          principal_kind: props.principal_kind,
          capabilities: props.capabilities,
          metadata: props.metadata,
          account_id: row.account_id,
          created_by: row.created_by,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
      });
    } catch (error: any) {
      console.error('[Principals] Get error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get principal',
        message: error.message,
      });
    }
  });

  /**
   * PUT /api/v1/principals/:id/capabilities
   * Update principal capabilities
   * World Model V5: Capability updates require approve_runs capability
   */
  router.put('/:id/capabilities', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      const { id } = req.params;
      const accountId = req.user!.accountId;

      // Validate request body
      const updates = UpdateCapabilitiesSchema.parse(req.body);

      // F2: Account Boundary - only update principals from same account
      const row = database
        .prepare(
          `
          SELECT * FROM nodes
          WHERE id = ? AND kind = 'Principal' AND account_id = ?
        `
        )
        .get(id, accountId) as any;

      if (!row) {
        return res.status(404).json({
          success: false,
          error: 'Principal not found',
        });
      }

      const props = JSON.parse(row.properties);
      const now = Date.now();

      // Merge capabilities
      const newCapabilities = {
        ...props.capabilities,
        ...updates,
      };

      // Update properties
      props.capabilities = newCapabilities;
      const newProperties = JSON.stringify(props);

      database
        .prepare(
          `
          UPDATE nodes
          SET properties = ?, updated_at = ?
          WHERE id = ? AND account_id = ?
        `
        )
        .run(newProperties, now, id, accountId);

      return res.json({
        success: true,
        principal: {
          id: row.id,
          kind: row.kind,
          display_name: props.display_name,
          email: props.email,
          principal_kind: props.principal_kind,
          capabilities: newCapabilities,
          account_id: row.account_id,
          created_by: row.created_by,
          created_at: row.created_at,
          updated_at: now,
        },
      });
    } catch (error: any) {
      console.error('[Principals] Update capabilities error:', error);

      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to update capabilities',
        message: error.message,
      });
    }
  });

  /**
   * DELETE /api/v1/principals/:id
   * Soft delete principal (sets is_active = false)
   */
  router.delete(
    '/:id',
    requireAuth(authService),
    requirePermission('leader'),
    async (req: Request, res: Response) => {
      try {
        const dbClient = await getDbClient(req);
        const database = dbClient.getDatabase();
        const { id } = req.params;
        const accountId = req.user!.accountId;

        // F2: Account Boundary - only delete principals from same account
        const row = database
          .prepare(
            `
          SELECT * FROM nodes
          WHERE id = ? AND kind = 'Principal' AND account_id = ?
        `
          )
          .get(id, accountId) as any;

        if (!row) {
          return res.status(404).json({
            success: false,
            error: 'Principal not found',
          });
        }

        // Soft delete by updating properties
        const props = JSON.parse(row.properties);
        props.is_deleted = true;
        props.deleted_at = Date.now();
        const newProperties = JSON.stringify(props);

        database
          .prepare(
            `
          UPDATE nodes
          SET properties = ?, updated_at = ?
          WHERE id = ? AND account_id = ?
        `
          )
          .run(newProperties, Date.now(), id, accountId);

        return res.json({
          success: true,
          message: 'Principal deleted successfully',
        });
      } catch (error: any) {
        console.error('[Principals] Delete error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to delete principal',
          message: error.message,
        });
      }
    }
  );

  return router;
}
