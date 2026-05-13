import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Migration 040 Dry Run: Payload Graph Identity FKs', () => {
  let db: Database.Database;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = path.join(__dirname, `test-migration-040-${Date.now()}.db`);
    db = new Database(testDbPath);

    // Enable FKs for testing the pre-040 state (SQLite defaults to OFF, but we run with ON)
    db.pragma('foreign_keys = ON');

    // -------------------------------------------------------------------------
    // 1. Create Pre-040 Schema Fixture
    // -------------------------------------------------------------------------

    // Base tables
    db.exec(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        account_type TEXT DEFAULT 'client',
        account_class TEXT DEFAULT 'free',
        email TEXT,
        name TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        account_id TEXT,
        email TEXT,
        password_hash TEXT,
        name TEXT,
        rank INTEGER DEFAULT 1,
        permission_level TEXT DEFAULT 'junior',
        user_class TEXT,
        is_active INTEGER,
        created_at INTEGER,
        updated_at INTEGER,
        primary_account_id TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      -- Pre-040 nodes table (missing the new CHECK constraint that includes SourceSpan etc)
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        properties TEXT NOT NULL,
        account_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data_tag TEXT DEFAULT 'real',
        content_hash TEXT,
        canonical_content TEXT,
        is_duplicate INTEGER DEFAULT 0,
        original_node_id TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Pre-040 edges table
      CREATE TABLE edges (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        properties TEXT,
        account_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        data_tag TEXT DEFAULT 'real',
        FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      );

      -- FTS tables needed to prevent drop trigger errors in migration 040
      CREATE TABLE nodes_fts (id TEXT, content TEXT);
      CREATE TABLE messages_fts_duplicate (node_id TEXT, content TEXT, account_id TEXT);

      -- Pre-040 payload tables (NO FK on id to nodes(id))
      CREATE TABLE source_spans (
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
        data_tag TEXT DEFAULT 'real',
        metadata TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts(id),
        FOREIGN KEY (source_id) REFERENCES nodes(id)
      );

      CREATE TABLE phrases (
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
        data_tag TEXT DEFAULT 'real',
        metadata TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      );

      CREATE TABLE packets (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        text TEXT NOT NULL,
        normalized_text TEXT NOT NULL,
        occurrences INTEGER NOT NULL DEFAULT 1,
        mass REAL NOT NULL DEFAULT 0,
        coverage REAL NOT NULL DEFAULT 0,
        idf REAL NOT NULL DEFAULT 0,
        entropy_factor REAL NOT NULL DEFAULT 0,
        packet_hash TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data_tag TEXT DEFAULT 'real',
        metadata TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      );

      CREATE TABLE atomic_units (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        unit_type TEXT NOT NULL,
        value TEXT NOT NULL,
        normalized_value TEXT NOT NULL,
        unit_hash TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data_tag TEXT DEFAULT 'real',
        metadata TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      );
    `);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (testDbPath) {
      try {
        fs.unlink(testDbPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  it('Migration 040 successfully rehydrates skinny nodes and establishes cascading FKs', async () => {
    const now = Date.now();
    const accountId = 'acc_1';
    const userId = 'user_1';

    // Seed account & user
    db.prepare('INSERT INTO accounts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      accountId,
      'Test Account',
      now,
      now
    );
    db.prepare(
      'INSERT INTO users (id, account_id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, accountId, 'test@test.com', 'hash', 'Test User', now, now);

    // Seed a valid Source node to act as parent for the source_spans
    const sourceNodeId = 'node_src_1';
    db.prepare(
      'INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(sourceNodeId, 'Source', '{}', accountId, userId, now, now);

    // -------------------------------------------------------------------------
    // 2. Seed Legacy Payload Data
    // -------------------------------------------------------------------------

    // 2A. A SourceSpan WITH a matching node (already well-formed)
    const spanId1 = 'span_1';
    db.prepare(
      'INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(spanId1, 'SourceSpan', '{}', accountId, userId, now, now);
    db.prepare(
      'INSERT INTO source_spans (id, account_id, source_id, text, normalized_text, start_char, end_char, span_hash, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      spanId1,
      accountId,
      sourceNodeId,
      'Test span 1',
      'test span 1',
      0,
      10,
      'hash1',
      userId,
      now,
      now
    );

    // 2B. A SourceSpan WITHOUT a matching node (needs rehydration)
    const spanId2 = 'span_2';
    db.prepare(
      'INSERT INTO source_spans (id, account_id, source_id, text, normalized_text, start_char, end_char, span_hash, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      spanId2,
      accountId,
      sourceNodeId,
      'Test span 2',
      'test span 2',
      11,
      20,
      'hash2',
      userId,
      now,
      now
    );

    // 2C. A Phrase WITHOUT a matching node
    const phraseId1 = 'phrase_1';
    db.prepare(
      'INSERT INTO phrases (id, account_id, text, normalized_text, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(phraseId1, accountId, 'Test phrase', 'test phrase', userId, now, now);

    // 2D. Edges linking to these payload rows (to prove edges survive parent drops)
    // Note: Before 040, edges could technically point to a payload ID that lacked a node if FKs weren't strictly typed.
    // Actually, edges DO have an FK to nodes(id). So if a payload lacked a node, an edge couldn't point to it without violating FKs unless defer_foreign_keys was on or it was ignored.
    // For this test, we'll point an edge to spanId1 which HAS a node.
    const edgeId1 = 'edge_1';
    db.prepare(
      'INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(edgeId1, 'HAS_SPAN', sourceNodeId, spanId1, '{}', accountId, userId, now);

    // -------------------------------------------------------------------------
    // 3. Run Migration 040
    // -------------------------------------------------------------------------

    const migrationPath = path.join(__dirname, '..', '040_payload_graph_identity_fks.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');

    // SQLite requires PRAGMA foreign_keys = OFF before wrapping in a transaction, or we use PRAGMA defer_foreign_keys = ON.
    // Migration 040 uses PRAGMA defer_foreign_keys = ON;

    // We execute the migration directly as the runner would.
    db.exec('BEGIN;');
    try {
      db.exec(migrationSql);
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    // -------------------------------------------------------------------------
    // 4. Assertions
    // -------------------------------------------------------------------------

    // 4A. No row loss
    const sourceSpansCount = (db.prepare('SELECT COUNT(*) as c FROM source_spans').get() as any).c;
    expect(sourceSpansCount).toBe(2);

    const phrasesCount = (db.prepare('SELECT COUNT(*) as c FROM phrases').get() as any).c;
    expect(phrasesCount).toBe(1);

    const edgesCount = (db.prepare('SELECT COUNT(*) as c FROM edges').get() as any).c;
    expect(edgesCount).toBe(1);

    // 4B. Skinny nodes were rehydrated
    const span2Node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(spanId2) as any;
    expect(span2Node).toBeDefined();
    expect(span2Node.kind).toBe('SourceSpan');
    expect(span2Node.canonical_content).toBe('test span 2'); // Matches rehydration logic

    const phrase1Node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(phraseId1) as any;
    expect(phrase1Node).toBeDefined();
    expect(phrase1Node.kind).toBe('Phrase');

    // 4C. PRAGMA foreign_key_check is clean
    const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
    expect(fkViolations.length).toBe(0);

    // 4D. Cascading deletions work!
    // If we delete the node, the payload row should be CASCADE deleted.
    db.prepare('DELETE FROM nodes WHERE id = ?').run(spanId2);

    const span2RowAfterDelete = db.prepare('SELECT * FROM source_spans WHERE id = ?').get(spanId2);
    expect(span2RowAfterDelete).toBeUndefined(); // It should be gone due to CASCADE

    // The manually created node should also cascade
    db.prepare('DELETE FROM nodes WHERE id = ?').run(spanId1);
    const span1RowAfterDelete = db.prepare('SELECT * FROM source_spans WHERE id = ?').get(spanId1);
    expect(span1RowAfterDelete).toBeUndefined();

    // Edges connected to span1 should ALSO be gone due to CASCADE on edges
    const edge1RowAfterDelete = db.prepare('SELECT * FROM edges WHERE id = ?').get(edgeId1);
    expect(edge1RowAfterDelete).toBeUndefined();
  });

  it('Migration 040 gracefully drops orphan edges referencing non-existent nodes', async () => {
    const now = Date.now();
    const accountId = 'acc_2';
    const userId = 'user_2';

    // Seed account & user
    db.prepare('INSERT INTO accounts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      accountId,
      'Test Account 2',
      now,
      now
    );
    db.prepare(
      'INSERT INTO users (id, account_id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, accountId, 'test2@test.com', 'hash', 'Test User 2', now, now);

    // Create valid nodes
    const sourceNodeId = 'node_src_2';
    const spanNodeId = 'span_valid';
    db.prepare(
      'INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(sourceNodeId, 'Source', '{}', accountId, userId, now, now);
    db.prepare(
      'INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(spanNodeId, 'SourceSpan', '{}', accountId, userId, now, now);

    // Seed a valid source_span
    db.prepare(
      'INSERT INTO source_spans (id, account_id, source_id, text, normalized_text, start_char, end_char, span_hash, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      spanNodeId,
      accountId,
      sourceNodeId,
      'Valid span',
      'valid span',
      0,
      10,
      'hash_v',
      userId,
      now,
      now
    );

    // Insert a VALID edge
    const validEdgeId = 'edge_valid';
    db.prepare(
      'INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(validEdgeId, 'HAS_SPAN', sourceNodeId, spanNodeId, '{}', accountId, userId, now);

    // Insert ORPHAN edges — referencing non-existent nodes
    // We need to temporarily disable FK checks to insert these orphan edges
    db.pragma('foreign_keys = OFF');

    const orphanEdge1 = 'edge_orphan_1';
    db.prepare(
      'INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      orphanEdge1,
      'SIMILAR_TO',
      'nonexistent_node_a',
      spanNodeId,
      '{}',
      accountId,
      userId,
      now
    );

    const orphanEdge2 = 'edge_orphan_2';
    db.prepare(
      'INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      orphanEdge2,
      'DERIVES_FROM',
      sourceNodeId,
      'nonexistent_node_b',
      '{}',
      accountId,
      userId,
      now
    );

    const orphanEdge3 = 'edge_orphan_3';
    db.prepare(
      'INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(orphanEdge3, 'CONTAINS', 'ghost_a', 'ghost_b', '{}', accountId, userId, now);

    db.pragma('foreign_keys = ON');

    // Verify pre-migration state: 4 edges total (1 valid + 3 orphans)
    const preEdgeCount = (db.prepare('SELECT COUNT(*) as c FROM edges').get() as any).c;
    expect(preEdgeCount).toBe(4);

    // -------------------------------------------------------------------------
    // Run Migration 040
    // -------------------------------------------------------------------------
    const migrationPath = path.join(__dirname, '..', '040_payload_graph_identity_fks.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');

    db.exec('BEGIN;');
    try {
      db.exec(migrationSql);
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    // -------------------------------------------------------------------------
    // Assertions
    // -------------------------------------------------------------------------

    // Only the valid edge should survive
    const postEdgeCount = (db.prepare('SELECT COUNT(*) as c FROM edges').get() as any).c;
    expect(postEdgeCount).toBe(1);

    // The valid edge is intact
    const survivedEdge = db.prepare('SELECT * FROM edges WHERE id = ?').get(validEdgeId) as any;
    expect(survivedEdge).toBeDefined();
    expect(survivedEdge.from_id).toBe(sourceNodeId);
    expect(survivedEdge.to_id).toBe(spanNodeId);

    // Orphan edges are gone
    expect(db.prepare('SELECT * FROM edges WHERE id = ?').get(orphanEdge1)).toBeUndefined();
    expect(db.prepare('SELECT * FROM edges WHERE id = ?').get(orphanEdge2)).toBeUndefined();
    expect(db.prepare('SELECT * FROM edges WHERE id = ?').get(orphanEdge3)).toBeUndefined();

    // Source span survived
    const spanCount = (db.prepare('SELECT COUNT(*) as c FROM source_spans').get() as any).c;
    expect(spanCount).toBe(1);

    // FK check is clean
    const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
    expect(fkViolations.length).toBe(0);
  });
});
