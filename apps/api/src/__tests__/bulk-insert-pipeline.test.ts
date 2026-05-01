/**
 * Bulk Insert Pipeline — Correctness Tests
 *
 * Epic 3 hardening: verifies graph identity FK enforcement, durable quarantine,
 * cascade behavior, and legacy fallback across all normalized payload kinds.
 */

import Database from 'better-sqlite3';
import { createBulkTestDb } from './utils/test-db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCOUNT_ID = 'acc_test';
const USER_ID = 'user_test';

function now(): number {
  return Date.now();
}

function insertNode(
  db: Database.Database,
  id: string,
  kind: string,
  properties = '{}',
  opts: Partial<{ content_hash: string; canonical_content: string }> = {}
) {
  db.prepare(
    `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag, content_hash, canonical_content, is_duplicate, original_node_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'real', ?, ?, 0, NULL)`
  ).run(
    id,
    kind,
    properties,
    ACCOUNT_ID,
    USER_ID,
    now(),
    now(),
    opts.content_hash || null,
    opts.canonical_content || null
  );
}

function insertEdge(db: Database.Database, id: string, kind: string, fromId: string, toId: string) {
  db.prepare(
    `INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag)
     VALUES (?, ?, ?, ?, '{}', ?, ?, ?, 'real')`
  ).run(id, kind, fromId, toId, ACCOUNT_ID, USER_ID, now());
}

function insertSourceSpan(
  db: Database.Database,
  id: string,
  sourceId: string,
  text: string,
  spanHash: string
) {
  db.prepare(
    `INSERT INTO source_spans (id, account_id, source_id, text, normalized_text, start_char, end_char, boundary_kind, span_hash, created_by, created_at, updated_at, data_tag)
     VALUES (?, ?, ?, ?, ?, 0, ?, 'sentence', ?, ?, ?, ?, 'real')`
  ).run(
    id,
    ACCOUNT_ID,
    sourceId,
    text,
    text.toLowerCase(),
    text.length,
    spanHash,
    USER_ID,
    now(),
    now()
  );
}

function insertPhrase(db: Database.Database, id: string, text: string) {
  db.prepare(
    `INSERT INTO phrases (id, account_id, text, normalized_text, type, frequency, created_by, created_at, updated_at, data_tag)
     VALUES (?, ?, ?, ?, 'n-gram', 0, ?, ?, ?, 'real')`
  ).run(id, ACCOUNT_ID, text, text.toLowerCase(), USER_ID, now(), now());
}

function insertPacket(db: Database.Database, id: string, text: string, packetHash: string) {
  db.prepare(
    `INSERT INTO packets (id, account_id, text, normalized_text, occurrences, mass, coverage, idf, entropy_factor, packet_hash, created_by, created_at, updated_at, data_tag)
     VALUES (?, ?, ?, ?, 1, 0, 0, 0, 0, ?, ?, ?, ?, 'real')`
  ).run(id, ACCOUNT_ID, text, text.toLowerCase(), packetHash, USER_ID, now(), now());
}

function insertAtomicUnit(
  db: Database.Database,
  id: string,
  unitType: string,
  value: string,
  unitHash: string
) {
  db.prepare(
    `INSERT INTO atomic_units (id, account_id, unit_type, value, normalized_value, unit_hash, created_by, created_at, updated_at, data_tag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'real')`
  ).run(id, ACCOUNT_ID, unitType, value, value.toLowerCase(), unitHash, USER_ID, now(), now());
}

function rowCount(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as any).c;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bulk Insert Pipeline — Correctness', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createBulkTestDb();
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  // -----------------------------------------------------------------------
  // 1. Schema allows normalized node kinds
  // -----------------------------------------------------------------------
  test('schema allows SourceSpan, Phrase, Packet, AtomicUnit in nodes.kind', () => {
    const kinds = ['SourceSpan', 'Phrase', 'Packet', 'AtomicUnit'];
    for (const kind of kinds) {
      expect(() => {
        insertNode(db, `skinny_${kind}`, kind);
      }).not.toThrow();
    }
    expect(rowCount(db, 'nodes')).toBe(4);
  });

  // -----------------------------------------------------------------------
  // 2. Mixed graph batch creates nodes, normalized payload rows, and edges
  // -----------------------------------------------------------------------
  test('mixed graph batch: nodes + payloads + edges', () => {
    // Insert a Source node (parent for spans)
    insertNode(db, 'source_1', 'Source', JSON.stringify({ title: 'Test Source' }));

    // Insert skinny nodes for normalized kinds
    insertNode(db, 'span_1', 'SourceSpan');
    insertNode(db, 'phrase_1', 'Phrase');
    insertNode(db, 'packet_1', 'Packet');
    insertNode(db, 'au_1', 'AtomicUnit');

    // Insert normalized payloads
    insertSourceSpan(db, 'span_1', 'source_1', 'Hello world sentence', 'hash_span_1');
    insertPhrase(db, 'phrase_1', 'hello world');
    insertPacket(db, 'packet_1', 'hello world sentence', 'hash_packet_1');
    insertAtomicUnit(db, 'au_1', 'word', 'hello', 'hash_au_1');

    // Insert edges
    insertEdge(db, 'edge_1', 'HAS_SPAN', 'source_1', 'span_1');
    insertEdge(db, 'edge_2', 'OCCURS_IN_SPAN', 'phrase_1', 'span_1');

    // Verify counts
    expect(rowCount(db, 'nodes')).toBe(5);
    expect(rowCount(db, 'source_spans')).toBe(1);
    expect(rowCount(db, 'phrases')).toBe(1);
    expect(rowCount(db, 'packets')).toBe(1);
    expect(rowCount(db, 'atomic_units')).toBe(1);
    expect(rowCount(db, 'edges')).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 3. FK enforcement: payload rows require matching graph identity nodes
  // -----------------------------------------------------------------------
  test('payload rows without graph identity node are rejected by FK', () => {
    // Attempt to insert a source_span without a corresponding nodes row
    insertNode(db, 'source_1', 'Source');

    expect(() => {
      insertSourceSpan(db, 'orphan_span', 'source_1', 'orphan text', 'hash_orphan');
    }).toThrow(); // FK violation: orphan_span not in nodes

    expect(() => {
      insertPhrase(db, 'orphan_phrase', 'orphan phrase');
    }).toThrow();

    expect(() => {
      insertPacket(db, 'orphan_packet', 'orphan packet', 'hash_orphan');
    }).toThrow();

    expect(() => {
      insertAtomicUnit(db, 'orphan_au', 'word', 'orphan', 'hash_orphan');
    }).toThrow();
  });

  // -----------------------------------------------------------------------
  // 4. FK deferral works for same-batch graph materialization
  // -----------------------------------------------------------------------
  test('deferred FK allows batch inserts in arbitrary order', () => {
    db.pragma('defer_foreign_keys = ON');
    db.exec('BEGIN');

    // Insert source_span BEFORE its nodes row (deferred FK)
    insertSourceSpan(db, 'span_deferred', 'src_deferred', 'deferred text', 'hash_def');
    insertNode(db, 'src_deferred', 'Source');
    insertNode(db, 'span_deferred', 'SourceSpan');

    // Should not throw: FK check deferred to commit
    expect(() => {
      db.exec('COMMIT');
    }).not.toThrow();

    expect(rowCount(db, 'source_spans')).toBe(1);
    expect(rowCount(db, 'nodes')).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 5. Quarantine table accepts valid rows
  // -----------------------------------------------------------------------
  test('quarantine table stores bad rows durably', () => {
    db.prepare(
      `INSERT INTO bulk_insert_quarantine (id, account_id, batch_id, import_id, row_kind, row_id, reason, error_message, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'quar_1',
      ACCOUNT_ID,
      'batch_1',
      'import_1',
      'node',
      'bad_node_1',
      'CHECK_FAILED',
      'kind not allowed',
      '{"id":"bad_node_1"}',
      now()
    );

    expect(rowCount(db, 'bulk_insert_quarantine')).toBe(1);

    const row = db
      .prepare('SELECT * FROM bulk_insert_quarantine WHERE id = ?')
      .get('quar_1') as any;
    expect(row.row_kind).toBe('node');
    expect(row.reason).toBe('CHECK_FAILED');
  });

  // -----------------------------------------------------------------------
  // 6. Quarantine survives rollback (simulated)
  // -----------------------------------------------------------------------
  test('quarantine written after rollback survives', () => {
    // Simulate: begin transaction, fail, rollback, then write quarantine separately
    db.exec('BEGIN');
    insertNode(db, 'good_node', 'Source');
    db.exec('ROLLBACK');

    // good_node should be gone
    expect(rowCount(db, 'nodes')).toBe(0);

    // Now write quarantine in separate transaction
    db.prepare(
      `INSERT INTO bulk_insert_quarantine (id, account_id, batch_id, row_kind, row_id, reason, error_message, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'quar_after_rb',
      ACCOUNT_ID,
      'batch_rb',
      'node',
      'good_node',
      'TX_FAILED',
      'Simulated failure',
      '{}',
      now()
    );

    expect(rowCount(db, 'bulk_insert_quarantine')).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 7. DELETE CASCADE removes normalized payload rows
  // -----------------------------------------------------------------------
  test('deleting a node cascades to normalized payload rows', () => {
    // Setup: node + span
    insertNode(db, 'source_cascade', 'Source');
    insertNode(db, 'span_cascade', 'SourceSpan');
    insertSourceSpan(db, 'span_cascade', 'source_cascade', 'cascade text', 'hash_cascade');

    insertNode(db, 'phrase_cascade', 'Phrase');
    insertPhrase(db, 'phrase_cascade', 'cascade phrase');

    insertNode(db, 'packet_cascade', 'Packet');
    insertPacket(db, 'packet_cascade', 'cascade packet', 'hash_p_cascade');

    insertNode(db, 'au_cascade', 'AtomicUnit');
    insertAtomicUnit(db, 'au_cascade', 'word', 'cascade', 'hash_au_cascade');

    expect(rowCount(db, 'source_spans')).toBe(1);
    expect(rowCount(db, 'phrases')).toBe(1);
    expect(rowCount(db, 'packets')).toBe(1);
    expect(rowCount(db, 'atomic_units')).toBe(1);

    // Delete the graph identity nodes
    db.prepare('DELETE FROM nodes WHERE id = ?').run('span_cascade');
    db.prepare('DELETE FROM nodes WHERE id = ?').run('phrase_cascade');
    db.prepare('DELETE FROM nodes WHERE id = ?').run('packet_cascade');
    db.prepare('DELETE FROM nodes WHERE id = ?').run('au_cascade');

    // Payload rows should be cascade-deleted
    expect(rowCount(db, 'source_spans')).toBe(0);
    expect(rowCount(db, 'phrases')).toBe(0);
    expect(rowCount(db, 'packets')).toBe(0);
    expect(rowCount(db, 'atomic_units')).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 8. Semantic spine synthesis after bulk ingestion
  // -----------------------------------------------------------------------
  test('semantic spine graph shape: Source → SourceSpan → Phrase', () => {
    // Create spine structure
    insertNode(db, 'src_spine', 'Source', JSON.stringify({ title: 'Spine Source' }));
    insertNode(db, 'span_spine_1', 'SourceSpan');
    insertNode(db, 'span_spine_2', 'SourceSpan');
    insertNode(db, 'phrase_spine_1', 'Phrase');
    insertNode(db, 'phrase_spine_2', 'Phrase');

    insertSourceSpan(db, 'span_spine_1', 'src_spine', 'First sentence of source', 'hash_ss1');
    insertSourceSpan(db, 'span_spine_2', 'src_spine', 'Second sentence of source', 'hash_ss2');
    insertPhrase(db, 'phrase_spine_1', 'first sentence');
    insertPhrase(db, 'phrase_spine_2', 'second sentence');

    // Create spine edges
    insertEdge(db, 'e_has_span_1', 'HAS_SPAN', 'src_spine', 'span_spine_1');
    insertEdge(db, 'e_has_span_2', 'HAS_SPAN', 'src_spine', 'span_spine_2');
    insertEdge(db, 'e_occurs_1', 'OCCURS_IN_SPAN', 'phrase_spine_1', 'span_spine_1');
    insertEdge(db, 'e_occurs_2', 'OCCURS_IN_SPAN', 'phrase_spine_2', 'span_spine_2');

    // Verify the full spine is queryable
    const spans = db
      .prepare(
        `SELECT ss.* FROM source_spans ss
       JOIN edges e ON e.to_id = ss.id
       WHERE e.kind = 'HAS_SPAN' AND e.from_id = ?`
      )
      .all('src_spine');
    expect(spans).toHaveLength(2);

    const phrases = db
      .prepare(
        `SELECT p.* FROM phrases p
       JOIN edges e ON e.from_id = p.id
       WHERE e.kind = 'OCCURS_IN_SPAN'`
      )
      .all();
    expect(phrases).toHaveLength(2);

    // Verify cascade: deleting source should cascade to spans
    db.prepare('DELETE FROM nodes WHERE id = ?').run('span_spine_1');
    expect(
      (db.prepare('SELECT COUNT(*) as c FROM source_spans WHERE id = ?').get('span_spine_1') as any)
        .c
    ).toBe(0);
    // The HAS_SPAN edge should also be cascade-deleted (via ON DELETE CASCADE on to_id)
    expect(
      (db.prepare("SELECT COUNT(*) as c FROM edges WHERE id = 'e_has_span_1'").get() as any).c
    ).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 9. Edge cleanup WHERE precedence
  // -----------------------------------------------------------------------
  test('edge cleanup does not delete cross-account edges', () => {
    // Create second account
    const now2 = now();
    db.prepare(
      `INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
       VALUES ('acc_other', 'client', 'free', 'other@test.com', 'Other Account', ?, ?)`
    ).run(now2, now2);
    db.prepare(
      `INSERT INTO users (id, email, password_hash, name, permission_level, user_class, is_active, created_at, updated_at, primary_account_id)
       VALUES ('user_other', 'otheruser@test.com', 'hash', 'Other User', 'admin', 'person', 1, ?, ?, 'acc_other')`
    ).run(now2, now2);
    db.prepare(
      `INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, joined_at, created_at, updated_at)
       VALUES ('ua_other', 'user_other', 'acc_other', 'admin', 1, ?, ?, ?)`
    ).run(now2, now2, now2);

    // Create nodes in both accounts
    insertNode(db, 'node_a', 'Source');
    insertNode(db, 'node_b', 'Source');

    db.prepare(
      `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag, is_duplicate)
       VALUES ('node_other', 'Source', '{}', 'acc_other', 'user_other', ?, ?, 'real', 0)`
    ).run(now2, now2);

    // Create edges in both accounts
    insertEdge(db, 'edge_main', 'CONTAINS', 'node_a', 'node_b');
    db.prepare(
      `INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag)
       VALUES ('edge_other', 'CONTAINS', 'node_other', 'node_other', '{}', 'acc_other', 'user_other', ?, 'real')`
    ).run(now2);

    // Run the corrected cleanup query for acc_test only
    db.prepare(
      `DELETE FROM edges WHERE account_id = ? AND (from_id NOT IN (SELECT id FROM nodes) OR to_id NOT IN (SELECT id FROM nodes))`
    ).run(ACCOUNT_ID);

    // Both edges should still exist (no orphans)
    expect(rowCount(db, 'edges')).toBe(2);
  });
});
