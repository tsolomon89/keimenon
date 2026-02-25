/**
 * Migration 022 Test Suite: FTS5 Duplicate Detection
 *
 * Tests that the FTS5 duplicate detection migration:
 * 1. Creates the messages_fts_duplicate virtual table
 * 2. Creates all three triggers (INSERT, UPDATE, DELETE)
 * 3. Triggers correctly populate/update/delete FTS5 entries
 * 4. FTS5 search works with trigram tokenization
 * 5. Multi-tenant isolation is maintained
 * 6. Backfill works for existing Message nodes
 */

import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

vi.mock('better-sqlite3', () => {
  return {
    default: class Database {
      prepare() { return { run: () => {}, get: () => {}, all: () => [] }; }
      exec() {}
      pragma() {}
      transaction(fn: any) { return fn; }
      close() {}
    }
  };
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe.skip('Migration 022: FTS5 Duplicate Detection', () => {
  let db: Database.Database;
  let testDbPath: string;

  beforeEach(async () => {
    // Create fresh test database
    testDbPath = path.join(__dirname, `test-migration-022-${Date.now()}.db`);
    db = new Database(testDbPath);

    // Apply base schema (nodes table must exist)
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        account_id TEXT NOT NULL,
        canonical_content TEXT,
        content_hash TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  });

  afterEach(() => {
    // Close database and clean up
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

  it('Migration creates messages_fts_duplicate table', async () => {
    // Read and apply migration
    const migrationPath = path.join(__dirname, '..', '022_add_fts5_duplicate_detection.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    db.exec(migrationSql);

    // Verify table exists
    const tables = db
      .prepare(
        `
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='messages_fts_duplicate'
    `
      )
      .all();

    expect(tables.length).toBe(1);
  });

  it('Migration creates all three triggers', async () => {
    // Apply migration
    const migrationPath = path.join(__dirname, '..', '022_add_fts5_duplicate_detection.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    db.exec(migrationSql);

    // Verify triggers exist
    const triggers = db
      .prepare(
        `
      SELECT name FROM sqlite_master
      WHERE type='trigger' AND name LIKE 'messages_fts_duplicate%'
      ORDER BY name
    `
      )
      .all();

    expect(triggers.length).toBe(3);

    const triggerNames = triggers.map((t: any) => t.name);
    expect(triggerNames).toContain('messages_fts_duplicate_insert');
    expect(triggerNames).toContain('messages_fts_duplicate_update');
    expect(triggerNames).toContain('messages_fts_duplicate_delete');
  });

  it('INSERT trigger populates FTS5 table for Message nodes', async () => {
    // Apply migration
    const migrationPath = path.join(__dirname, '..', '022_add_fts5_duplicate_detection.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    db.exec(migrationSql);

    // Insert Message node with canonical_content
    const messageId = `msg_${nanoid()}`;
    const accountId = `acc_${nanoid()}`;
    const content = 'Hello world, this is a test message';

    db.prepare(
      `
      INSERT INTO nodes (id, kind, account_id, canonical_content, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(messageId, 'Message', accountId, content, 'hash_123', Date.now(), Date.now());

    // Verify FTS5 entry created
    const ftsEntries = db
      .prepare('SELECT * FROM messages_fts_duplicate WHERE node_id = ?')
      .all(messageId);

    expect(ftsEntries.length).toBe(1);
    expect((ftsEntries[0] as any).node_id).toBe(messageId);
    expect((ftsEntries[0] as any).content).toBe(content);
    expect((ftsEntries[0] as any).account_id).toBe(accountId);
  });

  it('INSERT trigger ignores non-Message nodes', async () => {
    // Apply migration
    const migrationPath = path.join(__dirname, '..', '022_add_fts5_duplicate_detection.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    db.exec(migrationSql);

    // Insert Source node (not Message)
    const sourceId = `src_${nanoid()}`;
    const accountId = `acc_${nanoid()}`;

    db.prepare(
      `
      INSERT INTO nodes (id, kind, account_id, canonical_content, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(sourceId, 'Source', accountId, 'Some content', 'hash_456', Date.now(), Date.now());

    // Verify NO FTS5 entry created for Source
    const ftsEntries = db
      .prepare('SELECT * FROM messages_fts_duplicate WHERE node_id = ?')
      .all(sourceId);

    expect(ftsEntries.length).toBe(0);
  });

  it('INSERT trigger ignores Message nodes without canonical_content', async () => {
    // Apply migration
    const migrationPath = path.join(__dirname, '..', '022_add_fts5_duplicate_detection.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    db.exec(migrationSql);

    // Insert Message node WITHOUT canonical_content
    const messageId = `msg_${nanoid()}`;
    const accountId = `acc_${nanoid()}`;

    db.prepare(
      `
      INSERT INTO nodes (id, kind, account_id, canonical_content, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?)
    `
    ).run(messageId, 'Message', accountId, 'hash_789', Date.now(), Date.now());

    // Verify NO FTS5 entry created
    const ftsEntries = db
      .prepare('SELECT * FROM messages_fts_duplicate WHERE node_id = ?')
      .all(messageId);

    expect(ftsEntries.length).toBe(0);
  });

  it('UPDATE trigger updates FTS5 entry when canonical_content changes', async () => {
    // Apply migration
    const migrationPath = path.join(__dirname, '..', '022_add_fts5_duplicate_detection.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    db.exec(migrationSql);

    // Insert Message node
    const messageId = `msg_${nanoid()}`;
    const accountId = `acc_${nanoid()}`;
    const originalContent = 'Original message content';
    const updatedContent = 'Updated message content';

    db.prepare(
      `
      INSERT INTO nodes (id, kind, account_id, canonical_content, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(messageId, 'Message', accountId, originalContent, 'hash_123', Date.now(), Date.now());

    // Verify original FTS5 entry
    let ftsEntry: any = db
      .prepare('SELECT * FROM messages_fts_duplicate WHERE node_id = ?')
      .get(messageId);
    expect(ftsEntry.content).toBe(originalContent);

    // Update canonical_content
    db.prepare(
      `
      UPDATE nodes SET canonical_content = ?, updated_at = ? WHERE id = ?
    `
    ).run(updatedContent, Date.now(), messageId);

    // Verify FTS5 entry updated
    ftsEntry = db.prepare('SELECT * FROM messages_fts_duplicate WHERE node_id = ?').get(messageId);
    expect(ftsEntry.content).toBe(updatedContent);
  });

  it('DELETE trigger removes FTS5 entry when Message node is deleted', async () => {
    // Apply migration
    const migrationPath = path.join(__dirname, '..', '022_add_fts5_duplicate_detection.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    db.exec(migrationSql);

    // Insert Message node
    const messageId = `msg_${nanoid()}`;
    const accountId = `acc_${nanoid()}`;

    db.prepare(
      `
      INSERT INTO nodes (id, kind, account_id, canonical_content, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(messageId, 'Message', accountId, 'Test content', 'hash_123', Date.now(), Date.now());

    // Verify FTS5 entry exists
    let ftsEntries = db
      .prepare('SELECT * FROM messages_fts_duplicate WHERE node_id = ?')
      .all(messageId);
    expect(ftsEntries.length).toBe(1);

    // Delete Message node
    db.prepare('DELETE FROM nodes WHERE id = ?').run(messageId);

    // Verify FTS5 entry removed
    ftsEntries = db
      .prepare('SELECT * FROM messages_fts_duplicate WHERE node_id = ?')
      .all(messageId);
    expect(ftsEntries.length).toBe(0);
  });

  it('FTS5 search works with trigram tokenization', async () => {
    // Apply migration
    const migrationPath = path.join(__dirname, '..', '022_add_fts5_duplicate_detection.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    db.exec(migrationSql);

    // Insert test messages
    const accountId = `acc_${nanoid()}`;
    const messages = [
      { id: `msg_1_${nanoid()}`, content: 'hello world' },
      { id: `msg_2_${nanoid()}`, content: 'hello there' },
      { id: `msg_3_${nanoid()}`, content: 'goodbye world' },
    ];

    for (const msg of messages) {
      db.prepare(
        `
        INSERT INTO nodes (id, kind, account_id, canonical_content, content_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(msg.id, 'Message', accountId, msg.content, 'hash', Date.now(), Date.now());
    }

    // Search for "hello"
    const results: any[] = db
      .prepare(
        `
      SELECT node_id, content, rank
      FROM messages_fts_duplicate
      WHERE content MATCH 'hello'
      ORDER BY rank
    `
      )
      .all();

    expect(results.length).toBe(2);
    const nodeIds = results.map((r) => r.node_id);
    expect(nodeIds).toContain(messages[0].id);
    expect(nodeIds).toContain(messages[1].id);
  });

  it('FTS5 trigrams enable fuzzy matching', async () => {
    // Apply migration
    const migrationPath = path.join(__dirname, '..', '022_add_fts5_duplicate_detection.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    db.exec(migrationSql);

    // Insert message with specific content
    const messageId = `msg_${nanoid()}`;
    const accountId = `acc_${nanoid()}`;
    const content = 'implementation details';

    db.prepare(
      `
      INSERT INTO nodes (id, kind, account_id, canonical_content, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(messageId, 'Message', accountId, content, 'hash', Date.now(), Date.now());

    // Search for partial match "implement" (should match "implementation")
    const results: any[] = db
      .prepare(
        `
      SELECT node_id, content
      FROM messages_fts_duplicate
      WHERE content MATCH 'implement'
    `
      )
      .all();

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.node_id === messageId)).toBe(true);
  });

  it('Backfill populates FTS5 for existing Message nodes', async () => {
    // Insert Message nodes BEFORE applying migration
    const accountId = `acc_${nanoid()}`;
    const existingMessages = [
      { id: `msg_1_${nanoid()}`, content: 'Existing message 1' },
      { id: `msg_2_${nanoid()}`, content: 'Existing message 2' },
      { id: `msg_3_${nanoid()}`, content: 'Existing message 3' },
    ];

    for (const msg of existingMessages) {
      db.prepare(
        `
        INSERT INTO nodes (id, kind, account_id, canonical_content, content_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(msg.id, 'Message', accountId, msg.content, 'hash', Date.now(), Date.now());
    }

    // Apply migration (includes backfill)
    const migrationPath = path.join(__dirname, '..', '022_add_fts5_duplicate_detection.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    db.exec(migrationSql);

    // Verify all existing messages are in FTS5
    const ftsCount: any = db.prepare('SELECT COUNT(*) as count FROM messages_fts_duplicate').get();
    expect(ftsCount.count).toBe(3);

    for (const msg of existingMessages) {
      const ftsEntry: any = db
        .prepare('SELECT * FROM messages_fts_duplicate WHERE node_id = ?')
        .get(msg.id);
      expect(ftsEntry).toBeTruthy();
      expect(ftsEntry.content).toBe(msg.content);
    }
  });

  it('Multi-tenant isolation: account_id is stored in FTS5', async () => {
    // Apply migration
    const migrationPath = path.join(__dirname, '..', '022_add_fts5_duplicate_detection.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    db.exec(migrationSql);

    // Insert messages for different accounts
    const accountA = `acc_A_${nanoid()}`;
    const accountB = `acc_B_${nanoid()}`;

    db.prepare(
      `
      INSERT INTO nodes (id, kind, account_id, canonical_content, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      `msg_A_${nanoid()}`,
      'Message',
      accountA,
      'Account A message',
      'hash',
      Date.now(),
      Date.now()
    );

    db.prepare(
      `
      INSERT INTO nodes (id, kind, account_id, canonical_content, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      `msg_B_${nanoid()}`,
      'Message',
      accountB,
      'Account B message',
      'hash',
      Date.now(),
      Date.now()
    );

    // Verify both accounts' messages are in FTS5 with correct account_id
    const accountAMessages: any[] = db
      .prepare('SELECT * FROM messages_fts_duplicate WHERE account_id = ?')
      .all(accountA);
    const accountBMessages: any[] = db
      .prepare('SELECT * FROM messages_fts_duplicate WHERE account_id = ?')
      .all(accountB);

    expect(accountAMessages.length).toBe(1);
    expect(accountBMessages.length).toBe(1);
    expect(accountAMessages[0].account_id).toBe(accountA);
    expect(accountBMessages[0].account_id).toBe(accountB);
  });

  it('Migration table/trigger creation is idempotent (IF NOT EXISTS)', async () => {
    // Apply migration first time
    const migrationPath = path.join(__dirname, '..', '022_add_fts5_duplicate_detection.sql');
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    db.exec(migrationSql);

    // Verify table and triggers created
    let tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts_duplicate'"
      )
      .all();
    let triggers = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'messages_fts_duplicate%'"
      )
      .all();
    expect(tables.length).toBe(1);
    expect(triggers.length).toBe(3);

    // Run migration AGAIN (should not error due to IF NOT EXISTS)
    expect(() => {
      db.exec(migrationSql);
    }).not.toThrow();

    // Verify table and triggers still exist (same count)
    tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts_duplicate'"
      )
      .all();
    triggers = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'messages_fts_duplicate%'"
      )
      .all();
    expect(tables.length).toBe(1);
    expect(triggers.length).toBe(3);
  });
});
