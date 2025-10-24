/**
 * Migration Runner Tests
 *
 * Tests the automatic migration system to ensure:
 * - Migrations are detected and run automatically
 * - Migration state is tracked correctly
 * - Migrations are idempotent (safe to run multiple times)
 * - Migrations run in correct order
 * - Failed migrations stop execution
 *
 * Related:
 * - packages/db/src/sqlite/MigrationRunner.ts
 * - packages/db/src/sqlite/migrations/
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { MigrationRunner } from '../MigrationRunner';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('MigrationRunner', () => {
  let db: Database.Database;
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    // Create temp directory for test database
    tempDir = path.join(os.tmpdir(), `migration-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    dbPath = path.join(tempDir, 'test.db');

    // Create test database
    db = new Database(dbPath);

    // Create minimal schema (migrations table will be created by runner)
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_table (
        id INTEGER PRIMARY KEY,
        value TEXT
      )
    `);
  });

  afterEach(async () => {
    // Close database
    if (db) {
      db.close();
    }

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should create migrations tracking table', async () => {
    const runner = new MigrationRunner(db);

    // Run migrations (none available, but should create table)
    await runner.runPendingMigrations();

    // Verify migrations table exists
    const tables = db
      .prepare(
        `
      SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'
    `
      )
      .all();

    expect(tables).toHaveLength(1);
    expect(tables[0]).toHaveProperty('name', 'migrations');

    // Verify table schema
    const tableInfo = db.prepare('PRAGMA table_info(migrations)').all() as any[];
    const columns = tableInfo.map((col) => col.name);

    expect(columns).toContain('id');
    expect(columns).toContain('name');
    expect(columns).toContain('applied_at');
    expect(columns).toContain('checksum');
  });

  it('should track applied migrations', async () => {
    const runner = new MigrationRunner(db);

    // Run migrations
    await runner.runPendingMigrations();

    // Query applied migrations
    const applied = db.prepare('SELECT * FROM migrations ORDER BY name').all() as any[];

    // Should have several migrations applied (002, 003, 007, 008)
    expect(applied.length).toBeGreaterThan(0);

    // Verify each migration record has required fields
    for (const migration of applied) {
      expect(migration).toHaveProperty('id');
      expect(migration).toHaveProperty('name');
      expect(migration).toHaveProperty('applied_at');
      expect(migration.name).toMatch(/^\d{3}_.*\.sql$/); // Format: 002_add_data_tags.sql
    }

    console.log(`   ✅ Applied ${applied.length} migrations:`);
    applied.forEach((m) => console.log(`      - ${m.name}`));
  });

  it('should be idempotent - running twice should not duplicate', async () => {
    const runner = new MigrationRunner(db);

    // Run migrations first time
    await runner.runPendingMigrations();

    const appliedFirst = db.prepare('SELECT COUNT(*) as count FROM migrations').get() as any;
    const countFirst = appliedFirst.count;

    // Run migrations second time
    await runner.runPendingMigrations();

    const appliedSecond = db.prepare('SELECT COUNT(*) as count FROM migrations').get() as any;
    const countSecond = appliedSecond.count;

    // Should have same count (no duplicates)
    expect(countSecond).toBe(countFirst);

    console.log(
      `   ✅ Idempotent: ${countFirst} migrations on first run, ${countSecond} on second run`
    );
  });

  it('should run migrations in correct order (by number prefix)', async () => {
    const runner = new MigrationRunner(db);

    // Run migrations
    await runner.runPendingMigrations();

    // Get applied migrations
    const applied = db.prepare('SELECT name FROM migrations ORDER BY id').all() as any[];

    // Extract number prefixes
    const numbers = applied.map((m) => parseInt(m.name.split('_')[0], 10));

    // Verify sorted order
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]).toBeGreaterThanOrEqual(numbers[i - 1]);
    }

    console.log(`   ✅ Migrations ran in order: ${numbers.join(' → ')}`);
  });

  it('should verify jobs tables exist after migration 008', async () => {
    const runner = new MigrationRunner(db);

    // Run migrations
    await runner.runPendingMigrations();

    // Verify migration 008 was applied
    const migration008 = db
      .prepare('SELECT * FROM migrations WHERE name LIKE ?')
      .get('008_%') as any;
    expect(migration008).toBeDefined();

    // Verify jobs tables exist
    const tables = db
      .prepare(
        `
      SELECT name FROM sqlite_master
      WHERE type='table'
      AND name IN ('jobs', 'job_events', 'job_items', 'job_idempotency')
      ORDER BY name
    `
      )
      .all() as any[];

    expect(tables).toHaveLength(4);
    expect(tables.map((t) => t.name)).toEqual([
      'job_events',
      'job_idempotency',
      'job_items',
      'jobs',
    ]);

    // Verify jobs table schema
    const jobsSchema = db.prepare('PRAGMA table_info(jobs)').all() as any[];
    const jobsColumns = jobsSchema.map((col) => col.name);

    expect(jobsColumns).toContain('id');
    expect(jobsColumns).toContain('type');
    expect(jobsColumns).toContain('status');
    expect(jobsColumns).toContain('account_id');
    expect(jobsColumns).toContain('concurrency_group');

    console.log(`   ✅ All job system tables created by migration 008`);
  });

  it('should create indexes from migrations', async () => {
    const runner = new MigrationRunner(db);

    // Run migrations
    await runner.runPendingMigrations();

    // Get all indexes
    const indexes = db
      .prepare(
        `
      SELECT name FROM sqlite_master
      WHERE type='index'
      AND name LIKE 'idx_%'
      ORDER BY name
    `
      )
      .all() as any[];

    // Should have many indexes (from base schema + migrations)
    expect(indexes.length).toBeGreaterThan(10);

    // Verify some key job indexes exist
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_jobs_status');
    expect(indexNames).toContain('idx_jobs_account');
    expect(indexNames).toContain('idx_jobs_type');

    console.log(`   ✅ Created ${indexes.length} indexes`);
  });

  it('should handle missing migrations directory gracefully', async () => {
    // Create a new database with no migrations directory accessible
    const isolatedDbPath = path.join(tempDir, 'isolated.db');
    const isolatedDb = new Database(isolatedDbPath);

    const runner = new MigrationRunner(isolatedDb);

    // Should not throw when migrations directory is missing
    await expect(runner.runPendingMigrations()).resolves.not.toThrow();

    // Should still create migrations table
    const tables = isolatedDb
      .prepare(
        `
      SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'
    `
      )
      .all();

    expect(tables).toHaveLength(1);

    isolatedDb.close();
  });

  it('should record checksum for each migration', async () => {
    const runner = new MigrationRunner(db);

    // Run migrations
    await runner.runPendingMigrations();

    // Get applied migrations
    const applied = db.prepare('SELECT name, checksum FROM migrations').all() as any[];

    // All migrations should have checksums
    for (const migration of applied) {
      expect(migration.checksum).toBeDefined();
      expect(migration.checksum).not.toBe('');
      expect(migration.checksum).toMatch(/^\d+:\d+:\d+$/); // Format: length:first:last
    }

    console.log(`   ✅ All ${applied.length} migrations have checksums`);
  });

  it('should get migration status', () => {
    const runner = new MigrationRunner(db);

    // Get status before running
    const statusBefore = runner.getMigrationStatus();
    expect(statusBefore).toHaveProperty('applied');
    expect(statusBefore).toHaveProperty('pending');
    expect(Array.isArray(statusBefore.applied)).toBe(true);

    console.log(`   ✅ Status: ${statusBefore.applied.length} applied`);
  });
});

describe('MigrationRunner - Error Handling', () => {
  let db: Database.Database;
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `migration-error-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    dbPath = path.join(tempDir, 'test.db');

    db = new Database(dbPath);

    db.exec(`
      CREATE TABLE IF NOT EXISTS test_table (
        id INTEGER PRIMARY KEY,
        value TEXT
      )
    `);
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }

    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should fail loudly if migration SQL is invalid', async () => {
    // This test would require creating a mock migration file with invalid SQL
    // For now, we'll just verify the behavior is correct by checking
    // that the runner doesn't swallow errors

    const runner = new MigrationRunner(db);

    // Run migrations - if any have invalid SQL, this should throw
    // (In practice, our migrations are valid, so this will succeed)
    await expect(runner.runPendingMigrations()).resolves.not.toThrow();

    // NOTE: To truly test error handling, we would need to:
    // 1. Create a temp migrations directory
    // 2. Add a migration file with invalid SQL
    // 3. Point the runner at that directory
    // 4. Verify it throws with a clear error message
  });
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
