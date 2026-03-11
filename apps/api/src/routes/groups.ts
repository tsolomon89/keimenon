/**
 * Group Management API Routes
 * Handles auto-grouping, manual groups, and group operations
 */

import { Router, Request, Response } from 'express';
import { DatabaseFactory } from '@keimenon/db';
import {
  EnhancedAutogroupService,
  type AutogroupRuntimeConfig,
} from '../services/autogroup-enhanced';
import path from 'path';
import os from 'os';

const router = Router();

// Helper to resolve database path
function getDatabasePath(): string {
  const envPath = process.env.DATABASE_PATH;
  if (envPath) {
    return envPath.startsWith('~') ? path.join(os.homedir(), envPath.slice(1)) : envPath;
  }
  return path.join(os.homedir(), '.keimenon', 'graph.db');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeGroupingConfig(input: unknown): AutogroupRuntimeConfig {
  const record = asRecord(input);
  const modeInput = String(record.mode || 'automatic').toLowerCase();
  const mode: AutogroupRuntimeConfig['mode'] =
    modeInput === 'manual' ? 'manual' : modeInput === 'hybrid' ? 'hybrid' : 'automatic';

  const automaticRaw = asRecord(record.automatic ?? record.auto);
  const manualRaw = Array.isArray(record.manual) ? record.manual : [];

  return {
    mode,
    automatic: {
      targetGroupCount: asNumber(automaticRaw.targetGroupCount, 25),
      createCatchAll:
        typeof automaticRaw.createCatchAll === 'boolean' ? automaticRaw.createCatchAll : true,
      minGroupSize: asNumber(automaticRaw.minGroupSize, 2),
      algorithm: (automaticRaw.algorithm as 'keyword' | 'tfidf' | 'embedding') || 'tfidf',
    },
    manual: manualRaw
      .map((item) => asRecord(item))
      .filter((item) => typeof item.name === 'string' && Array.isArray(item.keywords))
      .map((item) => ({
        name: String(item.name),
        keywords: (item.keywords as unknown[]).map((keyword) => String(keyword)),
      })),
  };
}

/**
 * POST /api/v1/groups/auto
 * Auto-generate groups from messages
 */
router.post('/auto', async (req: Request, res: Response) => {
  try {
    const { messages, config } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const groupingConfig = normalizeGroupingConfig(config);

    const autogroupService = new EnhancedAutogroupService();
    const result = await autogroupService.autoGroupMessages(messages, groupingConfig);

    return res.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('Auto-group error:', error);
    return res.status(500).json({
      error: 'Failed to auto-group messages',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/groups/suggest
 * Get group suggestions without creating them
 */
router.get('/suggest', async (req: Request, res: Response) => {
  try {
    const { messages, target } = req.query;

    if (!messages) {
      return res.status(400).json({ error: 'messages parameter is required' });
    }

    const parsedMessages = JSON.parse(messages as string);
    const targetCount = target ? parseInt(target as string) : 25;

    const autogroupService = new EnhancedAutogroupService();
    const suggestions = await autogroupService.suggestGroups(parsedMessages, targetCount);

    return res.json({
      success: true,
      suggestions,
      targetCount,
      actualCount: suggestions.length,
    });
  } catch (error: any) {
    console.error('Group suggestion error:', error);
    return res.status(500).json({
      error: 'Failed to suggest groups',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/groups/recompute
 * Recompute groups with new target count
 */
router.post('/recompute', async (req: Request, res: Response) => {
  try {
    const { messages, config, newTargetCount } = req.body;

    if (!messages || !config || !newTargetCount) {
      return res.status(400).json({
        error: 'messages, config, and newTargetCount are required',
      });
    }

    const autogroupService = new EnhancedAutogroupService();
    const result = await autogroupService.recomputeGroups(
      messages,
      normalizeGroupingConfig(config),
      newTargetCount
    );

    return res.json({
      success: true,
      result,
      newTargetCount,
    });
  } catch (error: any) {
    console.error('Recompute error:', error);
    return res.status(500).json({
      error: 'Failed to recompute groups',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/groups
 * List all groups with optional pagination
 * Query params: limit (default 100), offset (default 0)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Get storage mode from query or config
    const mode = (req.query.mode as string) || 'local';
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const db = await DatabaseFactory.getClient({
      mode: mode as any,
      local: {
        databasePath: getDatabasePath(),
      },
    });

    // Use pagination to avoid loading all groups at once
    const groups = await db.getNodesByKind?.('Group', { limit, offset });
    const total = await db.countNodesByKind?.('Group');

    return res.json({
      success: true,
      groups: groups || [],
      count: groups?.length || 0,
      total: total || 0,
      limit,
      offset,
      hasMore: offset + (groups?.length || 0) < (total || 0),
    });
  } catch (error: any) {
    console.error('List groups error:', error);
    return res.status(500).json({
      error: 'Failed to list groups',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/groups/:id
 * Get a specific group with its members
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const mode = (req.query.mode as string) || 'local';

    const db = await DatabaseFactory.getClient({
      mode: mode as any,
      local: {
        databasePath: getDatabasePath(),
      },
    });

    const group = await db.getNode(id);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Get group members (outgoing CONTAINS edges)
    const edges = await db.getNodeEdges?.(id, 'outgoing');
    const memberIds = edges?.filter((e) => e.kind === 'CONTAINS').map((e) => e.to) || [];

    // Get member nodes
    const members = await Promise.all(
      memberIds.map(async (memberId) => await db.getNode(memberId))
    );

    return res.json({
      success: true,
      group,
      members: members.filter((m) => m !== null),
      memberCount: members.length,
    });
  } catch (error: any) {
    console.error('Get group error:', error);
    return res.status(500).json({
      error: 'Failed to get group',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/groups
 * Create a manual group
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, keywords, sourceIds } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const mode = (req.body.mode as string) || 'local';

    const db = await DatabaseFactory.getClient({
      mode: mode as any,
      local: {
        databasePath: getDatabasePath(),
      },
    });

    const groupId = `grp_manual_${Date.now()}`;

    await db.createNode({
      id: groupId,
      kind: 'Group',
      name,
      member_count: sourceIds?.length || 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: {
        keywords: keywords || [],
        isManual: true,
        confidence: 1.0,
      },
    });

    // Create CONTAINS edges if sourceIds provided
    if (sourceIds && Array.isArray(sourceIds)) {
      for (const sourceId of sourceIds) {
        await db.createEdge({
          id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          kind: 'CONTAINS',
          from: groupId,
          to: sourceId,
          created_at: Date.now(),
        });
      }
    }

    return res.json({
      success: true,
      groupId,
      name,
      memberCount: sourceIds?.length || 0,
    });
  } catch (error: any) {
    console.error('Create group error:', error);
    return res.status(500).json({
      error: 'Failed to create group',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/v1/groups/:id
 * Delete a group
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const mode = (req.query.mode as string) || 'local';

    const db = await DatabaseFactory.getClient({
      mode: mode as any,
      local: {
        databasePath: getDatabasePath(),
      },
    });

    // Check if group exists
    const group = await db.getNode(id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Delete group (edges will be cascade deleted due to foreign keys)
    await db.deleteNode?.(id);

    return res.json({
      success: true,
      message: 'Group deleted',
      groupId: id,
    });
  } catch (error: any) {
    console.error('Delete group error:', error);
    return res.status(500).json({
      error: 'Failed to delete group',
      message: error.message,
    });
  }
});

export default router;
