import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { SemanticSpineService } from '../semantic-spine.service';
import { SemanticTraversalService } from '../semantic-traversal.service';
import { buildDeterministicPrincipalId } from '../graph-hierarchy.service';

const ACCOUNT_A = 'acc_semantic_a';
const ACCOUNT_B = 'acc_semantic_b';
const USER_A = 'user_semantic_a';
const USER_B = 'user_semantic_b';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      properties TEXT NOT NULL,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'real'
    );

    CREATE TABLE edges (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      properties TEXT,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'real'
    );
  `);
  return db;
}

function insertNode(
  db: Database.Database,
  accountId: string,
  userId: string,
  node: Record<string, any>
): void {
  const now = node.created_at || 1700000000000;
  db.prepare(
    `
      INSERT OR REPLACE INTO nodes
        (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'real')
    `
  ).run(node.id, node.kind, JSON.stringify(node), accountId, userId, now, node.updated_at || now);
}

function insertEdge(
  db: Database.Database,
  accountId: string,
  userId: string,
  edge: Record<string, any>
): void {
  db.prepare(
    `
      INSERT OR REPLACE INTO edges
        (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'real')
    `
  ).run(
    edge.id,
    edge.kind,
    edge.from,
    edge.to,
    JSON.stringify(edge),
    accountId,
    userId,
    edge.created_at || 1700000000000
  );
}

async function buildFixture(db: Database.Database) {
  const spine = new SemanticSpineService();
  const principalA = buildDeterministicPrincipalId(ACCOUNT_A, USER_A);
  const principalB = buildDeterministicPrincipalId(ACCOUNT_B, USER_B);

  insertNode(db, ACCOUNT_A, USER_A, {
    id: principalA,
    kind: 'Principal',
    display_name: 'User A',
    principal_kind: 'human',
    capabilities: {},
  });
  insertNode(db, ACCOUNT_B, USER_B, {
    id: principalB,
    kind: 'Principal',
    display_name: 'User B',
    principal_kind: 'human',
    capabilities: {},
  });

  const sourcesA = [
    {
      id: 'source_a_symbolic',
      content:
        'Symbolic necessity appears when a proof obligation becomes a structural constraint. Modal coherence governs which transformations remain valid.',
    },
    {
      id: 'source_a_modal',
      content:
        'The second chat revisits symbolic necessities. Symbolic necessity connects agent traversal with modal coherence and source-backed synthesis.',
    },
  ];
  const sourcesB = [
    {
      id: 'source_b_symbolic',
      content:
        'Symbolic necessity belongs to another account and must not appear in account A traversal.',
    },
  ];

  for (const source of sourcesA) {
    insertNode(db, ACCOUNT_A, USER_A, {
      id: source.id,
      kind: 'Source',
      title: source.id,
      fingerprint: source.id,
      mime_type: 'text/plain',
      size_bytes: source.content.length,
      metadata: { graph_scope: 'knowledge' },
    });
  }
  for (const source of sourcesB) {
    insertNode(db, ACCOUNT_B, USER_B, {
      id: source.id,
      kind: 'Source',
      title: source.id,
      fingerprint: source.id,
      mime_type: 'text/plain',
      size_bytes: source.content.length,
      metadata: { graph_scope: 'knowledge' },
    });
  }

  const spansA = sourcesA.flatMap((source) => spine.splitIntoSpans(source));
  const spansB = sourcesB.flatMap((source) => spine.splitIntoSpans(source));

  for (const span of spansA) {
    insertNode(db, ACCOUNT_A, USER_A, {
      id: span.id,
      kind: 'SourceSpan',
      source_id: span.sourceId,
      text: span.text,
      normalized_text: span.normalizedText,
      start_char: span.startChar,
      end_char: span.endChar,
      boundary_kind: span.boundaryKind,
      span_hash: span.id,
    });
    insertEdge(db, ACCOUNT_A, USER_A, {
      id: `edge_has_${span.id}`,
      kind: 'HAS_SPAN',
      from: span.sourceId,
      to: span.id,
      metadata: { start_char: span.startChar, end_char: span.endChar },
    });
  }
  for (const span of spansB) {
    insertNode(db, ACCOUNT_B, USER_B, {
      id: span.id,
      kind: 'SourceSpan',
      source_id: span.sourceId,
      text: span.text,
      normalized_text: span.normalizedText,
      start_char: span.startChar,
      end_char: span.endChar,
      boundary_kind: span.boundaryKind,
      span_hash: span.id,
    });
    insertEdge(db, ACCOUNT_B, USER_B, {
      id: `edge_has_${span.id}`,
      kind: 'HAS_SPAN',
      from: span.sourceId,
      to: span.id,
      metadata: { start_char: span.startChar, end_char: span.endChar },
    });
  }

  const writeA = {
    writeNode: async (node: Record<string, any>) => insertNode(db, ACCOUNT_A, USER_A, node),
    writeEdge: async (edge: Record<string, any>) => insertEdge(db, ACCOUNT_A, USER_A, edge),
  };
  const writeB = {
    writeNode: async (node: Record<string, any>) => insertNode(db, ACCOUNT_B, USER_B, node),
    writeEdge: async (edge: Record<string, any>) => insertEdge(db, ACCOUNT_B, USER_B, edge),
  };

  await spine.buildForSources({
    accountId: ACCOUNT_A,
    userId: USER_A,
    sources: sourcesA,
    spans: spansA,
    config: { minPhraseFrequency: 1, minPhrasesPerTopic: 2 },
    write: writeA,
    now: 1700000001000,
  });
  await spine.buildForSources({
    accountId: ACCOUNT_B,
    userId: USER_B,
    sources: sourcesB,
    spans: spansB,
    config: { minPhraseFrequency: 1, minPhrasesPerTopic: 2 },
    write: writeB,
    now: 1700000001000,
  });

  return { principalA };
}

function phraseByNormalized(db: Database.Database, accountId: string, normalized: string) {
  return db
    .prepare(
      `
        SELECT id, properties
        FROM nodes
        WHERE account_id = ? AND kind = 'Phrase'
          AND json_extract(properties, '$.normalized_text') = ?
      `
    )
    .get(accountId, normalized) as { id: string; properties: string } | undefined;
}

describe('semantic spine traversal and unified document loop', () => {
  it('builds stable phrase/topic hubs and source/span provenance across accounts', async () => {
    const db = createDb();
    try {
      await buildFixture(db);

      const phraseA = phraseByNormalized(db, ACCOUNT_A, 'symbolic necessity');
      const phraseB = phraseByNormalized(db, ACCOUNT_B, 'symbolic necessity');
      expect(phraseA?.id).toBeTruthy();
      expect(phraseB?.id).toBeTruthy();
      expect(phraseA!.id).not.toBe(phraseB!.id);

      const duplicatePhraseRows = db
        .prepare(
          `
            SELECT id
            FROM nodes
            WHERE account_id = ? AND kind = 'Phrase'
              AND json_extract(properties, '$.normalized_text') = 'symbolic necessity'
          `
        )
        .all(ACCOUNT_A) as Array<{ id: string }>;
      expect(duplicatePhraseRows).toHaveLength(1);

      const mentionSources = db
        .prepare(
          `
            SELECT from_id
            FROM edges
            WHERE account_id = ? AND kind = 'MENTIONS' AND to_id = ?
              AND from_id LIKE 'source_%'
            ORDER BY from_id ASC
          `
        )
        .all(ACCOUNT_A, phraseA!.id) as Array<{ from_id: string }>;
      expect(mentionSources.map((row) => row.from_id)).toEqual([
        'source_a_modal',
        'source_a_symbolic',
      ]);

      const topics = db
        .prepare(`SELECT id FROM nodes WHERE account_id = ? AND kind = 'Topic'`)
        .all(ACCOUNT_A) as Array<{ id: string }>;
      expect(topics.length).toBeGreaterThan(0);

      const belongsEdge = db
        .prepare(
          `SELECT id FROM edges WHERE account_id = ? AND kind = 'BELONGS_TO_TOPIC' AND from_id = ?`
        )
        .get(ACCOUNT_A, phraseA!.id) as { id?: string } | undefined;
      expect(belongsEdge?.id).toBeTruthy();
    } finally {
      db.close();
    }
  });

  it('traverses from phrase/source into related sources and deterministic context packs', async () => {
    const db = createDb();
    try {
      const { principalA } = await buildFixture(db);
      const phrase = phraseByNormalized(db, ACCOUNT_A, 'symbolic necessity')!;
      const traversal = new SemanticTraversalService(db);

      const phraseTraversal = traversal.traverse(ACCOUNT_A, {
        rootNodeIds: [phrase.id],
        maxHops: 3,
        expansionStrategy: 'mixed',
        includeSuggestedTopics: true,
      });
      const phraseNodeIds = phraseTraversal.nodes.map((node) => node.id);
      expect(phraseNodeIds).toContain('source_a_symbolic');
      expect(phraseNodeIds).toContain('source_a_modal');
      expect(phraseNodeIds).not.toContain('source_b_symbolic');
      expect(phraseTraversal.nodes.some((node) => node.kind === 'SourceSpan')).toBe(true);

      const sourceTraversal = traversal.traverse(ACCOUNT_A, {
        rootNodeIds: ['source_a_symbolic'],
        maxHops: 3,
        expansionStrategy: 'mixed',
        includeSuggestedTopics: true,
      });
      expect(sourceTraversal.nodes.some((node) => node.kind === 'Phrase')).toBe(true);
      expect(sourceTraversal.nodes.some((node) => node.kind === 'Topic')).toBe(true);
      expect(sourceTraversal.nodes.map((node) => node.id)).toContain('source_a_modal');

      insertEdge(db, ACCOUNT_A, USER_A, {
        id: 'edge_sequester_modal',
        kind: 'SEQUESTERS',
        from: principalA,
        to: 'source_a_modal',
        hidden_from_llm: true,
        metadata: { reason: 'test sequester' },
      });

      const packA = traversal.buildContextPack(ACCOUNT_A, {
        rootNodeIds: [phrase.id],
        maxHops: 3,
        expansionStrategy: 'mixed',
        maxChars: 5000,
        includeSuggestedTopics: true,
      });
      const packB = traversal.buildContextPack(ACCOUNT_A, {
        rootNodeIds: [phrase.id],
        maxHops: 3,
        expansionStrategy: 'mixed',
        maxChars: 5000,
        includeSuggestedTopics: true,
      });

      expect(packA.id).toBe(packB.id);
      expect(packA.snippets.map((snippet) => snippet.id)).toEqual(
        packB.snippets.map((snippet) => snippet.id)
      );
      expect(packA.sourceIds).toContain('source_a_symbolic');
      expect(packA.sourceIds).not.toContain('source_a_modal');
      expect(packA.excluded.some((item) => item.id === 'source_a_modal')).toBe(true);
    } finally {
      db.close();
    }
  });

  it('creates a first-class UnifiedDoc with provenance and producer edges', async () => {
    const db = createDb();
    try {
      await buildFixture(db);
      const phrase = phraseByNormalized(db, ACCOUNT_A, 'symbolic necessity')!;
      const traversal = new SemanticTraversalService(db);

      const result = traversal.createUnifiedDocument(
        ACCOUNT_A,
        USER_A,
        {
          rootNodeIds: [phrase.id],
          maxHops: 3,
          expansionStrategy: 'mixed',
          maxChars: 8000,
          includeSuggestedTopics: true,
        },
        { title: 'Symbolic Necessity Synthesis' }
      );

      const unifiedDoc = db
        .prepare(`SELECT id, properties FROM nodes WHERE account_id = ? AND id = ?`)
        .get(ACCOUNT_A, result.nodeId) as { id: string; properties: string } | undefined;
      expect(unifiedDoc?.id).toBe(result.nodeId);
      const props = JSON.parse(unifiedDoc!.properties);
      expect(props.kind).toBe('UnifiedDoc');
      expect(props.content_markdown).toContain('Symbolic Necessity Synthesis');
      expect(props.content_markdown).toContain('## Provenance');

      const derivesEdges = db
        .prepare(
          `SELECT id FROM edges WHERE account_id = ? AND kind = 'DERIVES_FROM' AND from_id = ?`
        )
        .all(ACCOUNT_A, result.nodeId) as Array<{ id: string }>;
      expect(derivesEdges.length).toBeGreaterThan(0);

      const producedByEdge = db
        .prepare(
          `SELECT id FROM edges WHERE account_id = ? AND kind = 'PRODUCED_BY' AND from_id = ?`
        )
        .get(ACCOUNT_A, result.nodeId) as { id?: string } | undefined;
      expect(producedByEdge?.id).toBeTruthy();
    } finally {
      db.close();
    }
  });
});
