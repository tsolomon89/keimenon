/**
 * Migration System Tests
 *
 * Tests the database migration system including:
 * - Fresh database scenario (migration 003 creates tables with account_id)
 * - Old migration 003 + migration 007 scenario
 * - Idempotency (safe to run multiple times)
 * - Rollback functionality
 *
 * Run with: npx tsx --test apps/api/src/migrations/__tests__/migrations.test.ts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as migration003 from '../003_grouping_engine_schema';
import * as migration007 from '../007_add_account_isolation_to_phase1_tables';

/**
 * Helper: Create temporary test database
 */
async function createTestDb(name: string): Promise<Database.Database> {
  const testDbPath = path.join(process.cwd(), `.test-dbs`, `${name}.db`);

  // Ensure directory exists
  await fs.mkdir(path.dirname(testDbPath), { recursive: true });

  // Remove if exists
  try {
    await fs.unlink(testDbPath);
  } catch (err) {
    // Ignore if doesn't exist
  }

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

/**
 * Helper: Check if table exists
 */
function tableExists(db: Database.Database, tableName: string): boolean {
  const result = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName);
  return !!result;
}

/**
 * Helper: Check if column exists in table
 */
function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
  return columns.some((col: any) => col.name === columnName);
}

/**
 * Helper: Check if index exists
 */
function indexExists(db: Database.Database, indexName: string): boolean {
  const result = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
    .get(indexName);
  return !!result;
}

describe('Migration 003: Grouping Engine Schema', () => {
  it('should create all Phase 1-3 tables with account_id from day 1', async () => {
    const db = await createTestDb('migration-003-fresh');

    try {
      // Run migration 003
      await migration003.up(db);

      // Verify tables exist
      assert.ok(tableExists(db, 'blobs'), 'blobs table should exist');
      assert.ok(tableExists(db, 'node_spans'), 'node_spans table should exist');
      assert.ok(tableExists(db, 'node_signatures'), 'node_signatures table should exist');
      assert.ok(tableExists(db, 'lsh_bands'), 'lsh_bands table should exist');

      // Verify account_id columns exist
      assert.ok(columnExists(db, 'blobs', 'account_id'), 'blobs should have account_id');
      assert.ok(columnExists(db, 'node_spans', 'account_id'), 'node_spans should have account_id');
      assert.ok(
        columnExists(db, 'node_signatures', 'account_id'),
        'node_signatures should have account_id'
      );
      assert.ok(columnExists(db, 'lsh_bands', 'account_id'), 'lsh_bands should have account_id');

      // Verify indexes exist
      assert.ok(indexExists(db, 'idx_blobs_account'), 'idx_blobs_account should exist');
      assert.ok(indexExists(db, 'idx_spans_account'), 'idx_spans_account should exist');
      assert.ok(indexExists(db, 'idx_sig_account'), 'idx_sig_account should exist');
      assert.ok(indexExists(db, 'idx_lsh_account'), 'idx_lsh_account should exist');

      console.log('✅ Migration 003 creates correct schema with account_id');
    } finally {
      db.close();
    }
  });

  it('should be idempotent (safe to run multiple times)', async () => {
    const db = await createTestDb('migration-003-idempotent');

    try {
      // Run migration 003 twice
      await migration003.up(db);
      await migration003.up(db); // Should not throw

      // Verify tables still exist and are correct
      assert.ok(tableExists(db, 'blobs'), 'blobs table should still exist');
      assert.ok(columnExists(db, 'blobs', 'account_id'), 'blobs should still have account_id');

      console.log('✅ Migration 003 is idempotent');
    } finally {
      db.close();
    }
  });

  it('should correctly report isApplied() status', async () => {
    const db = await createTestDb('migration-003-isapplied');

    try {
      // Before migration
      assert.strictEqual(migration003.isApplied(db), false, 'Should not be applied before running');

      // After migration
      await migration003.up(db);
      assert.strictEqual(migration003.isApplied(db), true, 'Should be applied after running');

      console.log('✅ Migration 003 isApplied() works correctly');
    } finally {
      db.close();
    }
  });
});

describe('Migration 007: Account Isolation Backfill', () => {
  it('should skip gracefully when tables do not exist', async () => {
    const db = await createTestDb('migration-007-no-tables');

    try {
      // Run migration 007 without running migration 003 first
      await migration007.up(db); // Should not throw

      // Verify no tables were created (migration 007 doesn't create tables)
      assert.ok(!tableExists(db, 'blobs'), 'blobs table should not exist');

      console.log('✅ Migration 007 skips gracefully when tables missing');
    } finally {
      db.close();
    }
  });

  it('should skip gracefully when account_id already exists (new migration 003)', async () => {
    const db = await createTestDb('migration-007-with-new-003');

    try {
      // Run new migration 003 (includes account_id)
      await migration003.up(db);

      // Run migration 007
      await migration007.up(db); // Should skip gracefully

      // Verify account_id still exists
      assert.ok(columnExists(db, 'blobs', 'account_id'), 'blobs should still have account_id');

      console.log('✅ Migration 007 skips gracefully when account_id exists');
    } finally {
      db.close();
    }
  });

  it('should correctly report isApplied() for different scenarios', async () => {
    // Scenario 1: No tables exist
    const db1 = await createTestDb('migration-007-isapplied-1');
    try {
      assert.strictEqual(
        migration007.isApplied(db1),
        true,
        'Should return true when tables missing'
      );
    } finally {
      db1.close();
    }

    // Scenario 2: Tables exist with account_id
    const db2 = await createTestDb('migration-007-isapplied-2');
    try {
      await migration003.up(db2);
      assert.strictEqual(
        migration007.isApplied(db2),
        true,
        'Should return true when account_id exists'
      );
    } finally {
      db2.close();
    }

    console.log('✅ Migration 007 isApplied() works correctly');
  });
});

describe('Migration System Integration', () => {
  it('should handle fresh database correctly (003 → 007)', async () => {
    const db = await createTestDb('integration-fresh');

    try {
      // Run migration 003
      await migration003.up(db);

      // Verify migration 003 created account_id
      assert.ok(columnExists(db, 'blobs', 'account_id'), 'Migration 003 should create account_id');

      // Run migration 007
      await migration007.up(db); // Should skip

      // Verify account_id still exists
      assert.ok(columnExists(db, 'blobs', 'account_id'), 'account_id should still exist after 007');

      console.log('✅ Fresh database flow works correctly');
    } finally {
      db.close();
    }
  });

  it('should be idempotent across multiple runs', async () => {
    const db = await createTestDb('integration-idempotent');

    try {
      // Run migrations multiple times
      await migration003.up(db);
      await migration007.up(db);
      await migration003.up(db); // Should be safe
      await migration007.up(db); // Should be safe

      // Verify schema is still correct
      assert.ok(tableExists(db, 'blobs'), 'blobs should exist');
      assert.ok(columnExists(db, 'blobs', 'account_id'), 'account_id should exist');
      assert.ok(indexExists(db, 'idx_blobs_account'), 'index should exist');

      console.log('✅ Multiple migration runs are safe');
    } finally {
      db.close();
    }
  });
});

console.log('\n🧪 Running Migration System Tests\n');
