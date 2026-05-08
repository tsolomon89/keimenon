/**
 * Spine Routes (Vision V2)
 *
 * API endpoints for UGC Spine operations:
 * - Extract lexemes and phrases from source documents
 * - Cluster phrases into topics
 * - Query spine nodes
 *
 * Related:
 * - apps/api/src/services/graph-spine-builder.ts
 * - packages/types/src/nodes.ts (LexemeNode, PhraseNode, TopicNode)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { GraphSpineBuilder } from '../services/graph-spine-builder';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { LexemeNode, PhraseNode, TopicNode, SourceDoc } from '@keimenon/types';
import { getDbClient } from '../utils/get-db-client';
import { getLocalDocumentStore } from '../services/local-document-store';
import { SemanticSpineService } from '../services/semantic-spine.service';
import { SemanticTraversalService } from '../services/semantic-traversal.service';
import { ensureHumanPrincipalHierarchyForUser } from '../services/graph-hierarchy.service';

const RebuildSpineSchema = z.object({
  sourceIds: z.array(z.string()).optional(),
  importId: z.string().optional(),
  spine: z
    .object({
      enabled: z.boolean().optional(),
      extractLexemes: z.boolean().optional(),
      extractPhrases: z.boolean().optional(),
      clusterTopics: z.boolean().optional(),
      minPhraseFrequency: z.number().min(1).optional(),
      minPhrasesPerTopic: z.number().min(1).optional(),
    })
    .optional(),
});

const HubsQuerySchema = z.object({
  kind: z.enum(['Phrase', 'Topic', 'all']).default('all'),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const UnifiedDocSchema = z.object({
  plan: z.unknown(),
  title: z.string().min(1).max(200).optional(),
});

function parseProperties(raw: unknown): Record<string, any> {
  if (typeof raw !== 'string' || raw.length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolveAccountId(req: Request): string | undefined {
  return req.user?.accountId || (req as any).operating?.accountId;
}

async function writeNode(
  db: any,
  accountId: string,
  userId: string,
  node: Record<string, unknown>
) {
  await db.createNode({
    ...node,
    account_id: accountId,
    created_by: userId,
  } as any);
}

async function writeEdge(
  db: any,
  accountId: string,
  userId: string,
  edge: Record<string, unknown>
) {
  await db.createEdge({
    ...edge,
    from: edge.from || edge.from_id,
    to: edge.to || edge.to_id,
    account_id: accountId,
    created_by: userId,
  } as any);
}

export function createSpineRoutes(authService: AuthService) {
  const router = Router();
  const spineBuilder = GraphSpineBuilder.getInstance();
  const semanticSpine = new SemanticSpineService();
  const localStore = getLocalDocumentStore();

  // Middleware
  router.use(requireAuth(authService));

  /**
   * GET /api/v1/spine/health
   * Health check for spine service
   */
  router.get('/health', (_req: Request, res: Response) => {
    return res.json({
      status: 'ok',
      service: 'spine',
      version: '1.0.0',
    });
  });

  /**
   * POST /api/v1/spine/extract
   * Extract lexemes and phrases from a source document
   *
   * Body:
   * - sourceDocId: string - ID of the source document
   * - content: string - Text content to analyze
   *
   * Returns:
   * - lexemes: LexemeNode[]
   * - phrases: PhraseNode[]
   */
  router.post('/extract', async (req: Request, res: Response) => {
    try {
      const { sourceDocId, content } = req.body;
      const user = (req as any).user;
      const accountId = user?.accountId || user?.operating_account_id;

      if (!sourceDocId || !content) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'sourceDocId and content are required',
        });
      }

      // Create a minimal SourceDoc for the builder
      const sourceDoc: SourceDoc = {
        id: sourceDocId,
        kind: 'SourceDoc',
        title: 'Extraction Target',
        n_segments: 1,
        n_chars: content.length,
        created_ts_min: Date.now(),
        created_ts_max: Date.now(),
        provenance: [],
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {},
      };

      // Extract spine
      const { lexemes, phrases } = spineBuilder.extractSpine(sourceDoc, content);

      // Add account context to nodes
      const enrichedLexemes = lexemes.map((l) => ({
        ...l,
        metadata: { ...l.metadata, account_id: accountId },
      }));
      const enrichedPhrases = phrases.map((p) => ({
        ...p,
        metadata: { ...p.metadata, account_id: accountId },
      }));

      return res.json({
        success: true,
        sourceDocId,
        lexemes: enrichedLexemes,
        phrases: enrichedPhrases,
        stats: {
          lexemeCount: enrichedLexemes.length,
          phraseCount: enrichedPhrases.length,
          contentLength: content.length,
        },
      });
    } catch (error: any) {
      console.error('[SpineRoutes] Extract failed:', error);
      return res.status(500).json({
        error: 'Spine extraction failed',
        details: error.message,
      });
    }
  });

  /**
   * POST /api/v1/spine/cluster
   * Cluster phrases into topics
   *
   * Body:
   * - phrases: PhraseNode[] - Phrases to cluster
   *
   * Returns:
   * - topics: TopicNode[]
   */
  router.post('/cluster', async (req: Request, res: Response) => {
    try {
      const { phrases } = req.body;
      const user = (req as any).user;
      const accountId = user?.accountId || user?.operating_account_id;

      if (!phrases || !Array.isArray(phrases)) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'phrases array is required',
        });
      }

      // Cluster into topics
      const topics = spineBuilder.clusterTopics(phrases);

      // Add account context
      const enrichedTopics = topics.map((t) => ({
        ...t,
        metadata: { ...t.metadata, account_id: accountId },
      }));

      return res.json({
        success: true,
        topics: enrichedTopics,
        stats: {
          inputPhraseCount: phrases.length,
          topicCount: enrichedTopics.length,
        },
      });
    } catch (error: any) {
      console.error('[SpineRoutes] Cluster failed:', error);
      return res.status(500).json({
        error: 'Topic clustering failed',
        details: error.message,
      });
    }
  });

  /**
   * POST /api/v1/spine/extract-and-cluster
   * Combined operation: extract spine then cluster into topics
   *
   * Body:
   * - sourceDocId: string
   * - content: string
   *
   * Returns:
   * - lexemes, phrases, topics
   */
  router.post('/extract-and-cluster', async (req: Request, res: Response) => {
    try {
      const { sourceDocId, content } = req.body;
      const user = (req as any).user;
      const accountId = user?.accountId || user?.operating_account_id;

      if (!sourceDocId || !content) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'sourceDocId and content are required',
        });
      }

      // Create minimal SourceDoc
      const sourceDoc: SourceDoc = {
        id: sourceDocId,
        kind: 'SourceDoc',
        title: 'Extraction Target',
        n_segments: 1,
        n_chars: content.length,
        created_ts_min: Date.now(),
        created_ts_max: Date.now(),
        provenance: [],
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {},
      };

      // Step 1: Extract spine
      const { lexemes, phrases } = spineBuilder.extractSpine(sourceDoc, content);

      // Step 2: Cluster into topics
      const topics = spineBuilder.clusterTopics(phrases);

      // Add account context
      const enrichedLexemes = lexemes.map((l) => ({
        ...l,
        metadata: { ...l.metadata, account_id: accountId },
      }));
      const enrichedPhrases = phrases.map((p) => ({
        ...p,
        metadata: { ...p.metadata, account_id: accountId },
      }));
      const enrichedTopics = topics.map((t) => ({
        ...t,
        metadata: { ...t.metadata, account_id: accountId },
      }));

      return res.json({
        success: true,
        sourceDocId,
        lexemes: enrichedLexemes,
        phrases: enrichedPhrases,
        topics: enrichedTopics,
        stats: {
          lexemeCount: enrichedLexemes.length,
          phraseCount: enrichedPhrases.length,
          topicCount: enrichedTopics.length,
          contentLength: content.length,
        },
      });
    } catch (error: any) {
      console.error('[SpineRoutes] Extract-and-cluster failed:', error);
      return res.status(500).json({
        error: 'Combined spine operation failed',
        details: error.message,
      });
    }
  });

  /**
   * POST /api/v1/spine/rebuild
   * Rebuild the persisted semantic spine for account-scoped sources.
   */
  router.post('/rebuild', async (req: Request, res: Response) => {
    try {
      const body = RebuildSpineSchema.parse(req.body || {});
      const accountId = resolveAccountId(req);
      const userId = req.user?.userId;
      if (!accountId || !userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const db = await getDbClient(req);
      const database = (db as any).getDatabase?.();
      if (!database) {
        return res.status(500).json({ success: false, error: 'SQLite database unavailable' });
      }

      const sourceWhere = [`account_id = ?`, `kind = 'Source'`];
      const sourceParams: unknown[] = [accountId];
      if (body.sourceIds?.length) {
        sourceWhere.push(`id IN (${body.sourceIds.map(() => '?').join(', ')})`);
        sourceParams.push(...body.sourceIds);
      }
      if (body.importId) {
        sourceWhere.push(
          `(json_extract(properties, '$.metadata.import_id') = ? OR json_extract(properties, '$.metadata.importId') = ? OR json_extract(properties, '$.metadata.import_batch') = ?)`
        );
        sourceParams.push(body.importId, body.importId, body.importId);
      }

      const sourceRows = database
        .prepare(
          `
            SELECT id, properties
            FROM nodes
            WHERE ${sourceWhere.join(' AND ')}
            ORDER BY created_at ASC, id ASC
          `
        )
        .all(...sourceParams) as Array<{ id: string; properties: string }>;

      const sources = [];
      const generatedSpans = [];
      for (const row of sourceRows) {
        const props = parseProperties(row.properties);
        let content = typeof props.content === 'string' ? props.content : undefined;
        if (!content && typeof props.content_location === 'string') {
          const storagePath = localStore.parseStorageLocation(props.content_location);
          content = storagePath
            ? (await localStore.getContentByPath(storagePath)) || undefined
            : undefined;
        }

        const source = {
          id: row.id,
          content,
          conversationId:
            typeof props.metadata?.conversation_id === 'string'
              ? props.metadata.conversation_id
              : undefined,
          messageIds: Array.isArray(props.metadata?.message_ids)
            ? props.metadata.message_ids.map((value: unknown) => String(value))
            : undefined,
        };
        sources.push(source);
      }

      if (sources.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No account-scoped sources matched rebuild criteria',
        });
      }

      const spansBySource = new Map<string, any[]>();
      const spanRows = database
        .prepare(
          `
            SELECT id, properties
            FROM nodes
            WHERE account_id = ? AND kind = 'SourceSpan'
            ORDER BY created_at ASC, id ASC
          `
        )
        .all(accountId) as Array<{ id: string; properties: string }>;

      for (const row of spanRows) {
        const props = parseProperties(row.properties);
        const sourceId = String(props.source_id || '');
        if (!sourceId) continue;
        const entries = spansBySource.get(sourceId) || [];
        entries.push({
          id: row.id,
          sourceId,
          messageId: typeof props.message_id === 'string' ? props.message_id : undefined,
          conversationId:
            typeof props.conversation_id === 'string' ? props.conversation_id : undefined,
          text: String(props.text || ''),
          normalizedText:
            typeof props.normalized_text === 'string' ? props.normalized_text : undefined,
          startChar: Number(props.start_char || 0),
          endChar: Number(props.end_char || 0),
          boundaryKind: props.boundary_kind,
        });
        spansBySource.set(sourceId, entries);
      }

      for (const source of sources) {
        if ((spansBySource.get(source.id) || []).length > 0 || !source.content) {
          continue;
        }
        const spans = semanticSpine.splitIntoSpans(source);
        for (const span of spans) {
          const now = Date.now();
          await writeNode(db, accountId, userId, {
            id: span.id,
            kind: 'SourceSpan',
            source_id: span.sourceId,
            message_id: span.messageId,
            conversation_id: span.conversationId,
            text: span.text,
            normalized_text: span.normalizedText,
            start_char: span.startChar,
            end_char: span.endChar,
            boundary_kind: span.boundaryKind,
            span_hash: `span:${span.id}`,
            created_at: now,
            updated_at: now,
            metadata: {
              graph_scope: 'processing',
              visible_by_default: false,
              rebuilt_by: 'spine/rebuild',
            },
          });
          await writeEdge(db, accountId, userId, {
            id: `edge_has_span_${span.sourceId}_${span.id}`,
            kind: 'HAS_SPAN',
            from: span.sourceId,
            to: span.id,
            created_at: now,
            metadata: {
              start_char: span.startChar,
              end_char: span.endChar,
              boundary_kind: span.boundaryKind,
            },
          });
        }
        generatedSpans.push(...spans);
        spansBySource.set(source.id, spans);
      }

      const spans = sources.flatMap((source) => spansBySource.get(source.id) || []);
      if (spans.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot rebuild spine without source spans or readable source content',
          diagnostics: { sourceCount: sources.length },
        });
      }

      const stats = await semanticSpine.buildForSources({
        accountId,
        userId,
        sources,
        spans,
        config: body.spine,
        write: {
          writeNode: (node) => writeNode(db, accountId, userId, node),
          writeEdge: (edge) => writeEdge(db, accountId, userId, edge),
        },
      });

      return res.json({
        success: true,
        stats,
        diagnostics: {
          sourceCount: sources.length,
          spanCount: spans.length,
          generatedSpanCount: generatedSpans.length,
        },
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res
          .status(400)
          .json({ success: false, error: 'Validation failed', details: error.errors });
      }
      console.error('[SpineRoutes] Rebuild failed:', error);
      return res
        .status(500)
        .json({ success: false, error: 'Spine rebuild failed', details: error.message });
    }
  });

  /**
   * GET /api/v1/spine/hubs
   * Return phrase/topic hubs with edge counts and explainable labels.
   */
  router.get('/hubs', async (req: Request, res: Response) => {
    try {
      const query = HubsQuerySchema.parse(req.query);
      const accountId = resolveAccountId(req);
      if (!accountId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const db = await getDbClient(req);
      const database = (db as any).getDatabase?.();
      const kinds = query.kind === 'all' ? ['Phrase', 'Topic'] : [query.kind];
      const params: unknown[] = [accountId, ...kinds];
      let searchSql = '';
      if (query.q?.trim()) {
        searchSql = `AND LOWER(properties) LIKE ?`;
        params.push(`%${query.q.trim().toLowerCase()}%`);
      }

      const rows = database
        .prepare(
          `
            SELECT id, kind, properties
            FROM nodes
            WHERE account_id = ?
              AND kind IN (${kinds.map(() => '?').join(', ')})
              ${searchSql}
            ORDER BY created_at ASC, id ASC
          `
        )
        .all(...params) as Array<{ id: string; kind: string; properties: string }>;

      const hubs = rows
        .map((row) => {
          const props = parseProperties(row.properties);
          const edgeCount = database
            .prepare(
              `SELECT COUNT(*) as count FROM edges WHERE account_id = ? AND (from_id = ? OR to_id = ?)`
            )
            .get(accountId, row.id, row.id) as { count: number };
          const frequency = Number(props.frequency || props.metadata?.total_frequency || 0);
          return {
            id: row.id,
            kind: row.kind,
            label: props.name || props.text || props.normalized_text || props.lemma || row.id,
            frequency,
            edgeCount: Number(edgeCount.count || 0),
            properties: props,
          };
        })
        .sort(
          (a, b) =>
            b.edgeCount - a.edgeCount ||
            b.frequency - a.frequency ||
            String(a.label).localeCompare(String(b.label))
        )
        .slice(0, query.limit);

      return res.json({ success: true, hubs });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res
          .status(400)
          .json({ success: false, error: 'Validation failed', details: error.errors });
      }
      return res
        .status(500)
        .json({ success: false, error: 'Failed to query spine hubs', details: error.message });
    }
  });

  /**
   * GET /api/v1/spine/hub/:nodeId
   * Return detailed evidence subgraph for a single Phrase or Topic node.
   *
   * The default graph snapshot deliberately excludes SourceSpan nodes and
   * HAS_SPAN / OCCURS_IN_SPAN edges. This endpoint provides on-demand
   * evidence hydration so the inspector can display supporting spans,
   * member phrases, parent topics, related phrases, and derived documents
   * without polluting the canvas snapshot.
   */
  router.get('/hub/:nodeId', async (req: Request, res: Response) => {
    try {
      const accountId = resolveAccountId(req);
      if (!accountId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const { nodeId } = req.params;
      const db = await getDbClient(req);
      const database = (db as any).getDatabase?.();
      if (!database) {
        return res.status(500).json({ success: false, error: 'SQLite database unavailable' });
      }

      // 1. Fetch the hub node itself
      const hubRow = database
        .prepare(
          `SELECT id, kind, properties FROM nodes
           WHERE account_id = ? AND id = ?`
        )
        .get(accountId, nodeId) as { id: string; kind: string; properties: string } | undefined;

      if (!hubRow) {
        return res
          .status(404)
          .json({ success: false, error: 'Hub node not found in account scope' });
      }

      const hubProps = parseProperties(hubRow.properties);
      const hubKind = hubRow.kind;

      // 2. Fetch all edges touching this node
      const edges = database
        .prepare(
          `SELECT id, kind, from_id, to_id, properties FROM edges
           WHERE account_id = ? AND (from_id = ? OR to_id = ?)`
        )
        .all(accountId, nodeId, nodeId) as Array<{
        id: string;
        kind: string;
        from_id: string;
        to_id: string;
        properties: string;
      }>;

      // Collect all connected node IDs
      const connectedIds = new Set<string>();
      for (const edge of edges) {
        const otherId = edge.from_id === nodeId ? edge.to_id : edge.from_id;
        connectedIds.add(otherId);
      }

      // 3. Batch-fetch connected nodes
      const connectedNodes = new Map<
        string,
        { id: string; kind: string; properties: Record<string, any> }
      >();
      if (connectedIds.size > 0) {
        const idList = Array.from(connectedIds);
        // SQLite has a variable limit; batch in groups of 500
        for (let i = 0; i < idList.length; i += 500) {
          const batch = idList.slice(i, i + 500);
          const placeholders = batch.map(() => '?').join(', ');
          const rows = database
            .prepare(
              `SELECT id, kind, properties FROM nodes
               WHERE account_id = ? AND id IN (${placeholders})`
            )
            .all(accountId, ...batch) as Array<{ id: string; kind: string; properties: string }>;
          for (const row of rows) {
            connectedNodes.set(row.id, {
              id: row.id,
              kind: row.kind,
              properties: parseProperties(row.properties),
            });
          }
        }
      }

      // 4. Classify edges into evidence categories
      const connectedSpans: Array<{
        id: string;
        text: string;
        sourceId: string;
        startChar?: number;
        endChar?: number;
      }> = [];
      const memberPhrases: Array<{ id: string; text: string; frequency: number }> = [];
      const parentTopics: Array<{ id: string; name: string; status: string }> = [];
      const derivedDocs: Array<{ id: string; title: string }> = [];
      const edgeSummary: Record<string, number> = {};

      // Track span IDs for related-phrase co-occurrence
      const hubSpanIds = new Set<string>();

      for (const edge of edges) {
        edgeSummary[edge.kind] = (edgeSummary[edge.kind] || 0) + 1;
        const otherId = edge.from_id === nodeId ? edge.to_id : edge.from_id;
        const otherNode = connectedNodes.get(otherId);
        if (!otherNode) continue;

        // SourceSpan connections (via MENTIONS or OCCURS_IN_SPAN)
        if (otherNode.kind === 'SourceSpan') {
          hubSpanIds.add(otherNode.id);
          connectedSpans.push({
            id: otherNode.id,
            text: String(otherNode.properties.text || otherNode.properties.normalized_text || ''),
            sourceId: String(otherNode.properties.source_id || ''),
            startChar:
              typeof otherNode.properties.start_char === 'number'
                ? otherNode.properties.start_char
                : undefined,
            endChar:
              typeof otherNode.properties.end_char === 'number'
                ? otherNode.properties.end_char
                : undefined,
          });
        }

        // Member Phrases (for Topics: BELONGS_TO_TOPIC edges where this topic is the target)
        if (
          hubKind === 'Topic' &&
          edge.kind === 'BELONGS_TO_TOPIC' &&
          edge.to_id === nodeId &&
          otherNode.kind === 'Phrase'
        ) {
          memberPhrases.push({
            id: otherNode.id,
            text: String(otherNode.properties.text || otherNode.properties.normalized_text || ''),
            frequency: Number(
              otherNode.properties.frequency || otherNode.properties.metadata?.total_frequency || 0
            ),
          });
        }

        // Parent Topics (for Phrases: BELONGS_TO_TOPIC edges where this phrase is the source)
        if (
          hubKind === 'Phrase' &&
          edge.kind === 'BELONGS_TO_TOPIC' &&
          edge.from_id === nodeId &&
          otherNode.kind === 'Topic'
        ) {
          parentTopics.push({
            id: otherNode.id,
            name: String(otherNode.properties.name || otherNode.id),
            status: String(otherNode.properties.topic_status || 'suggested'),
          });
        }

        // Derived Documents (DERIVES_FROM edges where the UnifiedDoc derives from this node)
        if (
          edge.kind === 'DERIVES_FROM' &&
          edge.from_id !== nodeId &&
          otherNode.kind === 'UnifiedDoc'
        ) {
          derivedDocs.push({
            id: otherNode.id,
            title: String(otherNode.properties.title || otherNode.properties.name || otherNode.id),
          });
        }
      }

      // 5. Related phrases via co-occurrence (phrases sharing the same spans)
      const relatedPhrases: Array<{ id: string; text: string; sharedSpanCount: number }> = [];
      if (hubKind === 'Phrase' && hubSpanIds.size > 0) {
        // Find other phrases that MENTIONS the same spans
        const spanIdList = Array.from(hubSpanIds);
        for (let i = 0; i < spanIdList.length; i += 500) {
          const batch = spanIdList.slice(i, i + 500);
          const placeholders = batch.map(() => '?').join(', ');
          const coEdges = database
            .prepare(
              `SELECT e.from_id, COUNT(*) as shared_count
               FROM edges e
               JOIN nodes n ON n.id = e.from_id AND n.account_id = ?
               WHERE e.account_id = ?
                 AND e.kind = 'MENTIONS'
                 AND e.to_id IN (${placeholders})
                 AND e.from_id != ?
                 AND n.kind = 'Phrase'
               GROUP BY e.from_id
               ORDER BY shared_count DESC
               LIMIT 20`
            )
            .all(accountId, accountId, ...batch, nodeId) as Array<{
            from_id: string;
            shared_count: number;
          }>;

          for (const row of coEdges) {
            const phraseNode = connectedNodes.get(row.from_id);
            // May need a fresh fetch if not in connectedNodes
            if (phraseNode) {
              relatedPhrases.push({
                id: phraseNode.id,
                text: String(
                  phraseNode.properties.text || phraseNode.properties.normalized_text || ''
                ),
                sharedSpanCount: row.shared_count,
              });
            } else {
              const freshRow = database
                .prepare(`SELECT id, properties FROM nodes WHERE account_id = ? AND id = ?`)
                .get(accountId, row.from_id) as { id: string; properties: string } | undefined;
              if (freshRow) {
                const freshProps = parseProperties(freshRow.properties);
                relatedPhrases.push({
                  id: freshRow.id,
                  text: String(freshProps.text || freshProps.normalized_text || ''),
                  sharedSpanCount: row.shared_count,
                });
              }
            }
          }
        }
      }

      // Sort member phrases by frequency desc
      memberPhrases.sort((a, b) => b.frequency - a.frequency);

      return res.json({
        success: true,
        hub: {
          id: hubRow.id,
          kind: hubKind,
          label:
            hubProps.name ||
            hubProps.text ||
            hubProps.normalized_text ||
            hubProps.lemma ||
            hubRow.id,
          properties: hubProps,
          connectedSpans,
          memberPhrases,
          parentTopics,
          relatedPhrases,
          derivedDocs,
          edgeSummary,
        },
      });
    } catch (error: any) {
      console.error('[SpineRoutes] Hub detail failed:', error);
      return res
        .status(500)
        .json({ success: false, error: 'Hub detail query failed', details: error.message });
    }
  });

  router.post('/traverse', async (req: Request, res: Response) => {
    try {
      const accountId = resolveAccountId(req);
      if (!accountId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const db = await getDbClient(req);
      const traversal = new SemanticTraversalService((db as any).getDatabase());
      return res.json({
        success: true,
        traversal: traversal.traverse(accountId, req.body?.plan || req.body),
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res
          .status(400)
          .json({ success: false, error: 'Validation failed', details: error.errors });
      }
      return res
        .status(400)
        .json({ success: false, error: 'Traversal failed', details: error.message });
    }
  });

  router.post('/context-pack', async (req: Request, res: Response) => {
    try {
      const accountId = resolveAccountId(req);
      if (!accountId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const db = await getDbClient(req);
      const traversal = new SemanticTraversalService((db as any).getDatabase());
      return res.json({
        success: true,
        contextPack: traversal.buildContextPack(accountId, req.body?.plan || req.body),
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res
          .status(400)
          .json({ success: false, error: 'Validation failed', details: error.errors });
      }
      return res
        .status(400)
        .json({ success: false, error: 'Context pack generation failed', details: error.message });
    }
  });

  router.post('/unified-doc', async (req: Request, res: Response) => {
    try {
      const body = UnifiedDocSchema.parse(req.body || {});
      const accountId = resolveAccountId(req);
      const userId = req.user?.userId;
      if (!accountId || !userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const db = await getDbClient(req);
      const database = (db as any).getDatabase();
      let producerPrincipalId: string | undefined;
      try {
        producerPrincipalId = ensureHumanPrincipalHierarchyForUser(
          database,
          accountId,
          userId,
          userId,
          Date.now()
        ).principalId;
      } catch (error: any) {
        console.warn('[SpineRoutes] Could not ensure producer principal:', error?.message || error);
      }

      const traversal = new SemanticTraversalService(database);
      const result = traversal.createUnifiedDocument(accountId, userId, body.plan, {
        title: body.title,
        producerPrincipalId,
      });
      return res.status(201).json({ success: true, unifiedDocument: result });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res
          .status(400)
          .json({ success: false, error: 'Validation failed', details: error.errors });
      }
      return res.status(400).json({
        success: false,
        error: 'Unified document generation failed',
        details: error.message,
      });
    }
  });

  /**
   * GET /api/v1/spine/topics/suggestions
   * Return suggested (auto-created, not yet promoted) topics with evidence.
   */
  router.get('/topics/suggestions', async (req: Request, res: Response) => {
    try {
      const accountId = resolveAccountId(req);
      if (!accountId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const db = await getDbClient(req);
      const database = (db as any).getDatabase?.();
      const limit = Number(req.query.limit || 50);

      const rows = database
        .prepare(
          `SELECT id, properties FROM nodes
           WHERE account_id = ? AND kind = 'Topic'
             AND (json_extract(properties, '$.topic_status') = 'suggested'
                  OR json_extract(properties, '$.topic_status') IS NULL)
           ORDER BY CAST(json_extract(properties, '$.strength') AS REAL) DESC, id ASC
           LIMIT ?`
        )
        .all(accountId, limit) as Array<{ id: string; properties: string }>;

      const suggestions = rows.map((row) => {
        const props = parseProperties(row.properties);
        const edgeCount = database
          .prepare(
            `SELECT COUNT(*) as count FROM edges WHERE account_id = ? AND (from_id = ? OR to_id = ?)`
          )
          .get(accountId, row.id, row.id) as { count: number };

        return {
          id: row.id,
          name: props.name || row.id,
          description: props.description,
          keywords: props.keywords,
          strength: props.strength,
          phraseCount: props.metadata?.phrase_count || 0,
          edgeCount: Number(edgeCount.count || 0),
          topicStatus: props.topic_status || 'suggested',
        };
      });

      return res.json({ success: true, suggestions });
    } catch (error: any) {
      return res
        .status(500)
        .json({ success: false, error: 'Failed to get topic suggestions', details: error.message });
    }
  });

  /**
   * POST /api/v1/spine/topics/:topicId/promote
   * Promote a suggested topic to 'promoted' status.
   */
  router.post('/topics/:topicId/promote', async (req: Request, res: Response) => {
    try {
      const accountId = resolveAccountId(req);
      const userId = req.user?.userId;
      if (!accountId || !userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const { topicId } = req.params;
      const db = await getDbClient(req);
      const database = (db as any).getDatabase?.();

      const existing = database
        .prepare(
          `SELECT id, properties FROM nodes WHERE account_id = ? AND id = ? AND kind = 'Topic'`
        )
        .get(accountId, topicId) as { id: string; properties: string } | undefined;

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Topic not found in account scope' });
      }

      const props = parseProperties(existing.properties);
      if (props.topic_status === 'promoted') {
        return res.json({ success: true, message: 'Topic already promoted', topicId });
      }

      const now = Date.now();
      database
        .prepare(
          `UPDATE nodes SET
             properties = json_set(
               properties,
               '$.topic_status', 'promoted',
               '$.promoted_at', ?,
               '$.promoted_by', ?,
               '$.visible_by_default', json('true'),
               '$.traversal_eligible', json('true'),
               '$.metadata.graph_scope', 'knowledge'
             ),
             updated_at = ?
           WHERE account_id = ? AND id = ?`
        )
        .run(now, userId, now, accountId, topicId);

      return res.json({ success: true, topicId, status: 'promoted' });
    } catch (error: any) {
      return res
        .status(500)
        .json({ success: false, error: 'Topic promotion failed', details: error.message });
    }
  });

  /**
   * POST /api/v1/spine/topics/:topicId/reject
   * Reject a topic. Does NOT delete phrases/spans/sources.
   */
  router.post('/topics/:topicId/reject', async (req: Request, res: Response) => {
    try {
      const accountId = resolveAccountId(req);
      const userId = req.user?.userId;
      if (!accountId || !userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const { topicId } = req.params;
      const db = await getDbClient(req);
      const database = (db as any).getDatabase?.();

      const existing = database
        .prepare(`SELECT id FROM nodes WHERE account_id = ? AND id = ? AND kind = 'Topic'`)
        .get(accountId, topicId) as { id: string } | undefined;

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Topic not found in account scope' });
      }

      database
        .prepare(
          `UPDATE nodes SET
             properties = json_set(
               properties,
               '$.topic_status', 'rejected',
               '$.visible_by_default', json('false'),
               '$.traversal_eligible', json('false'),
               '$.metadata.graph_scope', 'knowledge_rejected'
             ),
             updated_at = ?
           WHERE account_id = ? AND id = ?`
        )
        .run(Date.now(), accountId, topicId);

      return res.json({ success: true, topicId, status: 'rejected' });
    } catch (error: any) {
      return res
        .status(500)
        .json({ success: false, error: 'Topic rejection failed', details: error.message });
    }
  });

  /**
   * PATCH /api/v1/spine/topics/:topicId
   * Rename a topic (update name/keywords without changing identity).
   */
  router.patch('/topics/:topicId', async (req: Request, res: Response) => {
    try {
      const accountId = resolveAccountId(req);
      if (!accountId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const { topicId } = req.params;
      const { name, keywords } = req.body || {};
      if (!name && !keywords) {
        return res.status(400).json({ success: false, error: 'name or keywords required' });
      }

      const db = await getDbClient(req);
      const database = (db as any).getDatabase?.();

      const existing = database
        .prepare(
          `SELECT id, properties FROM nodes WHERE account_id = ? AND id = ? AND kind = 'Topic'`
        )
        .get(accountId, topicId) as { id: string; properties: string } | undefined;

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Topic not found in account scope' });
      }

      const props = parseProperties(existing.properties);
      if (name) {
        props.name = name;
      }
      if (keywords && Array.isArray(keywords)) {
        props.keywords = keywords;
      }
      props.updated_at = Date.now();

      database
        .prepare(`UPDATE nodes SET properties = ?, updated_at = ? WHERE account_id = ? AND id = ?`)
        .run(JSON.stringify(props), Date.now(), accountId, topicId);

      return res.json({ success: true, topicId, name: props.name, keywords: props.keywords });
    } catch (error: any) {
      return res
        .status(500)
        .json({ success: false, error: 'Topic rename failed', details: error.message });
    }
  });

  /**
   * POST /api/v1/spine/topics/:topicId/merge
   * Merge a topic into a target topic. Preserves provenance.
   * Redirects BELONGS_TO_TOPIC edges to the target topic.
   */
  router.post('/topics/:topicId/merge', async (req: Request, res: Response) => {
    try {
      const accountId = resolveAccountId(req);
      if (!accountId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const { topicId } = req.params;
      const { targetTopicId } = req.body || {};
      if (!targetTopicId) {
        return res.status(400).json({ success: false, error: 'targetTopicId required' });
      }
      if (topicId === targetTopicId) {
        return res.status(400).json({ success: false, error: 'Cannot merge topic into itself' });
      }

      const db = await getDbClient(req);
      const database = (db as any).getDatabase?.();

      // Verify both topics exist
      const source = database
        .prepare(`SELECT id FROM nodes WHERE account_id = ? AND id = ? AND kind = 'Topic'`)
        .get(accountId, topicId) as { id: string } | undefined;
      const target = database
        .prepare(`SELECT id FROM nodes WHERE account_id = ? AND id = ? AND kind = 'Topic'`)
        .get(accountId, targetTopicId) as { id: string } | undefined;

      if (!source) {
        return res.status(404).json({ success: false, error: 'Source topic not found' });
      }
      if (!target) {
        return res.status(404).json({ success: false, error: 'Target topic not found' });
      }

      const now = Date.now();

      // Redirect BELONGS_TO_TOPIC edges from source topic to target topic
      const belongsEdges = database
        .prepare(
          `SELECT id, from_id, properties FROM edges
           WHERE account_id = ? AND kind = 'BELONGS_TO_TOPIC' AND to_id = ?`
        )
        .all(accountId, topicId) as Array<{ id: string; from_id: string; properties: string }>;

      for (const edge of belongsEdges) {
        // Check if a BELONGS_TO_TOPIC edge already exists from this phrase to the target
        const existingEdge = database
          .prepare(
            `SELECT id FROM edges
             WHERE account_id = ? AND kind = 'BELONGS_TO_TOPIC' AND from_id = ? AND to_id = ?`
          )
          .get(accountId, edge.from_id, targetTopicId) as { id: string } | undefined;

        if (!existingEdge) {
          // Create a new edge to the target
          const newEdgeId = `edge_belongs_merge_${edge.from_id}_${targetTopicId}`.slice(0, 80);
          database
            .prepare(
              `INSERT OR IGNORE INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag)
               VALUES (?, 'BELONGS_TO_TOPIC', ?, ?, ?, ?, ?, ?, 'real')`
            )
            .run(newEdgeId, edge.from_id, targetTopicId, edge.properties, accountId, 'system', now);
        }
      }

      // Mark source topic as merged
      database
        .prepare(
          `UPDATE nodes SET
             properties = json_set(
               properties,
               '$.topic_status', 'rejected',
               '$.merge_target_id', ?,
               '$.visible_by_default', json('false'),
               '$.traversal_eligible', json('false'),
               '$.metadata.merged_at', ?,
               '$.metadata.merged_into', ?
             ),
             updated_at = ?
           WHERE account_id = ? AND id = ?`
        )
        .run(targetTopicId, now, targetTopicId, now, accountId, topicId);

      return res.json({
        success: true,
        sourceTopicId: topicId,
        targetTopicId,
        redirectedEdges: belongsEdges.length,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({ success: false, error: 'Topic merge failed', details: error.message });
    }
  });

  /**
   * POST /api/v1/spine/authority/compute
   * Compute authority scores for all nodes in the account.
   */
  router.post('/authority/compute', async (req: Request, res: Response) => {
    try {
      const accountId = resolveAccountId(req);
      if (!accountId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const db = await getDbClient(req);
      const database = (db as any).getDatabase?.();
      if (!database) {
        return res.status(500).json({ success: false, error: 'SQLite database unavailable' });
      }

      const { AuthorityScoringService } = await import('../services/authority-scoring.service');
      const service = new AuthorityScoringService(database);
      const result = service.computeAuthority(accountId);

      return res.json({ success: true, stats: result });
    } catch (error: any) {
      return res
        .status(500)
        .json({ success: false, error: 'Authority computation failed', details: error.message });
    }
  });

  return router;
}
