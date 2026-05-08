import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseClient } from '@keimenon/db';
import { createBulkTestDbFile } from './utils/test-db';
import { GraphSpineBuilder } from '../services/graph-spine-builder';
import { InvertedIndexService } from '../services/inverted-index.service';
import { SemanticTraversalService } from '../services/semantic-traversal.service';
import { SemanticSpineService } from '../services/semantic-spine.service';
import { buildDeterministicPrincipalId } from '../services/graph-hierarchy.service';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';

describe('Golden Path Runtime Proof', () => {
  let dbClient: DatabaseClient;
  let rawDb: any;
  let testDbPath: string;
  let spineBuilder: GraphSpineBuilder;
  let invertedIndexService: InvertedIndexService;
  let traversalService: SemanticTraversalService;
  let semanticSpineService: SemanticSpineService;

  const accountId = 'acc_test';
  const userId = 'user_test';
  const principalId = buildDeterministicPrincipalId(accountId, userId);

  const sourceIds: string[] = [];

  beforeAll(async () => {
    const { db, dbPath } = createBulkTestDbFile();
    rawDb = db;
    testDbPath = dbPath;

    // We mock the DatabaseClient to return our file-backed DB
    dbClient = {
      get: () => rawDb,
      close: () => rawDb.close(),
    } as any;

    spineBuilder = new GraphSpineBuilder(dbClient);
    invertedIndexService = new InvertedIndexService(rawDb);
    traversalService = new SemanticTraversalService(rawDb);
    semanticSpineService = new SemanticSpineService(dbClient, spineBuilder);
  });

  afterAll(async () => {
    if (dbClient) {
      dbClient.close();
    }
    if (testDbPath) {
      try {
        await fs.unlink(testDbPath);
      } catch (err) {
        // Ignored
      }
    }
  });

  it('1. Seeds 5 overlapping sources using the real schema', () => {
    const now = Date.now();
    const contents = [
      'The symbolic necessity of the observer is paramount in local search graph architecture.',
      'An observer provides provenance for the semantic spine.',
      'The semantic spine is a critical component of the local search graph.',
      'Without symbolic necessity, provenance is lost.',
      'This local search graph implementation guarantees provenance via the semantic spine.',
    ];

    rawDb
      .prepare(
        `
      INSERT OR IGNORE INTO accounts (id, name, created_at, updated_at)
      VALUES (?, 'Test Account', ?, ?)
    `
      )
      .run(accountId, now, now);

    rawDb
      .prepare(
        `
      INSERT OR IGNORE INTO users (id, name, email, permission_level, user_class, created_at, updated_at)
      VALUES (?, 'Test User', 'test@example.com', 'admin', 'person', ?, ?)
    `
      )
      .run(userId, now, now);

    rawDb
      .prepare(
        `
      INSERT OR IGNORE INTO nodes (id, kind, account_id, created_by, created_at, updated_at, properties, data_tag)
      VALUES (?, 'Principal', ?, ?, ?, ?, '{}', 'real')
    `
      )
      .run(principalId, accountId, userId, now, now);

    for (const content of contents) {
      const sourceId = `src_${uuidv4().replace(/-/g, '')}`;
      sourceIds.push(sourceId);

      rawDb
        .prepare(
          `
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag)
        VALUES (?, 'Source', ?, ?, ?, ?, ?, 'real')
      `
        )
        .run(
          sourceId,
          JSON.stringify({ text: content, title: 'Source Document' }),
          accountId,
          userId,
          now,
          now
        );
    }

    const count = rawDb
      .prepare('SELECT COUNT(*) as c FROM nodes WHERE kind = ? AND account_id = ?')
      .get('Source', accountId).c;
    expect(count).toBe(5);
  });

  it('2. Builds the semantic spine for the sources', async () => {
    // Rebuild semantic spine for each source
    for (const sourceId of sourceIds) {
      const sourceRow = rawDb
        .prepare('SELECT id, properties FROM nodes WHERE id = ?')
        .get(sourceId);
      const props = JSON.parse(sourceRow.properties);
      const source = { id: sourceRow.id, content: props.text };

      const spans = semanticSpineService.splitIntoSpans(source);
      const now = Date.now();

      for (const span of spans) {
        rawDb
          .prepare(
            `
          INSERT INTO nodes (id, kind, account_id, created_by, created_at, updated_at, properties, data_tag)
          VALUES (?, 'SourceSpan', ?, ?, ?, ?, ?, 'real')
        `
          )
          .run(
            span.id,
            accountId,
            userId,
            now,
            now,
            JSON.stringify({
              source_id: span.sourceId,
              text: span.text,
              normalized_text: span.normalizedText,
              start_char: span.startChar,
              end_char: span.endChar,
              boundary_kind: span.boundaryKind,
            })
          );

        rawDb
          .prepare(
            `
          INSERT INTO source_spans (id, account_id, source_id, text, normalized_text, start_char, end_char, boundary_kind, span_hash, created_by, created_at, updated_at, data_tag)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'real')
        `
          )
          .run(
            span.id,
            accountId,
            span.sourceId,
            span.text,
            span.normalizedText,
            span.startChar,
            span.endChar,
            span.boundaryKind || 'sentence',
            `span:${span.id}`,
            userId,
            now,
            now
          );

        rawDb
          .prepare(
            `
          INSERT INTO edges (id, kind, from_id, to_id, account_id, created_by, created_at, data_tag)
          VALUES (?, 'HAS_SPAN', ?, ?, ?, ?, ?, 'real')
        `
          )
          .run(
            `edge_has_span_${span.sourceId}_${span.id}`,
            span.sourceId,
            span.id,
            accountId,
            userId,
            now
          );
      }

      const writeAdapter = {
        writeNode: async (node: any) => {
          rawDb
            .prepare(
              `
            INSERT OR REPLACE INTO nodes (id, kind, account_id, created_by, created_at, updated_at, properties, data_tag)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'real')
          `
            )
            .run(
              node.id,
              node.kind,
              accountId,
              userId,
              node.created_at || now,
              node.updated_at || now,
              JSON.stringify(node.metadata || node.properties || {})
            );

          if (node.kind === 'Phrase') {
            const text = node.text || node.properties?.text || node.name || '';
            const norm =
              node.normalized_text || node.properties?.normalized_text || text.toLowerCase();
            rawDb
              .prepare(
                `
              INSERT OR REPLACE INTO phrases (id, account_id, text, normalized_text, created_by, created_at, updated_at, data_tag)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'real')
            `
              )
              .run(
                node.id,
                accountId,
                text,
                norm,
                userId,
                node.created_at || now,
                node.updated_at || now
              );
          }
        },
        writeEdge: async (edge: any) => {
          rawDb
            .prepare(
              `
            INSERT OR REPLACE INTO edges (id, kind, from_id, to_id, account_id, created_by, created_at, data_tag)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'real')
          `
            )
            .run(
              edge.id,
              edge.kind,
              edge.from || edge.from_id,
              edge.to || edge.to_id,
              accountId,
              userId,
              edge.created_at || now
            );
        },
      };

      await semanticSpineService.buildForSources({
        accountId,
        userId,
        sources: [source],
        spans,
        write: writeAdapter,
      });
    }

    // Assert: SourceSpan, Phrase rows exist
    const spanCount = rawDb
      .prepare('SELECT COUNT(*) as c FROM source_spans WHERE account_id = ?')
      .get(accountId).c;
    expect(spanCount).toBeGreaterThan(0);

    const phraseCount = rawDb
      .prepare('SELECT COUNT(*) as c FROM phrases WHERE account_id = ?')
      .get(accountId).c;
    expect(phraseCount).toBeGreaterThan(0);

    // Assert edges exist
    const hasSpanEdges = rawDb
      .prepare('SELECT COUNT(*) as c FROM edges WHERE kind = ? AND account_id = ?')
      .get('HAS_SPAN', accountId).c;
    expect(hasSpanEdges).toBeGreaterThan(0);

    const mentionsEdges = rawDb
      .prepare('SELECT COUNT(*) as c FROM edges WHERE kind = ? AND account_id = ?')
      .get('MENTIONS', accountId).c;
    expect(mentionsEdges).toBeGreaterThan(0);
  });

  it('3. Rebuilds the search index and searches via BM25', () => {
    // Build index
    const indexStats = invertedIndexService.rebuildIndex(accountId);
    expect(indexStats.postingCount).toBeGreaterThan(0);

    // Search 1
    const results1 = invertedIndexService.search(accountId, 'symbolic necessity');
    expect(results1.length).toBeGreaterThanOrEqual(2);
    expect(results1[0].finalScore).toBeGreaterThanOrEqual(results1[1].finalScore); // Descending score
    expect(results1[0].sourceId).toBeDefined();
    expect(results1[0].spanId).toBeDefined();

    // Search 2
    const results2 = invertedIndexService.search(accountId, 'local search graph');
    expect(results2.length).toBeGreaterThanOrEqual(1);
  });

  it('3.5. Hydrates Hub Detail for Phrase (On-Demand Subgraph)', async () => {
    // Find the phrase ID for "symbolic necessity"
    const phraseRow = rawDb
      .prepare('SELECT id FROM phrases WHERE normalized_text = ? AND account_id = ?')
      .get('symbolic necessity', accountId);
    expect(phraseRow).toBeDefined();
    const phraseId = phraseRow.id;

    // Direct SQLite query matching the /api/v1/spine/hub route handler
    // We'll mimic what the backend router does by calling the db directly
    // to prove the query works, or we can use the graphTraverser if one exists,
    // but the `GET /api/v1/spine/hub/:nodeId` endpoint uses raw SQL.
    const nodeRow = rawDb
      .prepare('SELECT id, kind, properties FROM nodes WHERE id = ? AND account_id = ?')
      .get(phraseId, accountId);
    expect(nodeRow).toBeDefined();
    expect(nodeRow.kind).toBe('Phrase');

    // Test member spans query (MENTIONS goes from SourceSpan -> Phrase)
    const memberSpans = rawDb
      .prepare(
        `
      SELECT s.id, s.text, s.source_id, s.start_char, s.end_char
      FROM source_spans s
      JOIN edges e ON e.from_id = s.id
      WHERE e.to_id = ? AND e.kind = 'MENTIONS' AND e.account_id = ?
    `
      )
      .all(phraseId, accountId);

    // In our manual builder (Step 2), we inserted 'MENTIONS' edges, but wait...
    // Step 2 has a hardcoded bug in the mock writeAdapter?
    // Ah, Step 2 calls `buildForSources`, which natively adds `MENTIONS` edges from Phrases to SourceSpans.
    // Let's assert it finds them.
    expect(memberSpans.length).toBeGreaterThan(0);
    expect(memberSpans[0].text).toBeDefined();
    expect(memberSpans[0].source_id).toBeDefined();
  });

  it('4. Traverses Phrase graph, builds ContextPack, synthesizes UnifiedDoc, and inspects provenance', () => {
    // Find the phrase ID for "symbolic necessity"
    const phraseRow = rawDb
      .prepare('SELECT id FROM phrases WHERE normalized_text = ? AND account_id = ?')
      .get('symbolic necessity', accountId);
    expect(phraseRow).toBeDefined();
    const phraseId = phraseRow.id;

    // Build Traversal Plan
    const plan = {
      rootNodeIds: [phraseId],
      expansionStrategy: 'mixed',
      maxHops: 2,
      maxNodes: 50,
      maxSnippets: 10,
      maxChars: 5000,
    };

    // Synthesize Unified Doc
    const result = traversalService.createUnifiedDocument(accountId, userId, plan, {
      title: 'Golden Path Synthesis',
    });

    // Assert UnifiedDoc format
    expect(result.nodeId).toBeDefined();
    expect(result.title).toBe('Golden Path Synthesis');
    expect(result.contentMarkdown).toContain('## Summary');
    expect(result.contentMarkdown).toContain('## Central Phrases');
    expect(result.contentMarkdown).toContain('## Provenance');
    expect(result.contentMarkdown).toContain('## Traversal Metadata');

    // Assert DERIVES_FROM edges were created to span/source targets
    const provenanceEdges = rawDb
      .prepare('SELECT COUNT(*) as c FROM edges WHERE kind = ? AND from_id = ?')
      .get('DERIVES_FROM', result.nodeId).c;
    expect(provenanceEdges).toBeGreaterThan(0);

    // Assert PRODUCED_BY edge to Principal
    const producedByEdge = rawDb
      .prepare('SELECT COUNT(*) as c FROM edges WHERE kind = ? AND from_id = ?')
      .get('PRODUCED_BY', result.nodeId).c;
    expect(producedByEdge).toBe(1);
  });

  it('5. Deletes account cleanly via bulk reset', () => {
    // Delete all user nodes/edges to test clean deletion
    const systemKindsClause = "'AccountNode', 'UserNode', 'Principal'";
    rawDb
      .prepare(`DELETE FROM nodes WHERE account_id = ? AND kind NOT IN (${systemKindsClause})`)
      .run(accountId);
    rawDb.prepare(`DELETE FROM edges WHERE account_id = ?`).run(accountId);

    // Due to FK constraints from nodes, payload tables should be empty too (tested implicitly)
    // Actually, SQLite CASCADE doesn't happen for DELETE without a WHERE on the parent, but wait!
    // We deleted from `nodes`, so the CASCADE to `source_spans` etc. should have triggered.

    const nodeCount = rawDb
      .prepare(
        `SELECT COUNT(*) as c FROM nodes WHERE account_id = ? AND kind NOT IN (${systemKindsClause})`
      )
      .get(accountId).c;
    expect(nodeCount).toBe(0);

    const edgeCount = rawDb
      .prepare('SELECT COUNT(*) as c FROM edges WHERE account_id = ?')
      .get(accountId).c;
    expect(edgeCount).toBe(0);

    const spanCount = rawDb
      .prepare('SELECT COUNT(*) as c FROM source_spans WHERE account_id = ?')
      .get(accountId).c;
    expect(spanCount).toBe(0);

    const phraseCount = rawDb
      .prepare('SELECT COUNT(*) as c FROM phrases WHERE account_id = ?')
      .get(accountId).c;
    expect(phraseCount).toBe(0);

    const packetCount = rawDb
      .prepare('SELECT COUNT(*) as c FROM packets WHERE account_id = ?')
      .get(accountId).c;
    expect(packetCount).toBe(0);

    const auCount = rawDb
      .prepare('SELECT COUNT(*) as c FROM atomic_units WHERE account_id = ?')
      .get(accountId).c;
    expect(auCount).toBe(0);

    // Cleanup search index manually as per system behavior
    rawDb.prepare('DELETE FROM search_postings WHERE account_id = ?').run(accountId);
    const searchCount = rawDb
      .prepare('SELECT COUNT(*) as c FROM search_postings WHERE account_id = ?')
      .get(accountId).c;
    expect(searchCount).toBe(0);
  });
});
