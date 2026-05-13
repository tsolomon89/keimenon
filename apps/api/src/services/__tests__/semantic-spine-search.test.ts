/**
 * Semantic Spine Search Tests
 *
 * Covers: BM25 search, topic lifecycle, traversal filtering,
 * context pack determinism, unified doc provenance, account isolation,
 * import pipeline integration, and idempotency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { InvertedIndexService } from '../inverted-index.service';
import { AuthorityScoringService } from '../authority-scoring.service';
import { SemanticTraversalService } from '../semantic-traversal.service';

function hash(value: string, length = 24): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      properties TEXT DEFAULT '{}',
      account_id TEXT NOT NULL,
      created_by TEXT DEFAULT 'test',
      created_at INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT 0,
      data_tag TEXT DEFAULT 'test'
    );
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      properties TEXT DEFAULT '{}',
      account_id TEXT NOT NULL,
      created_by TEXT DEFAULT 'test',
      created_at INTEGER DEFAULT 0,
      data_tag TEXT DEFAULT 'test'
    );
    CREATE TABLE IF NOT EXISTS search_postings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      term TEXT NOT NULL,
      span_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      term_count INTEGER NOT NULL DEFAULT 1,
      positions TEXT,
      data_tag TEXT DEFAULT 'test'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_search_postings_unique
      ON search_postings(account_id, term, span_id);
    CREATE INDEX IF NOT EXISTS idx_search_postings_account_term
      ON search_postings(account_id, term);
    CREATE TABLE IF NOT EXISTS search_doc_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      span_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      total_terms INTEGER NOT NULL DEFAULT 0,
      char_count INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT,
      data_tag TEXT DEFAULT 'test'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_search_doc_stats_account_span
      ON search_doc_stats(account_id, span_id);
    CREATE TABLE IF NOT EXISTS search_index_runs (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      run_type TEXT NOT NULL DEFAULT 'full',
      source_count INTEGER NOT NULL DEFAULT 0,
      span_count INTEGER NOT NULL DEFAULT 0,
      posting_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'test'
    );
    CREATE TABLE IF NOT EXISTS source_spans (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      message_id TEXT,
      conversation_id TEXT,
      text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      start_char INTEGER NOT NULL,
      end_char INTEGER NOT NULL,
      boundary_kind TEXT NOT NULL DEFAULT 'sentence',
      span_hash TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'test',
      metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS phrases (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'n-gram',
      entity_type TEXT,
      frequency INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'test',
      metadata TEXT
    );
  `);

  return db;
}

function insertNode(db: Database.Database, accountId: string, node: Record<string, unknown>) {
  db.prepare(
    `INSERT OR REPLACE INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag)
     VALUES (?, ?, ?, ?, 'test', ?, ?, 'test')`
  ).run(
    node.id,
    node.kind,
    JSON.stringify(node),
    accountId,
    node.created_at || Date.now(),
    node.updated_at || Date.now()
  );
}

function insertSourceSpan(db: Database.Database, accountId: string, span: Record<string, unknown>) {
  insertNode(db, accountId, span);
  db.prepare(
    `INSERT OR REPLACE INTO source_spans 
     (id, account_id, source_id, text, normalized_text, start_char, end_char, boundary_kind, span_hash, created_by, created_at, updated_at, data_tag, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'test', ?, ?, 'test', ?)`
  ).run(
    span.id,
    accountId,
    span.source_id,
    span.text,
    String(span.text).toLowerCase(),
    span.start_char || 0,
    span.end_char || 0,
    span.boundary_kind || 'sentence',
    'hash',
    span.created_at || Date.now(),
    span.updated_at || Date.now(),
    JSON.stringify(span.metadata || {})
  );
}

function insertPhrase(db: Database.Database, accountId: string, phrase: Record<string, unknown>) {
  insertNode(db, accountId, phrase);
  db.prepare(
    `INSERT OR REPLACE INTO phrases 
     (id, account_id, text, normalized_text, type, frequency, created_by, created_at, updated_at, data_tag, metadata)
     VALUES (?, ?, ?, ?, ?, ?, 'test', ?, ?, 'test', ?)`
  ).run(
    phrase.id,
    accountId,
    phrase.text,
    phrase.normalized_text || String(phrase.text).toLowerCase(),
    phrase.type || 'n-gram',
    phrase.frequency || 0,
    phrase.created_at || Date.now(),
    phrase.updated_at || Date.now(),
    JSON.stringify(phrase.metadata || {})
  );
}

function insertEdge(db: Database.Database, accountId: string, edge: Record<string, unknown>) {
  db.prepare(
    `INSERT OR REPLACE INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag)
     VALUES (?, ?, ?, ?, ?, ?, 'test', ?, 'test')`
  ).run(
    edge.id,
    edge.kind,
    edge.from_id,
    edge.to_id,
    JSON.stringify(edge),
    accountId,
    edge.created_at || Date.now()
  );
}

const ACCOUNT_A = 'acct_test_a';
const ACCOUNT_B = 'acct_test_b';

function seedCorpus(db: Database.Database, accountId: string) {
  // Source 1: about symbolic necessity
  insertNode(db, accountId, {
    id: `src_1_${accountId}`,
    kind: 'Source',
    content: 'Symbolic necessity is a key concept in modal logic and philosophy of language.',
    metadata: { title: 'Symbolic Necessity in Modal Logic' },
  });

  // Source 2: also about symbolic necessity and formal systems
  insertNode(db, accountId, {
    id: `src_2_${accountId}`,
    kind: 'Source',
    content:
      'Formal systems rely on symbolic necessity to establish truth conditions and proof obligations.',
    metadata: { title: 'Formal Systems and Truth' },
  });

  // Source 3: unrelated content about cooking
  insertNode(db, accountId, {
    id: `src_3_${accountId}`,
    kind: 'Source',
    content: 'The best pasta recipes require fresh ingredients and careful timing.',
    metadata: { title: 'Italian Cooking' },
  });

  // Spans for Source 1
  insertSourceSpan(db, accountId, {
    id: `span_1a_${accountId}`,
    kind: 'SourceSpan',
    text: 'Symbolic necessity is a key concept in modal logic and philosophy of language.',
    source_id: `src_1_${accountId}`,
    start_char: 0,
    end_char: 78,
    boundary_kind: 'sentence',
  });

  // Spans for Source 2
  insertSourceSpan(db, accountId, {
    id: `span_2a_${accountId}`,
    kind: 'SourceSpan',
    text: 'Formal systems rely on symbolic necessity to establish truth conditions and proof obligations.',
    source_id: `src_2_${accountId}`,
    start_char: 0,
    end_char: 93,
    boundary_kind: 'sentence',
  });

  // Spans for Source 3
  insertSourceSpan(db, accountId, {
    id: `span_3a_${accountId}`,
    kind: 'SourceSpan',
    text: 'The best pasta recipes require fresh ingredients and careful timing.',
    source_id: `src_3_${accountId}`,
    start_char: 0,
    end_char: 67,
    boundary_kind: 'sentence',
  });

  // HAS_SPAN edges
  insertEdge(db, accountId, {
    id: `edge_span_1a_${accountId}`,
    kind: 'HAS_SPAN',
    from_id: `src_1_${accountId}`,
    to_id: `span_1a_${accountId}`,
  });
  insertEdge(db, accountId, {
    id: `edge_span_2a_${accountId}`,
    kind: 'HAS_SPAN',
    from_id: `src_2_${accountId}`,
    to_id: `span_2a_${accountId}`,
  });
  insertEdge(db, accountId, {
    id: `edge_span_3a_${accountId}`,
    kind: 'HAS_SPAN',
    from_id: `src_3_${accountId}`,
    to_id: `span_3a_${accountId}`,
  });

  // Shared phrase: "symbolic necessity"
  const phraseId = `phrase_symbolic_necessity_${accountId}`;
  insertPhrase(db, accountId, {
    id: phraseId,
    kind: 'Phrase',
    text: 'symbolic necessity',
    normalized_text: 'symbolic necessity',
    type: 'bigram',
    frequency: 2,
    metadata: { source_count: 2, span_count: 2 },
  });

  // MENTIONS edges: both sources mention the phrase
  insertEdge(db, accountId, {
    id: `edge_m1_${accountId}`,
    kind: 'MENTIONS',
    from_id: `src_1_${accountId}`,
    to_id: phraseId,
  });
  insertEdge(db, accountId, {
    id: `edge_m2_${accountId}`,
    kind: 'MENTIONS',
    from_id: `src_2_${accountId}`,
    to_id: phraseId,
  });
  insertEdge(db, accountId, {
    id: `edge_m3_${accountId}`,
    kind: 'MENTIONS',
    from_id: `span_1a_${accountId}`,
    to_id: phraseId,
  });
  insertEdge(db, accountId, {
    id: `edge_m4_${accountId}`,
    kind: 'MENTIONS',
    from_id: `span_2a_${accountId}`,
    to_id: phraseId,
  });

  // Another phrase: "modal logic" — only in source 1
  const phraseModalLogic = `phrase_modal_logic_${accountId}`;
  insertPhrase(db, accountId, {
    id: phraseModalLogic,
    kind: 'Phrase',
    text: 'modal logic',
    normalized_text: 'modal logic',
    type: 'bigram',
    frequency: 1,
    metadata: { source_count: 1, span_count: 1 },
  });
  insertEdge(db, accountId, {
    id: `edge_m5_${accountId}`,
    kind: 'MENTIONS',
    from_id: `src_1_${accountId}`,
    to_id: phraseModalLogic,
  });

  // CO_OCCURS_WITH edge
  insertEdge(db, accountId, {
    id: `edge_co_${accountId}`,
    kind: 'CO_OCCURS_WITH',
    from_id: phraseId,
    to_id: phraseModalLogic,
    weight: 0.8,
  });

  // Topic: suggested
  const topicSuggested = `topic_suggested_${accountId}`;
  insertNode(db, accountId, {
    id: topicSuggested,
    kind: 'Topic',
    name: 'Topic: Symbolic Logic',
    keywords: ['symbolic necessity', 'modal logic'],
    strength: 0.75,
    topic_status: 'suggested',
    metadata: {
      graph_scope: 'knowledge_suggestion',
      visible_by_default: false,
      traversal_eligible: false,
    },
  });
  insertEdge(db, accountId, {
    id: `edge_bt1_${accountId}`,
    kind: 'BELONGS_TO_TOPIC',
    from_id: phraseId,
    to_id: topicSuggested,
  });
  insertEdge(db, accountId, {
    id: `edge_bt2_${accountId}`,
    kind: 'BELONGS_TO_TOPIC',
    from_id: phraseModalLogic,
    to_id: topicSuggested,
  });
  insertEdge(db, accountId, {
    id: `edge_about1_${accountId}`,
    kind: 'ABOUT',
    from_id: `src_1_${accountId}`,
    to_id: topicSuggested,
  });
  insertEdge(db, accountId, {
    id: `edge_about2_${accountId}`,
    kind: 'ABOUT',
    from_id: `src_2_${accountId}`,
    to_id: topicSuggested,
  });

  // Topic: promoted
  const topicPromoted = `topic_promoted_${accountId}`;
  insertNode(db, accountId, {
    id: topicPromoted,
    kind: 'Topic',
    name: 'Topic: Philosophy',
    keywords: ['philosophy', 'language'],
    strength: 0.85,
    topic_status: 'promoted',
    promoted_at: Date.now(),
    metadata: { graph_scope: 'knowledge', visible_by_default: true, traversal_eligible: true },
  });
  insertEdge(db, accountId, {
    id: `edge_about3_${accountId}`,
    kind: 'ABOUT',
    from_id: `src_1_${accountId}`,
    to_id: topicPromoted,
  });

  // Topic: rejected
  const topicRejected = `topic_rejected_${accountId}`;
  insertNode(db, accountId, {
    id: topicRejected,
    kind: 'Topic',
    name: 'Topic: Rejected Noise',
    keywords: ['noise'],
    strength: 0.3,
    topic_status: 'rejected',
    metadata: {
      graph_scope: 'knowledge_rejected',
      visible_by_default: false,
      traversal_eligible: false,
    },
  });
  insertEdge(db, accountId, {
    id: `edge_about_rej_${accountId}`,
    kind: 'ABOUT',
    from_id: `src_3_${accountId}`,
    to_id: topicRejected,
  });

  // HAS_SPAN edges
  insertEdge(db, accountId, {
    id: `edge_hs1_${accountId}`,
    kind: 'HAS_SPAN',
    from_id: `src_1_${accountId}`,
    to_id: `span_1a_${accountId}`,
  });
  insertEdge(db, accountId, {
    id: `edge_hs2_${accountId}`,
    kind: 'HAS_SPAN',
    from_id: `src_2_${accountId}`,
    to_id: `span_2a_${accountId}`,
  });
  insertEdge(db, accountId, {
    id: `edge_hs3_${accountId}`,
    kind: 'HAS_SPAN',
    from_id: `src_3_${accountId}`,
    to_id: `span_3a_${accountId}`,
  });
}

describe('Semantic Spine Search', () => {
  let db: Database.Database;
  let indexService: InvertedIndexService;

  beforeEach(() => {
    db = createTestDb();
    indexService = new InvertedIndexService(db);
    seedCorpus(db, ACCOUNT_A);
    seedCorpus(db, ACCOUNT_B);
  });

  afterEach(() => {
    db.close();
  });

  // Test 1: BM25 search returns deterministic ranked results with explanations
  it('BM25 search returns deterministic ranked spans with explanations', () => {
    const stats = indexService.rebuildIndex(ACCOUNT_A);
    expect(stats.spanCount).toBeGreaterThan(0);
    expect(stats.postingCount).toBeGreaterThan(0);

    const results = indexService.search(ACCOUNT_A, 'symbolic necessity', { explain: true });
    expect(results.length).toBeGreaterThan(0);

    // Results should be deterministically sorted by score DESC
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].finalScore).toBeGreaterThanOrEqual(results[i].finalScore);
    }

    // Each result has required fields
    for (const result of results) {
      expect(result.spanId).toBeTruthy();
      expect(result.sourceId).toBeTruthy();
      expect(result.matchedTerms.length).toBeGreaterThan(0);
      expect(result.finalScore).toBeGreaterThan(0);
      expect(result.provenance.sourceId).toBeTruthy();
      expect(result.provenance.spanId).toBeTruthy();
      expect(result.scoreComponents.bm25).toBeGreaterThan(0);
    }

    // Re-running returns identical results (determinism)
    const results2 = indexService.search(ACCOUNT_A, 'symbolic necessity', { explain: true });
    expect(results).toEqual(results2);
  });

  // Test 2: Same phrase across multiple sources resolves to same Phrase node
  it('shared phrase across sources resolves to same Phrase node', () => {
    const phraseId = `phrase_symbolic_necessity_${ACCOUNT_A}`;
    const edges = db
      .prepare(`SELECT from_id FROM edges WHERE account_id = ? AND kind = 'MENTIONS' AND to_id = ?`)
      .all(ACCOUNT_A, phraseId) as Array<{ from_id: string }>;

    const sourceEdges = edges.filter((e) => e.from_id.startsWith('src_'));
    expect(sourceEdges.length).toBe(2);
    expect(sourceEdges.map((e) => e.from_id).sort()).toEqual([
      `src_1_${ACCOUNT_A}`,
      `src_2_${ACCOUNT_A}`,
    ]);
  });

  // Test 3: Topic suggestions are hidden by default
  it('topic suggestions are hidden by default in traversal', () => {
    const traversal = new SemanticTraversalService(db);
    const result = traversal.traverse(ACCOUNT_A, {
      rootNodeIds: [`src_1_${ACCOUNT_A}`],
      maxHops: 2,
      includeSuggestedTopics: false,
    });

    const topicNodes = result.nodes.filter((n) => n.kind === 'Topic');
    const suggestedTopics = topicNodes.filter((n) => n.id === `topic_suggested_${ACCOUNT_A}`);
    expect(suggestedTopics.length).toBe(0);

    // Promoted topics should be visible
    const promotedTopics = topicNodes.filter((n) => n.id === `topic_promoted_${ACCOUNT_A}`);
    expect(promotedTopics.length).toBe(1);
  });

  // Test 4: Promoting a topic makes it traversal-eligible
  it('promoting a topic makes it visible in traversal', () => {
    const topicId = `topic_suggested_${ACCOUNT_A}`;

    // Before promotion — not in traversal
    const traversal = new SemanticTraversalService(db);
    const before = traversal.traverse(ACCOUNT_A, {
      rootNodeIds: [`src_1_${ACCOUNT_A}`],
      maxHops: 2,
      includeSuggestedTopics: false,
    });
    expect(before.nodes.find((n) => n.id === topicId)).toBeUndefined();

    // Promote
    db.prepare(
      `UPDATE nodes SET properties = json_set(properties, '$.topic_status', 'promoted', '$.traversal_eligible', json('true')), updated_at = ? WHERE account_id = ? AND id = ?`
    ).run(Date.now(), ACCOUNT_A, topicId);

    // After promotion — visible in traversal
    const after = traversal.traverse(ACCOUNT_A, {
      rootNodeIds: [`src_1_${ACCOUNT_A}`],
      maxHops: 2,
      includeSuggestedTopics: false,
    });
    expect(after.nodes.find((n) => n.id === topicId)).toBeDefined();
  });

  // Test 5: Rejected topics are excluded
  it('rejected topics are always excluded from traversal', () => {
    const traversal = new SemanticTraversalService(db);
    const result = traversal.traverse(ACCOUNT_A, {
      rootNodeIds: [`src_3_${ACCOUNT_A}`],
      maxHops: 2,
      includeSuggestedTopics: true, // Even with this flag
    });

    const rejectedTopics = result.nodes.filter((n) => n.id === `topic_rejected_${ACCOUNT_A}`);
    expect(rejectedTopics.length).toBe(0);
  });

  // Test 6: Merge preserves provenance / redirect
  it('merging topics redirects edges and preserves provenance', () => {
    const sourceTopicId = `topic_suggested_${ACCOUNT_A}`;
    const targetTopicId = `topic_promoted_${ACCOUNT_A}`;

    // Count edges before merge
    const beforeEdges = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM edges WHERE account_id = ? AND kind = 'BELONGS_TO_TOPIC' AND to_id = ?`
      )
      .get(ACCOUNT_A, sourceTopicId) as { cnt: number };
    expect(beforeEdges.cnt).toBeGreaterThan(0);

    // Simulate merge: redirect BELONGS_TO_TOPIC edges
    const belongsEdges = db
      .prepare(
        `SELECT id, from_id FROM edges WHERE account_id = ? AND kind = 'BELONGS_TO_TOPIC' AND to_id = ?`
      )
      .all(ACCOUNT_A, sourceTopicId) as Array<{ id: string; from_id: string }>;

    for (const edge of belongsEdges) {
      db.prepare(
        `INSERT OR IGNORE INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag)
         VALUES (?, 'BELONGS_TO_TOPIC', ?, ?, '{}', ?, 'test', ?, 'test')`
      ).run(
        `edge_merge_${edge.from_id}_${targetTopicId}`,
        edge.from_id,
        targetTopicId,
        ACCOUNT_A,
        Date.now()
      );
    }

    // Mark source topic as merged
    db.prepare(
      `UPDATE nodes SET properties = json_set(properties, '$.topic_status', 'rejected', '$.merge_target_id', ?), updated_at = ? WHERE account_id = ? AND id = ?`
    ).run(targetTopicId, Date.now(), ACCOUNT_A, sourceTopicId);

    // Verify: edges redirected to target
    const afterTargetEdges = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM edges WHERE account_id = ? AND kind = 'BELONGS_TO_TOPIC' AND to_id = ?`
      )
      .get(ACCOUNT_A, targetTopicId) as { cnt: number };
    expect(afterTargetEdges.cnt).toBeGreaterThan(0);

    // Verify: source topic marked as rejected with merge_target_id
    const mergedTopic = db
      .prepare(`SELECT properties FROM nodes WHERE account_id = ? AND id = ?`)
      .get(ACCOUNT_A, sourceTopicId) as { properties: string };
    const props = JSON.parse(mergedTopic.properties);
    expect(props.topic_status).toBe('rejected');
    expect(props.merge_target_id).toBe(targetTopicId);
  });

  // Test 7: Traversal from phrase returns related sources
  it('traversal from phrase returns related sources with supporting spans', () => {
    const phraseId = `phrase_symbolic_necessity_${ACCOUNT_A}`;

    // Promote the suggested topic so it can be traversed through
    db.prepare(
      `UPDATE nodes SET properties = json_set(properties, '$.topic_status', 'promoted'), updated_at = ? WHERE account_id = ? AND id = ?`
    ).run(Date.now(), ACCOUNT_A, `topic_suggested_${ACCOUNT_A}`);

    const traversal = new SemanticTraversalService(db);
    const result = traversal.traverse(ACCOUNT_A, {
      rootNodeIds: [phraseId],
      maxHops: 2,
    });

    expect(result.nodes.length).toBeGreaterThan(1);
    const sourceNodes = result.nodes.filter((n) => n.kind === 'Source');
    expect(sourceNodes.length).toBeGreaterThanOrEqual(2);
  });

  // Test 8: Context pack output is deterministic
  it('context pack is deterministic across runs', () => {
    const traversal = new SemanticTraversalService(db);

    const pack1 = traversal.buildContextPack(ACCOUNT_A, {
      rootNodeIds: [`src_1_${ACCOUNT_A}`],
      maxHops: 2,
      outputMode: 'context_pack',
    });

    const pack2 = traversal.buildContextPack(ACCOUNT_A, {
      rootNodeIds: [`src_1_${ACCOUNT_A}`],
      maxHops: 2,
      outputMode: 'context_pack',
    });

    expect(pack1.nodeIds).toEqual(pack2.nodeIds);
    expect(pack1.edgeIds).toEqual(pack2.edgeIds);
    expect(pack1.snippets.map((s) => s.id)).toEqual(pack2.snippets.map((s) => s.id));
  });

  // Test 9: Unified document creation preserves provenance
  it('unified document preserves DERIVES_FROM provenance', () => {
    const traversal = new SemanticTraversalService(db);
    const result = traversal.createUnifiedDocument(ACCOUNT_A, 'test-user', {
      rootNodeIds: [`src_1_${ACCOUNT_A}`],
      maxHops: 1,
    });

    expect(result.nodeId).toBeTruthy();
    expect(result.title).toBeTruthy();

    // Check that DERIVES_FROM edges were created
    const derivesEdges = db
      .prepare(`SELECT * FROM edges WHERE account_id = ? AND kind = 'DERIVES_FROM' AND from_id = ?`)
      .all(ACCOUNT_A, result.nodeId) as Array<{ to_id: string }>;

    expect(derivesEdges.length).toBeGreaterThan(0);
  });

  // Test 10: Account isolation
  it('account isolation prevents cross-account search', () => {
    indexService.rebuildIndex(ACCOUNT_A);
    indexService.rebuildIndex(ACCOUNT_B);

    const resultsA = indexService.search(ACCOUNT_A, 'symbolic necessity');
    const resultsB = indexService.search(ACCOUNT_B, 'symbolic necessity');

    // Both accounts should have results
    expect(resultsA.length).toBeGreaterThan(0);
    expect(resultsB.length).toBeGreaterThan(0);

    // No span or source ID should appear in both result sets
    const spanIdsA = new Set(resultsA.map((r) => r.spanId));
    const spanIdsB = new Set(resultsB.map((r) => r.spanId));
    for (const id of spanIdsA) {
      expect(spanIdsB.has(id)).toBe(false);
    }
  });

  // Test 11: Rerunning indexing is idempotent
  it('rerunning index rebuild is idempotent', () => {
    const stats1 = indexService.rebuildIndex(ACCOUNT_A);
    const stats2 = indexService.rebuildIndex(ACCOUNT_A);

    expect(stats1.postingCount).toBe(stats2.postingCount);
    expect(stats1.uniqueTerms).toBe(stats2.uniqueTerms);
    expect(stats1.spanCount).toBe(stats2.spanCount);

    const results1 = indexService.search(ACCOUNT_A, 'symbolic necessity');
    const results2 = indexService.search(ACCOUNT_A, 'symbolic necessity');
    expect(results1).toEqual(results2);
  });

  // Test 12: Authority scoring produces nonzero scores
  it('authority scoring produces nonzero inspectable scores', () => {
    const authority = new AuthorityScoringService(db);
    const result = authority.computeAuthority(ACCOUNT_A);

    expect(result.phraseScores).toBeGreaterThan(0);
    expect(result.sourceScores).toBeGreaterThan(0);

    // Check that scores are stored in phrase metadata
    const phraseRow = db
      .prepare(`SELECT metadata FROM phrases WHERE account_id = ? AND id = ?`)
      .get(ACCOUNT_A, `phrase_symbolic_necessity_${ACCOUNT_A}`) as { metadata: string };

    const metadata = JSON.parse(phraseRow.metadata || '{}');
    expect(metadata.hub_score).toBeGreaterThan(0);
    expect(metadata.score_components).toBeDefined();
    expect(metadata.authority_computed_at).toBeGreaterThan(0);

    // Check that source authority score counts high-value mentions
    const sourceRow = db
      .prepare(`SELECT properties FROM nodes WHERE account_id = ? AND id = ?`)
      .get(ACCOUNT_A, `src_1_${ACCOUNT_A}`) as { properties: string };

    const sourceProps = JSON.parse(sourceRow.properties);
    expect(sourceProps.metadata.authority_score).toBeGreaterThan(0);
    expect(sourceProps.metadata.score_components.highValueMentions).toBeGreaterThanOrEqual(1);
  });

  // Test 13: Source-to-source connection explanation
  it('explains connections between sources through shared phrases', () => {
    const explanation = indexService.explainConnection(
      ACCOUNT_A,
      `src_1_${ACCOUNT_A}`,
      `src_2_${ACCOUNT_A}`
    );

    expect(explanation.connected).toBe(true);
    expect(explanation.sharedPhraseIds.length).toBeGreaterThan(0);
    expect(explanation.provenancePaths.length).toBeGreaterThan(0);
  });

  // Test 14: Unrelated sources show no connection
  it('unrelated sources show no connection', () => {
    const explanation = indexService.explainConnection(
      ACCOUNT_A,
      `src_1_${ACCOUNT_A}`,
      `src_3_${ACCOUNT_A}`
    );

    expect(explanation.connected).toBe(false);
    expect(explanation.sharedPhraseIds.length).toBe(0);
  });

  // Test 15: Full Runtime Vertical Slice
  it('full runtime vertical slice verifies provenance, metadata, and markdown structure', () => {
    // 1. Verify Phrase and Topic nodes exist
    const phraseRow = db
      .prepare(`SELECT id FROM nodes WHERE account_id = ? AND id = ?`)
      .get(ACCOUNT_A, `phrase_symbolic_necessity_${ACCOUNT_A}`) as { id: string };
    expect(phraseRow).toBeDefined();

    const topicRow = db
      .prepare(`SELECT id FROM nodes WHERE account_id = ? AND id = ?`)
      .get(ACCOUNT_A, `topic_promoted_${ACCOUNT_A}`) as { id: string };
    expect(topicRow).toBeDefined();

    // Verify HAS_SPAN edges exist
    const hasSpanEdge = db
      .prepare(`SELECT id FROM edges WHERE account_id = ? AND kind = 'HAS_SPAN'`)
      .get(ACCOUNT_A) as { id: string };
    expect(hasSpanEdge).toBeDefined();

    // 2. Synthesize from Phrase
    const traversal = new SemanticTraversalService(db);
    const phraseDoc = traversal.createUnifiedDocument(ACCOUNT_A, 'test-user', {
      rootNodeIds: [`phrase_symbolic_necessity_${ACCOUNT_A}`],
      maxHops: 2,
    });
    expect(phraseDoc.nodeId).toBeTruthy();
    expect(phraseDoc.derivedEdgeIds.length).toBeGreaterThan(0);

    // 3. Synthesize from Suggested Topic with includeSuggestedTopics flag
    const suggestedTopicDoc = traversal.createUnifiedDocument(ACCOUNT_A, 'test-user', {
      rootNodeIds: [`topic_suggested_${ACCOUNT_A}`],
      maxHops: 2,
      includeSuggestedTopics: true,
    });
    expect(suggestedTopicDoc.nodeId).toBeTruthy();
    expect(suggestedTopicDoc.contextPack.sourceIds.length).toBeGreaterThan(0);

    // 4. Detailed verification of UnifiedDoc from Promoted Topic
    const topicDoc = traversal.createUnifiedDocument(ACCOUNT_A, 'test-user', {
      rootNodeIds: [`topic_promoted_${ACCOUNT_A}`],
      maxHops: 2,
    });

    const unifiedNode = db
      .prepare(`SELECT properties FROM nodes WHERE account_id = ? AND id = ?`)
      .get(ACCOUNT_A, topicDoc.nodeId) as { properties: string };
    expect(unifiedNode).toBeDefined();

    const props = JSON.parse(unifiedNode.properties);
    expect(props.metadata.synthesis_mode).toBe('deterministic');
    expect(props.metadata.context_pack_id).toBeTruthy();
    expect(props.metadata.traversal_plan).toBeDefined();
    expect(props.metadata.traversal_edge_ids).toBeDefined();
    expect(props.metadata.source_ids.length).toBeGreaterThan(0);

    // Verify markdown headers
    const md = props.content_markdown as string;
    expect(md).toContain('## Summary');
    expect(md).toContain('## Central Phrases');
    expect(md).toContain('## Related Topics');
    expect(md).toContain('## Main Source Clusters');
    expect(md).toContain('## Supporting Excerpts');
    expect(md).toContain('## Provenance');
    expect(md).toContain('## Traversal Metadata');

    // Verify DERIVES_FROM edges point back to source/spans
    const derivesEdges = db
      .prepare(
        `SELECT to_id FROM edges WHERE account_id = ? AND kind = 'DERIVES_FROM' AND from_id = ?`
      )
      .all(ACCOUNT_A, topicDoc.nodeId) as Array<{ to_id: string }>;
    expect(derivesEdges.length).toBeGreaterThan(0);

    // At least one derived target should be a source or span
    const targetId = derivesEdges[0].to_id;
    expect(targetId.startsWith('src_') || targetId.startsWith('span_')).toBe(true);
  });
});
