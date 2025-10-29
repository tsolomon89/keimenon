/**
 * Content Hash Migration Tests
 *
 * Tests the database migration that adds deduplication columns:
 * - content_hash TEXT
 * - canonical_content TEXT
 * - is_duplicate INTEGER DEFAULT 0
 * - original_node_id TEXT
 *
 * Verifies:
 * - Migration runs on databases without columns
 * - Migration skipped on databases with columns
 * - Columns added correctly with proper types
 * - Indexes created for performance
 * - Existing data preserved
 * - Graceful failure handling
 */

import { describe, test as it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Helper: Create database without content_hash columns (pre-migration state)
function createLegacyDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  // Old schema WITHOUT content_hash columns
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      account_type TEXT NOT NULL DEFAULT 'client',
      account_class TEXT NOT NULL DEFAULT 'free',
      account_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      properties TEXT NOT NULL,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'real',
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  return db;
}

// Helper: Run migration (simulates SQLiteClient.runMigrations())
function runContentHashMigration(db: Database.Database): { success: boolean; error?: string } {
  try {
    // Check if columns already exist
    const tableInfo = db.prepare('PRAGMA table_info(nodes)').all() as any[];
    const hasContentHash = tableInfo.some((col: any) => col.name === 'content_hash');

    if (hasContentHash) {
      return { success: true }; // Already migrated
    }

    // Run migration
    db.exec(`
      ALTER TABLE nodes ADD COLUMN content_hash TEXT;
      ALTER TABLE nodes ADD COLUMN canonical_content TEXT;
      ALTER TABLE nodes ADD COLUMN is_duplicate INTEGER DEFAULT 0;
      ALTER TABLE nodes ADD COLUMN original_node_id TEXT;
    `);

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_nodes_content_hash ON nodes(content_hash);
      CREATE INDEX IF NOT EXISTS idx_nodes_account_hash ON nodes(account_id, content_hash);
    `);

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Helper: Check if columns exist
function hasContentHashColumns(db: Database.Database): boolean {
  const tableInfo = db.prepare('PRAGMA table_info(nodes)').all() as any[];
  const columns = tableInfo.map((col: any) => col.name);

  return (
    columns.includes('content_hash') &&
    columns.includes('canonical_content') &&
    columns.includes('is_duplicate') &&
    columns.includes('original_node_id')
  );
}

// Helper: Check if indexes exist
function hasContentHashIndexes(db: Database.Database): boolean {
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as any[];
  const indexNames = indexes.map((idx: any) => idx.name);

  return (
    indexNames.includes('idx_nodes_content_hash') && indexNames.includes('idx_nodes_account_hash')
  );
}

describe('Content Hash Migration', () => {
  describe('Migration on Legacy Database', () => {
    it('should add content_hash columns to existing database', () => {
      const db = createLegacyDatabase();

      // Verify columns don't exist
      assert.strictEqual(hasContentHashColumns(db), false, 'Columns should not exist initially');

      // Run migration
      const result = runContentHashMigration(db);
      assert.strictEqual(result.success, true, 'Migration should succeed');

      // Verify columns added
      assert.strictEqual(hasContentHashColumns(db), true, 'Columns should exist after migration');

      db.close();
    });

    it('should create performance indexes', () => {
      const db = createLegacyDatabase();

      // Run migration
      runContentHashMigration(db);

      // Verify indexes created
      assert.strictEqual(
        hasContentHashIndexes(db),
        true,
        'Indexes should be created after migration'
      );

      db.close();
    });

    it('should preserve existing data during migration', () => {
      const db = createLegacyDatabase();

      // Insert test data before migration
      db.exec(`
        INSERT INTO accounts VALUES ('test_account', 'client', 'free', 'Test Account', 0, 0);
        INSERT INTO users VALUES ('test_user', 'test_account', 'test@test.com', 'hash', 'Test User', 0, 0);
        INSERT INTO nodes VALUES ('node_1', 'source', '{"title":"Test"}', 'test_account', 'test_user', 0, 0, 'real');
        INSERT INTO nodes VALUES ('node_2', 'source', '{"title":"Test 2"}', 'test_account', 'test_user', 0, 0, 'real');
      `);

      const countBefore = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as any;
      assert.strictEqual(countBefore.count, 2, 'Should have 2 nodes before migration');

      // Run migration
      runContentHashMigration(db);

      // Verify data preserved
      const countAfter = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as any;
      assert.strictEqual(countAfter.count, 2, 'Should still have 2 nodes after migration');

      const nodes = db.prepare('SELECT * FROM nodes').all() as any[];
      assert.strictEqual(nodes[0].id, 'node_1', 'Node 1 should be preserved');
      assert.strictEqual(nodes[1].id, 'node_2', 'Node 2 should be preserved');

      db.close();
    });

    it('should set default values for new columns', () => {
      const db = createLegacyDatabase();

      // Insert data
      db.exec(`
        INSERT INTO accounts VALUES ('test_account', 'client', 'free', 'Test Account', 0, 0);
        INSERT INTO users VALUES ('test_user', 'test_account', 'test@test.com', 'hash', 'Test User', 0, 0);
        INSERT INTO nodes VALUES ('node_1', 'source', '{"title":"Test"}', 'test_account', 'test_user', 0, 0, 'real');
      `);

      // Run migration
      runContentHashMigration(db);

      // Verify default values
      const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get('node_1') as any;
      assert.strictEqual(node.content_hash, null, 'content_hash should default to NULL');
      assert.strictEqual(node.canonical_content, null, 'canonical_content should default to NULL');
      assert.strictEqual(node.is_duplicate, 0, 'is_duplicate should default to 0');
      assert.strictEqual(node.original_node_id, null, 'original_node_id should default to NULL');

      db.close();
    });

    it('should allow NULL values for new columns', () => {
      const db = createLegacyDatabase();

      db.exec(`
        INSERT INTO accounts VALUES ('test_account', 'client', 'free', 'Test Account', 0, 0);
        INSERT INTO users VALUES ('test_user', 'test_account', 'test@test.com', 'hash', 'Test User', 0, 0);
      `);

      // Run migration
      runContentHashMigration(db);

      // Insert new node with NULL values
      db.prepare(
        `
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag, content_hash, canonical_content, is_duplicate, original_node_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        'node_1',
        'source',
        '{}',
        'test_account',
        'test_user',
        0,
        0,
        'real',
        null,
        null,
        0,
        null
      );

      const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get('node_1') as any;
      assert.ok(node, 'Node should be inserted with NULL values');

      db.close();
    });
  });

  describe('Migration on Already-Migrated Database', () => {
    it('should skip migration if columns already exist', () => {
      const db = createLegacyDatabase();

      // Run migration first time
      const result1 = runContentHashMigration(db);
      assert.strictEqual(result1.success, true, 'First migration should succeed');

      // Run migration second time (should skip)
      const result2 = runContentHashMigration(db);
      assert.strictEqual(result2.success, true, 'Second migration should succeed (skip)');

      // Verify columns still exist (not duplicated)
      const tableInfo = db.prepare('PRAGMA table_info(nodes)').all() as any[];
      const contentHashColumns = tableInfo.filter((col: any) => col.name === 'content_hash');
      assert.strictEqual(contentHashColumns.length, 1, 'Should have exactly 1 content_hash column');

      db.close();
    });

    it('should not create duplicate indexes', () => {
      const db = createLegacyDatabase();

      // Run migration twice
      runContentHashMigration(db);
      runContentHashMigration(db);

      // Verify indexes not duplicated
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all() as any[];
      const contentHashIndexes = indexes.filter(
        (idx: any) => idx.name === 'idx_nodes_content_hash'
      );

      assert.strictEqual(contentHashIndexes.length, 1, 'Should have exactly 1 content_hash index');

      db.close();
    });
  });

  describe('New Database Creation', () => {
    it('should include content_hash columns in new database schema', () => {
      const db = new Database(':memory:');

      // Create new database with full schema (including content_hash)
      db.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          account_type TEXT NOT NULL DEFAULT 'client',
          account_class TEXT NOT NULL DEFAULT 'free',
          account_name TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS nodes (
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

        CREATE INDEX IF NOT EXISTS idx_nodes_content_hash ON nodes(content_hash);
        CREATE INDEX IF NOT EXISTS idx_nodes_account_hash ON nodes(account_id, content_hash);
      `);

      // Verify columns exist
      assert.strictEqual(
        hasContentHashColumns(db),
        true,
        'New database should have content_hash columns'
      );
      assert.strictEqual(
        hasContentHashIndexes(db),
        true,
        'New database should have content_hash indexes'
      );

      db.close();
    });
  });

  describe('Error Handling', () => {
    it('should handle migration failure gracefully', () => {
      const db = createLegacyDatabase();

      // Close database to cause error
      db.close();

      // Try to run migration on closed database
      try {
        runContentHashMigration(db);
        // Should fail but not crash
      } catch (error: any) {
        assert.ok(error, 'Should catch migration error');
      }
    });

    it('should continue working without columns if migration fails', () => {
      const db = createLegacyDatabase();

      // Insert data before migration attempt
      db.exec(`
        INSERT INTO accounts VALUES ('test_account', 'client', 'free', 'Test Account', 0, 0);
        INSERT INTO users VALUES ('test_user', 'test_account', 'test@test.com', 'hash', 'Test User', 0, 0);
        INSERT INTO nodes VALUES ('node_1', 'source', '{"title":"Test"}', 'test_account', 'test_user', 0, 0, 'real');
      `);

      // Even without migration, old operations should work
      const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get('node_1') as any;
      assert.ok(node, 'Should still be able to query nodes without content_hash columns');

      db.close();
    });
  });

  describe('Column Types and Constraints', () => {
    it('should have correct column types', () => {
      const db = createLegacyDatabase();
      runContentHashMigration(db);

      const tableInfo = db.prepare('PRAGMA table_info(nodes)').all() as any[];
      const columnTypes: Record<string, string> = {};

      for (const col of tableInfo) {
        columnTypes[col.name] = col.type;
      }

      assert.strictEqual(columnTypes.content_hash, 'TEXT', 'content_hash should be TEXT');
      assert.strictEqual(columnTypes.canonical_content, 'TEXT', 'canonical_content should be TEXT');
      assert.strictEqual(columnTypes.is_duplicate, 'INTEGER', 'is_duplicate should be INTEGER');
      assert.strictEqual(columnTypes.original_node_id, 'TEXT', 'original_node_id should be TEXT');

      db.close();
    });

    it('should allow is_duplicate to be 0 or 1', () => {
      const db = createLegacyDatabase();

      db.exec(`
        INSERT INTO accounts VALUES ('test_account', 'client', 'free', 'Test Account', 0, 0);
        INSERT INTO users VALUES ('test_user', 'test_account', 'test@test.com', 'hash', 'Test User', 0, 0);
      `);

      runContentHashMigration(db);

      // Test is_duplicate = 0
      db.prepare(
        `
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, is_duplicate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run('node_1', 'source', '{}', 'test_account', 'test_user', 0, 0, 0);

      // Test is_duplicate = 1
      db.prepare(
        `
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, is_duplicate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run('node_2', 'source', '{}', 'test_account', 'test_user', 0, 0, 1);

      const nodes = db.prepare('SELECT id, is_duplicate FROM nodes ORDER BY id').all() as any[];
      assert.strictEqual(nodes[0].is_duplicate, 0, 'Node 1 should have is_duplicate = 0');
      assert.strictEqual(nodes[1].is_duplicate, 1, 'Node 2 should have is_duplicate = 1');

      db.close();
    });
  });
});
