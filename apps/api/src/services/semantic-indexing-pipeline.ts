/**
 * Semantic Indexing Pipeline
 *
 * Cohesive service boundary for post-import semantic processing.
 * Called after source/message materialization to build the searchable spine.
 *
 * Idempotent: re-running for the same account/source set does not duplicate
 * nodes, edges, or search postings.
 *
 * Pipeline stages:
 * 1. SourceSpan materialization (if not already present)
 * 2. Phrase extraction + MENTIONS edges
 * 3. CO_OCCURS_WITH edges
 * 4. Topic suggestions
 * 5. Inverted-index updates
 * 6. Authority scoring
 */

import { createHash } from 'crypto';
import type Database from 'better-sqlite3';
import { SemanticSpineService, type SemanticSpineBuildConfig } from './semantic-spine.service';
import { InvertedIndexService } from './inverted-index.service';
import { AuthorityScoringService } from './authority-scoring.service';

export interface SemanticIndexingInput {
  accountId: string;
  userId: string;
  sourceIds?: string[];
  importJobId?: string;
  spineConfig?: Partial<SemanticSpineBuildConfig>;
}

export interface SemanticIndexingResult {
  sourceCount: number;
  spanCount: number;
  spineStats: {
    lexemes: number;
    phrases: number;
    topics: number;
  };
  indexStats: {
    postingCount: number;
    uniqueTerms: number;
  };
  authorityStats: {
    phraseScores: number;
    sourceScores: number;
    topicScores: number;
  };
  durationMs: number;
}

interface NodeRow {
  id: string;
  kind: string;
  properties: string;
}

export class SemanticIndexingPipeline {
  private readonly spine: SemanticSpineService;
  private readonly indexService: InvertedIndexService;
  private readonly authorityService: AuthorityScoringService;

  constructor(private readonly db: Database.Database) {
    this.spine = new SemanticSpineService();
    this.indexService = new InvertedIndexService(db);
    this.authorityService = new AuthorityScoringService(db);
  }

  /**
   * Run the full semantic indexing pipeline for an import or explicit rebuild.
   * Idempotent: uses INSERT OR REPLACE semantics throughout.
   */
  async runForImport(input: SemanticIndexingInput): Promise<SemanticIndexingResult> {
    const startTime = Date.now();
    const { accountId, userId } = input;

    // 1. Resolve sources
    const sources = this.loadSources(accountId, input.sourceIds, input.importJobId);
    if (sources.length === 0) {
      return this.emptyResult(Date.now() - startTime);
    }

    // 2. Ensure SourceSpans exist (idempotent)
    const spans = this.ensureSpans(accountId, userId, sources);

    // 3. Build semantic spine (phrases, co-occurrence, topics)
    const spineConfig: Required<SemanticSpineBuildConfig> = {
      enabled: input.spineConfig?.enabled ?? true,
      extractLexemes: input.spineConfig?.extractLexemes ?? true,
      extractPhrases: input.spineConfig?.extractPhrases ?? true,
      clusterTopics: input.spineConfig?.clusterTopics ?? true,
      minPhraseFrequency: input.spineConfig?.minPhraseFrequency ?? 1,
      minPhrasesPerTopic: input.spineConfig?.minPhrasesPerTopic ?? 2,
    };

    let spineStats = { lexemes: 0, phrases: 0, topics: 0 };

    if (spineConfig.enabled) {
      spineStats = await this.spine.buildForSources({
        accountId,
        userId,
        sources: sources.map((s) => ({
          id: s.id,
          content: s.content,
          conversationId: s.conversationId,
          messageIds: s.messageIds,
        })),
        spans: spans.map((s) => ({
          id: s.id,
          sourceId: s.sourceId,
          text: s.text,
          normalizedText: s.normalizedText,
          startChar: s.startChar,
          endChar: s.endChar,
          boundaryKind: s.boundaryKind as 'line' | 'sentence' | 'paragraph' | 'token_window',
        })),
        config: spineConfig,
        write: {
          writeNode: async (node) => this.writeNodeIfAbsent(accountId, userId, node),
          writeEdge: async (edge) => this.writeEdgeIfAbsent(accountId, userId, edge),
        },
      });

      // 4. Apply topic_status: 'suggested' to newly created topics
      this.applyTopicSuggestedStatus(accountId);
    }

    // 5. Build/update inverted index
    let indexStats = { postingCount: 0, uniqueTerms: 0 };
    if (this.indexService.hasIndexTables()) {
      const idxResult = this.indexService.rebuildIndex(accountId);
      indexStats = {
        postingCount: idxResult.postingCount,
        uniqueTerms: idxResult.uniqueTerms,
      };
    }

    // 6. Compute authority scores
    const authorityStats = this.authorityService.computeAuthority(accountId);

    return {
      sourceCount: sources.length,
      spanCount: spans.length,
      spineStats: {
        lexemes: spineStats.lexemes,
        phrases: spineStats.phrases,
        topics: spineStats.topics,
      },
      indexStats,
      authorityStats: {
        phraseScores: authorityStats.phraseScores,
        sourceScores: authorityStats.sourceScores,
        topicScores: authorityStats.topicScores,
      },
      durationMs: Date.now() - startTime,
    };
  }

  // ─── Source loading ───

  private loadSources(
    accountId: string,
    sourceIds?: string[],
    importJobId?: string
  ): Array<{
    id: string;
    content: string;
    conversationId?: string;
    messageIds?: string[];
  }> {
    let whereClause = `account_id = ? AND kind = 'Source'`;
    const params: unknown[] = [accountId];

    if (sourceIds && sourceIds.length > 0) {
      const placeholders = sourceIds.map(() => '?').join(', ');
      whereClause += ` AND id IN (${placeholders})`;
      params.push(...sourceIds);
    }

    if (importJobId) {
      whereClause += ` AND (
        json_extract(properties, '$.metadata.import_id') = ?
        OR json_extract(properties, '$.metadata.importId') = ?
        OR json_extract(properties, '$.metadata.import_batch') = ?
      )`;
      params.push(importJobId, importJobId, importJobId);
    }

    const rows = this.db
      .prepare(
        `SELECT id, properties FROM nodes WHERE ${whereClause} ORDER BY created_at ASC, id ASC`
      )
      .all(...params) as NodeRow[];

    return rows
      .map((row) => {
        const props = this.parseProperties(row.properties);
        const content = typeof props.content === 'string' ? props.content : '';
        const metadata = (props.metadata || {}) as Record<string, unknown>;

        return {
          id: row.id,
          content,
          conversationId:
            typeof metadata.conversation_id === 'string' ? metadata.conversation_id : undefined,
          messageIds: Array.isArray(metadata.message_ids)
            ? metadata.message_ids.map((v: unknown) => String(v))
            : undefined,
        };
      })
      .filter((s) => s.content.length > 0);
  }

  // ─── Span materialization ───

  private ensureSpans(
    accountId: string,
    userId: string,
    sources: Array<{ id: string; content: string; conversationId?: string }>
  ): Array<{
    id: string;
    sourceId: string;
    text: string;
    normalizedText: string;
    startChar: number;
    endChar: number;
    boundaryKind: string;
  }> {
    const allSpans: Array<{
      id: string;
      sourceId: string;
      text: string;
      normalizedText: string;
      startChar: number;
      endChar: number;
      boundaryKind: string;
    }> = [];

    for (const source of sources) {
      // Check if spans already exist for this source
      const existingSpans = this.db
        .prepare(
          `SELECT id, properties FROM nodes
           WHERE account_id = ? AND kind = 'SourceSpan'
             AND json_extract(properties, '$.source_id') = ?
           ORDER BY created_at ASC, id ASC`
        )
        .all(accountId, source.id) as NodeRow[];

      if (existingSpans.length > 0) {
        for (const row of existingSpans) {
          const props = this.parseProperties(row.properties);
          allSpans.push({
            id: row.id,
            sourceId: source.id,
            text: String(props.text || ''),
            normalizedText: String(props.normalized_text || ''),
            startChar: Number(props.start_char || 0),
            endChar: Number(props.end_char || 0),
            boundaryKind: String(props.boundary_kind || 'sentence'),
          });
        }
        continue;
      }

      // Create spans from source content
      const generatedSpans = this.spine.splitIntoSpans(source);
      const now = Date.now();

      for (const span of generatedSpans) {
        this.writeNodeIfAbsent(accountId, userId, {
          id: span.id,
          kind: 'SourceSpan',
          source_id: span.sourceId,
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
            rebuilt_by: 'semantic-indexing-pipeline',
          },
        });

        this.writeEdgeIfAbsent(accountId, userId, {
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

        allSpans.push({
          id: span.id,
          sourceId: span.sourceId,
          text: span.text,
          normalizedText: span.normalizedText || span.text.toLowerCase(),
          startChar: span.startChar ?? 0,
          endChar: span.endChar ?? span.text.length,
          boundaryKind: span.boundaryKind || 'sentence',
        });
      }
    }

    return allSpans;
  }

  // ─── Topic status ───

  /**
   * Set topic_status: 'suggested' on any Topic node that doesn't already have a status.
   * This ensures new auto-created topics default to suggested/invisible.
   */
  private applyTopicSuggestedStatus(accountId: string): void {
    this.db
      .prepare(
        `UPDATE nodes SET
           properties = json_set(
             properties,
             '$.topic_status', 'suggested',
             '$.visible_by_default', json('false'),
             '$.traversal_eligible', json('false'),
             '$.metadata.graph_scope', 'knowledge_suggestion'
           ),
           updated_at = ?
         WHERE account_id = ? AND kind = 'Topic'
           AND (
             json_extract(properties, '$.topic_status') IS NULL
             OR json_extract(properties, '$.topic_status') = ''
           )`
      )
      .run(Date.now(), accountId);
  }

  // ─── Write helpers (idempotent via INSERT OR REPLACE) ───

  private writeNodeIfAbsent(
    accountId: string,
    userId: string,
    node: Record<string, unknown>
  ): void {
    const existing = this.db
      .prepare('SELECT id FROM nodes WHERE account_id = ? AND id = ?')
      .get(accountId, node.id) as { id?: string } | undefined;

    if (existing?.id) {
      return;
    }

    const columns = this.tableColumns('nodes');
    const names = [
      'id',
      'kind',
      'properties',
      'account_id',
      'created_by',
      'created_at',
      'updated_at',
    ].filter((col) => columns.has(col));
    const values: Record<string, unknown> = {
      id: node.id,
      kind: node.kind,
      properties: JSON.stringify(node),
      account_id: accountId,
      created_by: userId,
      created_at: node.created_at || Date.now(),
      updated_at: node.updated_at || Date.now(),
    };
    if (columns.has('data_tag')) {
      names.push('data_tag');
      values.data_tag = 'real';
    }

    const placeholders = names.map(() => '?').join(', ');
    this.db
      .prepare(`INSERT OR IGNORE INTO nodes (${names.join(', ')}) VALUES (${placeholders})`)
      .run(...names.map((n) => values[n]));
  }

  private writeEdgeIfAbsent(
    accountId: string,
    userId: string,
    edge: Record<string, unknown>
  ): void {
    const existing = this.db
      .prepare('SELECT id FROM edges WHERE account_id = ? AND id = ?')
      .get(accountId, edge.id) as { id?: string } | undefined;

    if (existing?.id) {
      return;
    }

    const columns = this.tableColumns('edges');
    const names = [
      'id',
      'kind',
      'from_id',
      'to_id',
      'properties',
      'account_id',
      'created_by',
      'created_at',
    ].filter((col) => columns.has(col));
    const values: Record<string, unknown> = {
      id: edge.id,
      kind: edge.kind,
      from_id: edge.from || edge.from_id,
      to_id: edge.to || edge.to_id,
      properties: JSON.stringify(edge),
      account_id: accountId,
      created_by: userId,
      created_at: edge.created_at || Date.now(),
    };
    if (columns.has('data_tag')) {
      names.push('data_tag');
      values.data_tag = 'real';
    }

    const placeholders = names.map(() => '?').join(', ');
    this.db
      .prepare(`INSERT OR IGNORE INTO edges (${names.join(', ')}) VALUES (${placeholders})`)
      .run(...names.map((n) => values[n]));
  }

  private tableColumns(tableName: 'nodes' | 'edges'): Set<string> {
    const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      name: string;
    }>;
    return new Set(rows.map((row) => row.name));
  }

  private emptyResult(durationMs: number): SemanticIndexingResult {
    return {
      sourceCount: 0,
      spanCount: 0,
      spineStats: { lexemes: 0, phrases: 0, topics: 0 },
      indexStats: { postingCount: 0, uniqueTerms: 0 },
      authorityStats: { phraseScores: 0, sourceScores: 0, topicScores: 0 },
      durationMs,
    };
  }

  private parseProperties(raw: unknown): Record<string, unknown> {
    if (typeof raw !== 'string' || raw.length === 0) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
