import { Router, Request, Response } from 'express';
import { SimilarityEngineV2, type SimilarityEngineDocument } from '@keimenon/parsers';
import { normalizeImportOptions } from '@keimenon/types';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth.middleware';
import type { AuthServiceV2 } from '../services/auth.service';
import { isSemanticStageKillSwitchEnabled } from '../utils/gate-e-kill-switches';
import { applySemanticStageKillSwitchToEdges } from '../utils/semantic-stage-kill-switch';

type PreviewMessage = {
  id?: string;
  content?: string;
  text?: string;
  role?: 'user' | 'assistant' | 'system' | string;
  timestamp?: number;
  index?: number;
  conversationId?: string;
  conversation_id?: string;
};

type PreviewConversation = {
  id?: string;
  conversationId?: string;
  messages?: PreviewMessage[];
};

type StoredImportPresetConfig = Omit<ReturnType<typeof normalizeImportOptions>, 'platform'>;

type ImportPresetRow = {
  id: string;
  name: string;
  config: string;
  created_at: number;
  updated_at: number;
};

function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function hashId(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0)
    .toString(16)
    .padStart(8, '0');
}

function toNumeric(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(percentile * (sorted.length - 1)))
  );
  return sorted[index];
}

function extractAnchorTerms(
  docs: SimilarityEngineDocument[],
  maxTerms: number
): Array<{ term: string; count: number }> {
  const stopWords = new Set([
    'about',
    'after',
    'also',
    'and',
    'are',
    'because',
    'been',
    'before',
    'between',
    'from',
    'have',
    'just',
    'more',
    'most',
    'only',
    'other',
    'that',
    'their',
    'there',
    'these',
    'this',
    'those',
    'what',
    'when',
    'where',
    'which',
    'with',
    'would',
    'your',
    'the',
    'for',
    'not',
    'you',
  ]);

  const frequencies = new Map<string, number>();
  for (const doc of docs) {
    const tokens = normalizeText(doc.text).match(/[a-z0-9_]{3,}/g) || [];
    const unique = new Set<string>();
    for (const token of tokens) {
      if (stopWords.has(token)) {
        continue;
      }
      unique.add(token);
    }
    for (const token of unique) {
      frequencies.set(token, (frequencies.get(token) || 0) + 1);
    }
  }

  return [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTerms)
    .map(([term, count]) => ({ term, count }));
}

function parsePreviewMessages(payload: any): PreviewMessage[] {
  if (Array.isArray(payload?.messages)) {
    return payload.messages;
  }

  if (Array.isArray(payload?.conversations)) {
    const flattened: PreviewMessage[] = [];
    for (const conversation of payload.conversations as PreviewConversation[]) {
      const conversationId =
        conversation.id || conversation.conversationId || `conv_${flattened.length + 1}`;
      for (const message of conversation.messages || []) {
        flattened.push({
          ...message,
          conversationId: message.conversationId || message.conversation_id || conversationId,
        });
      }
    }
    return flattened;
  }

  if (Array.isArray(payload?.sources)) {
    return payload.sources.map((source: any, index: number) => ({
      id: source.id || `src_${index + 1}`,
      content: source.text || source.content || '',
      role: source.role || 'user',
      conversationId: source.conversationId || source.conversation_id || `source_${index + 1}`,
      timestamp: source.timestamp || Date.now() + index,
      index,
    }));
  }

  return [];
}

function normalizePresetName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 64) {
    return null;
  }

  return trimmed;
}

function toStoredPresetConfig(config: unknown): StoredImportPresetConfig {
  const normalized = normalizeImportOptions(config);
  const { platform: _platform, ...storedConfig } = normalized;
  return storedConfig;
}

function parseStoredPresetConfig(rawConfig: string): StoredImportPresetConfig {
  try {
    const parsed = JSON.parse(rawConfig);
    return toStoredPresetConfig(parsed);
  } catch {
    return toStoredPresetConfig(undefined);
  }
}

function mapImportPresetRow(row: ImportPresetRow) {
  return {
    id: row.id,
    name: row.name,
    config: parseStoredPresetConfig(row.config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueConstraintError(error: any): boolean {
  return typeof error?.message === 'string' && error.message.includes('UNIQUE constraint failed');
}

function parseStatsWindow(
  value: unknown
): { label: '24h' | '7d' | '30d'; durationMs: number } | null {
  switch (value) {
    case '24h':
      return { label: '24h', durationMs: 24 * 60 * 60 * 1000 };
    case '7d':
      return { label: '7d', durationMs: 7 * 24 * 60 * 60 * 1000 };
    case '30d':
      return { label: '30d', durationMs: 30 * 24 * 60 * 60 * 1000 };
    default:
      return null;
  }
}

function parseBucketCount(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(6, Math.min(120, Math.floor(value)));
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(6, Math.min(120, Math.floor(parsed)));
    }
  }

  return fallback;
}

function materializePreviewDocuments(
  messages: PreviewMessage[],
  config: ReturnType<typeof normalizeImportOptions>
): SimilarityEngineDocument[] {
  const filteredMessages = messages
    .map((message, index) => ({
      id: message.id || `msg_${index + 1}`,
      content: (message.content || message.text || '').trim(),
      role: message.role || 'user',
      conversationId: message.conversationId || message.conversation_id || `conv_${index + 1}`,
      timestamp: toNumeric(message.timestamp, Date.now() + index),
      index: toNumeric(message.index, index),
    }))
    .filter((message) => {
      if (message.role === 'user' && !config.extraction.includeUser) {
        return false;
      }
      if (message.role === 'assistant' && !config.extraction.includeAssistant) {
        return false;
      }
      return message.content.length >= config.minMessageLength;
    })
    .sort(
      (a, b) =>
        a.conversationId.localeCompare(b.conversationId) ||
        a.index - b.index ||
        a.timestamp - b.timestamp
    );

  if (filteredMessages.length === 0) {
    return [];
  }

  if (config.branches === 'merged') {
    const byConversation = new Map<string, typeof filteredMessages>();
    for (const message of filteredMessages) {
      if (!byConversation.has(message.conversationId)) {
        byConversation.set(message.conversationId, []);
      }
      byConversation.get(message.conversationId)!.push(message);
    }

    return [...byConversation.entries()].map(([conversationId, conversationMessages]) => ({
      id: `preview_${hashId(`merged:${conversationId}`)}`,
      text: conversationMessages.map((message) => message.content).join('\n\n'),
      conversationId,
      role: 'user',
      timestamp: conversationMessages[0]?.timestamp,
    }));
  }

  const byBranch = new Map<string, typeof filteredMessages>();
  for (const message of filteredMessages) {
    if (message.role !== 'user' && message.role !== 'assistant') {
      continue;
    }
    const key = `${message.conversationId}:${message.role}`;
    if (!byBranch.has(key)) {
      byBranch.set(key, []);
    }
    byBranch.get(key)!.push(message);
  }

  return [...byBranch.entries()].map(([branchKey, branchMessages]) => {
    const [conversationId, role] = branchKey.split(':');
    return {
      id: `preview_${hashId(`branch:${branchKey}`)}`,
      text: branchMessages.map((message) => message.content).join('\n\n'),
      conversationId,
      role,
      timestamp: branchMessages[0]?.timestamp,
    };
  });
}

export function createImportRoutes(authService: AuthServiceV2): Router {
  const router = Router();
  const similarityEngine = new SimilarityEngineV2();

  router.post('/similarity-preview', requireAuth(authService), (req: Request, res: Response) => {
    try {
      const config = normalizeImportOptions(req.body?.config);
      const messages = parsePreviewMessages(req.body);
      const documents = materializePreviewDocuments(messages, config);

      if (documents.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No eligible messages found for preview after applying import filters.',
        });
      }

      const semanticKillSwitchEnabled = isSemanticStageKillSwitchEnabled();
      const result = similarityEngine.analyze({
        documents,
        runtime: {
          disableSemanticStage: semanticKillSwitchEnabled,
        },
      });
      if (semanticKillSwitchEnabled) {
        applySemanticStageKillSwitchToEdges(result.edges as any[]);
      }

      const massValues = Object.values(result.massByNode);
      const strong = result.edges.filter((edge) => edge.strength === 'strong').length;
      const medium = result.edges.filter((edge) => edge.strength === 'medium').length;
      const weak = result.edges.filter((edge) => edge.strength === 'weak').length;
      const duplicateThreshold = config.duplicateDetection.similarityThreshold;
      const expectedReviewLoad = config.duplicateDetection.enabled
        ? result.edges.filter(
            (edge) => edge.lexical >= duplicateThreshold || edge.total >= duplicateThreshold
          ).length
        : 0;

      const response = {
        success: true,
        summary: {
          input: {
            messages: messages.length,
            previewDocuments: documents.length,
            branches: config.branches,
            processingMode: config.processingMode,
          },
          runtime: {
            semanticStageEnabled: !semanticKillSwitchEnabled,
          },
          predicted: {
            clusterCount: result.clusters.length,
            edgeCount: result.edges.length,
            edgeStrength: {
              strong,
              medium,
              weak,
            },
            expectedReviewLoad,
          },
          mass: {
            min: Math.min(...massValues),
            mean:
              massValues.length > 0
                ? massValues.reduce((sum, value) => sum + value, 0) / massValues.length
                : 0,
            p50: computePercentile(massValues, 0.5),
            p95: computePercentile(massValues, 0.95),
            max: Math.max(...massValues),
          },
          anchors: extractAnchorTerms(documents, 12),
          generatedAt: Date.now(),
        },
      };

      return res.json(response);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: error?.message || 'Failed to generate similarity preview',
      });
    }
  });

  router.get('/presets', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const accountId = req.user?.accountId;
      const userId = req.user?.userId;

      if (!accountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
      }

      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const rows = database
        .prepare(
          `
        SELECT id, name, config, created_at, updated_at
        FROM import_presets
        WHERE account_id = ? AND user_id = ?
        ORDER BY updated_at DESC, created_at DESC
      `
        )
        .all(accountId, userId) as ImportPresetRow[];

      return res.json({
        success: true,
        presets: rows.map(mapImportPresetRow),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error?.message || 'Failed to list import presets',
      });
    }
  });

  router.post('/presets', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const accountId = req.user?.accountId;
      const userId = req.user?.userId;

      if (!accountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
      }

      const presetName = normalizePresetName(req.body?.name);
      if (!presetName) {
        return res.status(400).json({
          success: false,
          error: 'Preset name is required and must be between 1 and 64 characters',
        });
      }

      const config = toStoredPresetConfig(req.body?.config);
      const now = Date.now();
      const id = randomUUID();

      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      try {
        database
          .prepare(
            `
          INSERT INTO import_presets (
            id, account_id, user_id, name, config, created_at, updated_at, data_tag
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'real')
        `
          )
          .run(id, accountId, userId, presetName, JSON.stringify(config), now, now);
      } catch (insertError: any) {
        if (isUniqueConstraintError(insertError)) {
          return res.status(409).json({
            success: false,
            error: 'A preset with this name already exists',
            code: 'PRESET_NAME_EXISTS',
          });
        }
        throw insertError;
      }

      return res.status(201).json({
        success: true,
        preset: {
          id,
          name: presetName,
          config,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error?.message || 'Failed to create import preset',
      });
    }
  });

  router.put('/presets/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const accountId = req.user?.accountId;
      const userId = req.user?.userId;
      const presetId = req.params.id;

      if (!accountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
      }

      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const existing = database
        .prepare(
          `
        SELECT id, name, config, created_at, updated_at
        FROM import_presets
        WHERE id = ? AND account_id = ? AND user_id = ?
      `
        )
        .get(presetId, accountId, userId) as ImportPresetRow | undefined;

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: 'Import preset not found',
        });
      }

      const hasName = typeof req.body?.name === 'string';
      const hasConfig = typeof req.body?.config !== 'undefined';
      if (!hasName && !hasConfig) {
        return res.status(400).json({
          success: false,
          error: 'At least one of name or config must be provided',
        });
      }

      const nextName = hasName ? normalizePresetName(req.body?.name) : existing.name;
      if (!nextName) {
        return res.status(400).json({
          success: false,
          error: 'Preset name is required and must be between 1 and 64 characters',
        });
      }

      const nextConfig = hasConfig
        ? toStoredPresetConfig(req.body?.config)
        : parseStoredPresetConfig(existing.config);
      const now = Date.now();

      try {
        database
          .prepare(
            `
          UPDATE import_presets
          SET name = ?, config = ?, updated_at = ?
          WHERE id = ? AND account_id = ? AND user_id = ?
        `
          )
          .run(nextName, JSON.stringify(nextConfig), now, presetId, accountId, userId);
      } catch (updateError: any) {
        if (isUniqueConstraintError(updateError)) {
          return res.status(409).json({
            success: false,
            error: 'A preset with this name already exists',
            code: 'PRESET_NAME_EXISTS',
          });
        }
        throw updateError;
      }

      return res.json({
        success: true,
        preset: {
          id: existing.id,
          name: nextName,
          config: nextConfig,
          createdAt: existing.created_at,
          updatedAt: now,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error?.message || 'Failed to update import preset',
      });
    }
  });

  router.delete('/presets/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const accountId = req.user?.accountId;
      const userId = req.user?.userId;
      const presetId = req.params.id;

      if (!accountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
      }

      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const result = database
        .prepare(
          `
        DELETE FROM import_presets
        WHERE id = ? AND account_id = ? AND user_id = ?
      `
        )
        .run(presetId, accountId, userId);

      if (result.changes === 0) {
        return res.status(404).json({
          success: false,
          error: 'Import preset not found',
        });
      }

      return res.json({
        success: true,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error?.message || 'Failed to delete import preset',
      });
    }
  });

  router.get('/stats/series', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const accountId = req.user?.accountId;
      if (!accountId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
      }

      const windowConfig = parseStatsWindow(req.query.window);
      if (!windowConfig) {
        return res.status(400).json({
          success: false,
          error: 'Invalid window parameter. Use one of: 24h, 7d, 30d',
        });
      }

      const bucketCount = parseBucketCount(req.query.buckets, 12);
      const bucketSizeMs = Math.max(1, Math.floor(windowConfig.durationMs / bucketCount));
      const now = Date.now();
      const start = now - windowConfig.durationMs;

      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const rows = database
        .prepare(
          `
        SELECT
          CAST((created_at - ?) / ? AS INTEGER) AS bucket_index,
          COUNT(*) AS imports_count,
          SUM(
            CASE
              WHEN json_valid(state_data) THEN COALESCE(CAST(json_extract(state_data, '$.stats.conversationsProcessed') AS INTEGER), 0)
              ELSE 0
            END
          ) AS conversations_processed,
          SUM(
            CASE
              WHEN json_valid(state_data) THEN COALESCE(CAST(json_extract(state_data, '$.stats.messagesProcessed') AS INTEGER), 0)
              ELSE 0
            END
          ) AS messages_processed,
          SUM(
            CASE
              WHEN json_valid(state_data) THEN COALESCE(CAST(json_extract(state_data, '$.stats.sourcesCreated') AS INTEGER), 0)
              ELSE 0
            END
          ) AS sources_created,
          SUM(
            CASE
              WHEN json_valid(state_data) THEN COALESCE(CAST(json_extract(state_data, '$.stats.nodesCreated') AS INTEGER), 0)
              ELSE 0
            END
          ) AS nodes_created,
          SUM(
            CASE
              WHEN json_valid(state_data) THEN COALESCE(CAST(json_extract(state_data, '$.stats.edgesCreated') AS INTEGER), 0)
              ELSE 0
            END
          ) AS edges_created
        FROM jobs
        WHERE account_id = ?
          AND type = 'import'
          AND created_at >= ?
          AND created_at <= ?
        GROUP BY bucket_index
        ORDER BY bucket_index ASC
      `
        )
        .all(start, bucketSizeMs, accountId, start, now) as Array<{
        bucket_index: number;
        imports_count: number;
        conversations_processed: number;
        messages_processed: number;
        sources_created: number;
        nodes_created: number;
        edges_created: number;
      }>;

      const bucketMap = new Map<number, (typeof rows)[number]>();
      for (const row of rows) {
        if (row.bucket_index >= 0 && row.bucket_index < bucketCount) {
          bucketMap.set(row.bucket_index, row);
        }
      }

      const series = Array.from({ length: bucketCount }).map((_, index) => {
        const row = bucketMap.get(index);
        const bucketStart = start + index * bucketSizeMs;
        const bucketEnd = Math.min(now, bucketStart + bucketSizeMs);

        return {
          index,
          bucketStart,
          bucketEnd,
          imports: Number(row?.imports_count || 0),
          conversations: Number(row?.conversations_processed || 0),
          messages: Number(row?.messages_processed || 0),
          sources: Number(row?.sources_created || 0),
          nodes: Number(row?.nodes_created || 0),
          edges: Number(row?.edges_created || 0),
        };
      });

      return res.json({
        success: true,
        window: windowConfig.label,
        bucketCount,
        bucketSizeMs,
        range: {
          start,
          end: now,
        },
        series,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error?.message || 'Failed to load import stats series',
      });
    }
  });

  return router;
}
