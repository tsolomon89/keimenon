/**
 * Conversations Routes
 *
 * World Model V5: ConversationThread CRUD endpoints
 * Conversations are formal joins: (human_principal, agent_principal, context_set, purpose)
 *
 * Key relationships:
 * - INITIATED_BY edge: ConversationThread -> Principal (human who started)
 * - PARTICIPATED_IN edge: Principal -> ConversationThread (participant)
 *
 * Falsification Test F4: Context-Set Legibility
 * - Every chat UI must show agent identity, context set, and run attribution
 *
 * Endpoints:
 * - POST /api/v1/conversations - Create thread with human/agent/context/purpose
 * - GET /api/v1/conversations/:id - Get with resolved principal names
 * - GET /api/v1/conversations - List by principal_id
 * - PUT /api/v1/conversations/:id/context - Update context_spec
 * - DELETE /api/v1/conversations/:id - Delete conversation
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { SQLiteClient } from '@keimenon/db';
import { featureManifestForAccountClass } from '@keimenon/types';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { getDbClient } from '../utils/get-db-client';
import {
  ensureAccountContainsPrincipal,
  ensureHumanPrincipalHierarchyForUser,
} from '../services/graph-hierarchy.service';
import { ConversationContextService } from '../services/conversation-context.service';
import { ConversationMessageService } from '../services/conversation-message.service';

// ============================================================================
// Request Schemas
// ============================================================================

const ContextSpecSchema = z.object({
  source_ids: z.array(z.string()).default([]),
  group_ids: z.array(z.string()).default([]),
  workspace_id: z.string().optional(),
  include_pinned: z.boolean().default(true),
  expansion_rule: z.enum(['none', 'neighbors', 'connected']).default('none'),
});

const CreateConversationSchema = z.object({
  title: z.string().min(1, 'Title required'),
  human_principal_id: z.string().optional(), // Defaults to current user's principal
  agent_principal_id: z.string().optional(),
  purpose: z
    .enum(['summarize', 'cluster', 'draft', 'research', 'refactor', 'verify', 'general'])
    .default('general'),
  context_spec: ContextSpecSchema.optional(),
  system_preamble: z.string().optional(),
  persona: z
    .object({
      name: z.string(),
      model: z.string(),
      tools_allowed: z.array(z.string()),
    })
    .optional(),
  metadata: z.record(z.any()).optional(),
});

const UpdateContextSchema = z.object({
  context_spec: ContextSpecSchema,
});

const PostMessageSchema = z.object({
  content: z.string().min(1, 'Message content required'),
  run_synthesis: z.boolean().optional().default(true),
});

type ContextSpec = z.infer<typeof ContextSpecSchema>;

interface PrincipalRow {
  id: string;
  properties: string;
}

function parsePrincipalProperties(row: PrincipalRow): Record<string, any> {
  try {
    return JSON.parse(row.properties || '{}');
  } catch {
    return {};
  }
}

function getPrincipalRow(
  database: any,
  accountId: string,
  principalId: string
): PrincipalRow | null {
  const row = database
    .prepare(
      `
        SELECT id, properties
        FROM nodes
        WHERE id = ? AND kind = 'Principal' AND account_id = ?
      `
    )
    .get(principalId, accountId) as PrincipalRow | undefined;
  return row || null;
}

function assertNodeIdsInAccountByKinds(
  database: any,
  accountId: string,
  nodeIds: string[],
  kinds: string[],
  label: string
): void {
  if (nodeIds.length === 0) {
    return;
  }

  const placeholders = nodeIds.map(() => '?').join(', ');
  const kindPlaceholders = kinds.map(() => '?').join(', ');
  const rows = database
    .prepare(
      `
        SELECT id
        FROM nodes
        WHERE account_id = ?
          AND id IN (${placeholders})
          AND kind IN (${kindPlaceholders})
      `
    )
    .all(accountId, ...nodeIds, ...kinds) as Array<{ id: string }>;

  const found = new Set(rows.map((row) => row.id));
  const missing = nodeIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`Invalid ${label} references for account scope: ${missing.join(', ')}`);
  }
}

function normalizeContextSpec(input: unknown): ContextSpec {
  const parsed = ContextSpecSchema.safeParse(input);
  return parsed.success ? parsed.data : ContextSpecSchema.parse({});
}

function validateContextSpec(
  database: any,
  accountId: string,
  contextSpec: ContextSpec
): ContextSpec {
  assertNodeIdsInAccountByKinds(
    database,
    accountId,
    contextSpec.source_ids,
    ['Source', 'SourceDoc', 'UnifiedDoc', 'VerifiedSource'],
    'source_ids'
  );
  assertNodeIdsInAccountByKinds(
    database,
    accountId,
    contextSpec.group_ids,
    ['Group', 'Folder'],
    'group_ids'
  );
  if (contextSpec.workspace_id) {
    assertNodeIdsInAccountByKinds(
      database,
      accountId,
      [contextSpec.workspace_id],
      ['Source'],
      'workspace_id'
    );
  }
  return contextSpec;
}

function contextIndicators(contextSpecInput: unknown): Record<string, unknown> {
  const contextSpec = normalizeContextSpec(contextSpecInput);
  return {
    source_count: contextSpec.source_ids.length,
    group_count: contextSpec.group_ids.length,
    has_workspace_scope: Boolean(contextSpec.workspace_id),
    workspace_id: contextSpec.workspace_id || null,
    include_pinned: contextSpec.include_pinned,
    expansion_rule: contextSpec.expansion_rule,
  };
}

// ============================================================================
// Route Factory
// ============================================================================

export function createConversationsRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();

  /**
   * POST /api/v1/conversations
   * Create a new conversation thread
   */
  router.post('/', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      // Validate request body
      const body = CreateConversationSchema.parse(req.body);
      const accountId = req.user!.accountId;
      const userId = req.user!.userId;
      const accountClass = ((req.user as any)?.accountClass || 'free') as
        | 'free'
        | 'professional'
        | 'business';
      const features = featureManifestForAccountClass(accountClass);

      // Generate conversation ID
      const conversationId = `conv_${nanoid()}`;
      const now = Date.now();

      // Resolve human principal: default to deterministic current-user principal when omitted.
      let humanPrincipalId = body.human_principal_id;
      if (!humanPrincipalId) {
        const hierarchy = ensureHumanPrincipalHierarchyForUser(
          database,
          accountId,
          userId,
          userId,
          now
        );
        humanPrincipalId = hierarchy.principalId;
      }

      const humanRow = getPrincipalRow(database, accountId, humanPrincipalId);
      if (!humanRow) {
        return res.status(400).json({
          success: false,
          error: `human_principal_id must resolve to an account-scoped Principal: ${humanPrincipalId}`,
        });
      }
      const humanProps = parsePrincipalProperties(humanRow);
      if (humanProps.principal_kind && humanProps.principal_kind !== 'human') {
        return res.status(400).json({
          success: false,
          error: `human_principal_id must be a human principal: ${humanPrincipalId}`,
        });
      }
      ensureAccountContainsPrincipal(database, {
        accountId,
        principalId: humanPrincipalId,
        createdByUserId: userId,
        membershipRole: 'member',
        now,
      });

      // Resolve/validate agent principal when provided and enforce entitlement.
      const agentPrincipalId: string | undefined = body.agent_principal_id;
      let agentProps: Record<string, any> | null = null;
      if (agentPrincipalId) {
        if (!features.agent_runtime) {
          return res.status(403).json({
            success: false,
            error: 'Agent participation requires agent runtime entitlement',
            requiredFeature: 'agent_runtime',
          });
        }

        const agentRow = getPrincipalRow(database, accountId, agentPrincipalId);
        if (!agentRow) {
          return res.status(400).json({
            success: false,
            error: `agent_principal_id must resolve to an account-scoped Principal: ${agentPrincipalId}`,
          });
        }

        agentProps = parsePrincipalProperties(agentRow);
        if (agentProps.principal_kind && agentProps.principal_kind !== 'agent') {
          return res.status(400).json({
            success: false,
            error: `agent_principal_id must be an agent principal: ${agentPrincipalId}`,
          });
        }
        ensureAccountContainsPrincipal(database, {
          accountId,
          principalId: agentPrincipalId,
          createdByUserId: userId,
          membershipRole: 'agent',
          now,
        });
      }

      const scopedContext = validateContextSpec(
        database,
        accountId,
        normalizeContextSpec(body.context_spec)
      );

      // Build properties JSON for the ConversationThread node
      const properties = JSON.stringify({
        title: body.title,
        human_principal_id: humanPrincipalId,
        agent_principal_id: agentPrincipalId,
        purpose: body.purpose,
        context_spec: scopedContext,
        system_preamble: body.system_preamble,
        persona: body.persona,
        metadata: body.metadata || {},
      });

      // Insert ConversationThread node
      database
        .prepare(
          `
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'ConversationThread', ?, ?, ?, ?, ?)
      `
        )
        .run(conversationId, properties, accountId, userId, now, now);

      // Create INITIATED_BY edge (ConversationThread -> Human Principal)
      const initiatedByEdgeId = `edge_initiated_${nanoid()}`;
      database
        .prepare(
          `
        INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
        VALUES (?, 'INITIATED_BY', ?, ?, '{}', ?, ?, ?)
      `
        )
        .run(initiatedByEdgeId, conversationId, humanPrincipalId, accountId, userId, now);

      // Create PARTICIPATED_IN edge (Human Principal -> ConversationThread)
      const humanParticipatedEdgeId = `edge_participated_${nanoid()}`;
      database
        .prepare(
          `
        INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
        VALUES (?, 'PARTICIPATED_IN', ?, ?, '{"role": "human"}', ?, ?, ?)
      `
        )
        .run(humanParticipatedEdgeId, humanPrincipalId, conversationId, accountId, userId, now);

      // If agent specified, create PARTICIPATED_IN edge for agent
      if (agentPrincipalId) {
        const agentParticipatedEdgeId = `edge_participated_${nanoid()}`;
        database
          .prepare(
            `
          INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
          VALUES (?, 'PARTICIPATED_IN', ?, ?, '{"role": "agent"}', ?, ?, ?)
        `
          )
          .run(agentParticipatedEdgeId, agentPrincipalId, conversationId, accountId, userId, now);
      }

      // Resolve principal names for response (F4: Context-Set Legibility)
      const humanName = humanProps.display_name || humanProps.name || 'Unknown';
      const agentName = agentProps ? agentProps.display_name || agentProps.name || 'Agent' : null;

      // Return created conversation
      return res.status(201).json({
        success: true,
        conversation: {
          id: conversationId,
          kind: 'ConversationThread',
          title: body.title,
          human_principal_id: humanPrincipalId,
          human_principal_name: humanName,
          agent_principal_id: agentPrincipalId,
          agent_principal_name: agentName,
          purpose: body.purpose,
          context_spec: scopedContext,
          context_indicators: contextIndicators(scopedContext),
          system_preamble: body.system_preamble,
          persona: body.persona,
          account_id: accountId,
          created_by: userId,
          created_at: now,
          updated_at: now,
        },
      });
    } catch (error: any) {
      console.error('[Conversations] Create error:', error);

      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      if (typeof error?.message === 'string' && error.message.startsWith('Invalid ')) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to create conversation',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/conversations
   * List conversations for account (optionally filter by principal_id)
   */
  router.get('/', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      const accountId = req.user!.accountId;

      // Parse query params
      const principalId = req.query.principal_id as string | undefined;
      const purpose = req.query.purpose as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      // Build query
      let sql = `SELECT * FROM nodes WHERE kind = 'ConversationThread' AND account_id = ?`;
      const params: any[] = [accountId];

      if (principalId) {
        // Filter by participant (human or agent)
        sql += ` AND (
          json_extract(properties, '$.human_principal_id') = ?
          OR json_extract(properties, '$.agent_principal_id') = ?
        )`;
        params.push(principalId, principalId);
      }

      if (purpose) {
        sql += ` AND json_extract(properties, '$.purpose') = ?`;
        params.push(purpose);
      }

      sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const rows = database.prepare(sql).all(...params) as any[];

      // Parse properties and resolve principal names
      const conversations = await Promise.all(
        rows.map(async (row) => {
          const props = JSON.parse(row.properties);

          // Resolve human name
          let humanName = 'Unknown';
          if (props.human_principal_id) {
            const humanRow = database
              .prepare(
                `
            SELECT properties FROM nodes WHERE id = ? AND account_id = ?
          `
              )
              .get(props.human_principal_id, accountId) as any;
            if (humanRow) {
              const humanProps = JSON.parse(humanRow.properties);
              humanName = humanProps.display_name || humanProps.name || 'Unknown';
            }
          }

          // Resolve agent name
          let agentName: string | null = null;
          if (props.agent_principal_id) {
            const agentRow = database
              .prepare(
                `
            SELECT properties FROM nodes WHERE id = ? AND account_id = ?
          `
              )
              .get(props.agent_principal_id, accountId) as any;
            if (agentRow) {
              const agentProps = JSON.parse(agentRow.properties);
              agentName = agentProps.display_name || agentProps.name || 'Agent';
            }
          }

          return {
            id: row.id,
            kind: row.kind,
            title: props.title,
            human_principal_id: props.human_principal_id,
            human_principal_name: humanName,
            agent_principal_id: props.agent_principal_id,
            agent_principal_name: agentName,
            purpose: props.purpose,
            context_spec: props.context_spec,
            context_indicators: contextIndicators(props.context_spec),
            account_id: row.account_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
          };
        })
      );

      // Get total count
      let countSql = `SELECT COUNT(*) as count FROM nodes WHERE kind = 'ConversationThread' AND account_id = ?`;
      const countParams: any[] = [accountId];
      if (principalId) {
        countSql += ` AND (
          json_extract(properties, '$.human_principal_id') = ?
          OR json_extract(properties, '$.agent_principal_id') = ?
        )`;
        countParams.push(principalId, principalId);
      }
      if (purpose) {
        countSql += ` AND json_extract(properties, '$.purpose') = ?`;
        countParams.push(purpose);
      }
      const countResult = database.prepare(countSql).get(...countParams) as any;

      return res.json({
        success: true,
        conversations,
        pagination: {
          total: countResult.count,
          limit,
          offset,
        },
      });
    } catch (error: any) {
      console.error('[Conversations] List error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to list conversations',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/conversations/:id
   * Get conversation by ID with resolved names and context
   * F4: Context-Set Legibility - must return agent identity, context set, attribution
   */
  router.get('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      const { id } = req.params;
      const accountId = req.user!.accountId;

      // F2: Account Boundary
      const row = database
        .prepare(
          `
        SELECT * FROM nodes
        WHERE id = ? AND kind = 'ConversationThread' AND account_id = ?
      `
        )
        .get(id, accountId) as any;

      if (!row) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      const props = JSON.parse(row.properties);

      // Resolve human principal
      let humanPrincipal: any = null;
      if (props.human_principal_id) {
        const humanRow = database
          .prepare(
            `
          SELECT id, properties FROM nodes WHERE id = ? AND account_id = ?
        `
          )
          .get(props.human_principal_id, accountId) as any;
        if (humanRow) {
          const humanProps = JSON.parse(humanRow.properties);
          humanPrincipal = {
            id: humanRow.id,
            display_name: humanProps.display_name || humanProps.name,
            principal_kind: humanProps.principal_kind,
          };
        }
      }

      // Resolve agent principal
      let agentPrincipal: any = null;
      if (props.agent_principal_id) {
        const agentRow = database
          .prepare(
            `
          SELECT id, properties FROM nodes WHERE id = ? AND account_id = ?
        `
          )
          .get(props.agent_principal_id, accountId) as any;
        if (agentRow) {
          const agentProps = JSON.parse(agentRow.properties);
          agentPrincipal = {
            id: agentRow.id,
            display_name: agentProps.display_name || agentProps.name,
            principal_kind: agentProps.principal_kind,
            capabilities: agentProps.capabilities,
          };
        }
      }

      // Get participation edges
      const participationEdges = database
        .prepare(
          `
        SELECT * FROM edges
        WHERE kind = 'PARTICIPATED_IN' AND to_id = ? AND account_id = ?
      `
        )
        .all(id, accountId) as any[];

      // Get message count for this conversation
      const messageCount = database
        .prepare(
          `
        SELECT COUNT(*) as count FROM nodes
        WHERE kind = 'Message' AND account_id = ?
          AND json_extract(properties, '$.thread_id') = ?
      `
        )
        .get(accountId, id) as any;

      return res.json({
        success: true,
        conversation: {
          id: row.id,
          kind: row.kind,
          title: props.title,
          purpose: props.purpose,
          system_preamble: props.system_preamble,
          persona: props.persona,
          context_spec: props.context_spec,
          context_indicators: contextIndicators(props.context_spec),
          metadata: props.metadata,
          account_id: row.account_id,
          created_by: row.created_by,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        // F4: Context-Set Legibility fields
        participants: {
          human: humanPrincipal,
          agent: agentPrincipal,
        },
        participation_edges: participationEdges.map((e) => ({
          edge_id: e.id,
          principal_id: e.from_id,
          role: JSON.parse(e.properties || '{}').role,
        })),
        stats: {
          message_count: messageCount?.count || 0,
        },
      });
    } catch (error: any) {
      console.error('[Conversations] Get error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get conversation',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/conversations/:id/context-pack
   * Bounded context-pack retrieval (evidence and boundaries), not full synthesis
   */
  router.get('/:id/context-pack', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      const { id } = req.params;
      const accountId = req.user!.accountId;

      // Ensure conversation exists and is authorized for this account
      const row = database
        .prepare(
          `
        SELECT properties FROM nodes
        WHERE id = ? AND kind = 'ConversationThread' AND account_id = ?
      `
        )
        .get(id, accountId) as any;

      if (!row) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      const props = JSON.parse(row.properties);
      const contextSpec = props.context_spec || {};

      const contextService = new ConversationContextService(database);
      const contextPack = contextService.buildContextPack(accountId, id, contextSpec);

      return res.json({
        success: true,
        context_pack: contextPack,
      });
    } catch (error: any) {
      console.error('[Conversations] Context Pack error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate context pack',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/conversations/:id/messages
   * Get ordered message history for a conversation
   */
  router.get('/:id/messages', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      const { id } = req.params;
      const accountId = req.user!.accountId;

      const messageService = new ConversationMessageService(database);
      const messages = messageService.getMessages(accountId, id);

      return res.json({
        success: true,
        messages,
      });
    } catch (error: any) {
      console.error('[Conversations] Get messages error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get conversation messages',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/v1/conversations/:id/messages
   * Post a new message and optionally run synthesis
   */
  router.post('/:id/messages', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      const { id } = req.params;
      const accountId = req.user!.accountId;
      const userId = req.user!.userId;

      const body = PostMessageSchema.parse(req.body);

      const messageService = new ConversationMessageService(database);
      const result = await messageService.postMessage(
        accountId,
        userId,
        id,
        body.content,
        body.run_synthesis
      );

      return res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error('[Conversations] Post message error:', error);

      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to post message',
        message: error.message,
      });
    }
  });

  /**
   * PUT /api/v1/conversations/:id/context
   * Update conversation context specification
   */
  router.put('/:id/context', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      const { id } = req.params;
      const accountId = req.user!.accountId;

      // Validate request body
      const body = UpdateContextSchema.parse(req.body);

      // F2: Account Boundary
      const row = database
        .prepare(
          `
        SELECT * FROM nodes
        WHERE id = ? AND kind = 'ConversationThread' AND account_id = ?
      `
        )
        .get(id, accountId) as any;

      if (!row) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      const props = JSON.parse(row.properties);
      const now = Date.now();

      // Update context_spec
      props.context_spec = validateContextSpec(database, accountId, body.context_spec);

      // Save updated properties
      database
        .prepare(
          `
        UPDATE nodes SET properties = ?, updated_at = ?
        WHERE id = ? AND account_id = ?
      `
        )
        .run(JSON.stringify(props), now, id, accountId);

      return res.json({
        success: true,
        conversation: {
          id: row.id,
          title: props.title,
          context_spec: props.context_spec,
          context_indicators: contextIndicators(props.context_spec),
          updated_at: now,
        },
      });
    } catch (error: any) {
      console.error('[Conversations] Update context error:', error);

      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      if (typeof error?.message === 'string' && error.message.startsWith('Invalid ')) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to update context',
        message: error.message,
      });
    }
  });

  /**
   * DELETE /api/v1/conversations/:id
   * Delete conversation and associated edges
   */
  router.delete('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      const { id } = req.params;
      const accountId = req.user!.accountId;

      // F2: Account Boundary
      const row = database
        .prepare(
          `
        SELECT * FROM nodes
        WHERE id = ? AND kind = 'ConversationThread' AND account_id = ?
      `
        )
        .get(id, accountId) as any;

      if (!row) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      // Delete associated edges
      database
        .prepare(
          `
        DELETE FROM edges WHERE (from_id = ? OR to_id = ?) AND account_id = ?
      `
        )
        .run(id, id, accountId);

      // Delete messages in this conversation
      database
        .prepare(
          `
        DELETE FROM nodes
        WHERE kind = 'Message' AND account_id = ?
          AND json_extract(properties, '$.thread_id') = ?
      `
        )
        .run(accountId, id);

      // Delete conversation node
      database
        .prepare(
          `
        DELETE FROM nodes WHERE id = ? AND account_id = ?
      `
        )
        .run(id, accountId);

      return res.json({
        success: true,
        message: 'Conversation deleted successfully',
      });
    } catch (error: any) {
      console.error('[Conversations] Delete error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete conversation',
        message: error.message,
      });
    }
  });

  return router;
}
