import Database from 'better-sqlite3';

/**
 * Migration 007: Add Account ID to Phase 1-3 Tables
 *
 * CRITICAL SECURITY FIX: Add account_id column to blobs, node_spans,
 * node_signatures, and lsh_bands tables for proper multi-tenant isolation.
 *
 * Previously, these tables only had data_tag for test vs. prod isolation,
 * which is insufficient for multi-tenant security.
 *
 * DEPENDENCIES: Requires migration 003 (grouping engine schema) to have been run first.
 * If migration 003 has not been run, this migration will skip gracefully.
 *
 * NOTE: As of 2025-11-08, migration 003 was updated to include account_id from day 1.
 * This migration is only needed for databases that ran the OLD version of migration 003.
 *
 * Phase: Security Critical
 * Date: 2025-11-08
 * Updated: 2025-11-08 (added defensive existence checks)
 * Priority: PRODUCTION BLOCKER (for databases with old migration 003)
 */

export const MIGRATION_007_UP = `
-- Add account_id column to blobs table
ALTER TABLE blobs ADD COLUMN account_id TEXT;

-- Add indexes and foreign keys for blobs
CREATE INDEX IF NOT EXISTS idx_blobs_account ON blobs(account_id);

-- Add account_id column to node_spans table
ALTER TABLE node_spans ADD COLUMN account_id TEXT;

-- Add indexes for node_spans
CREATE INDEX IF NOT EXISTS idx_spans_account ON node_spans(account_id);

-- Add account_id column to node_signatures table
ALTER TABLE node_signatures ADD COLUMN account_id TEXT;

-- Add indexes for node_signatures
CREATE INDEX IF NOT EXISTS idx_sig_account ON node_signatures(account_id);

-- Add account_id column to lsh_bands table
ALTER TABLE lsh_bands ADD COLUMN account_id TEXT;

-- Add indexes for lsh_bands
CREATE INDEX IF NOT EXISTS idx_lsh_account ON lsh_bands(account_id);

-- NOTE: We add account_id as nullable initially to allow existing data migration.
-- After migration, services MUST populate account_id for all new records.
-- In a future migration, these columns can be made NOT NULL after data backfill.
`;

export const MIGRATION_007_DOWN = `
-- Rollback migration 007: Remove account_id from Phase 1-3 tables

DROP INDEX IF EXISTS idx_blobs_account;
-- SQLite doesn't support DROP COLUMN directly, so we'd need to recreate tables
-- For safety, we'll leave the columns in place during rollback
-- and just drop the indexes

DROP INDEX IF EXISTS idx_spans_account;
DROP INDEX IF EXISTS idx_sig_account;
DROP INDEX IF EXISTS idx_lsh_account;

-- To fully rollback, you'd need to:
-- 1. Create new tables without account_id
-- 2. Copy data from old tables
-- 3. Drop old tables
-- 4. Rename new tables
-- This is left as a manual operation for safety
`;

/**
 * Apply migration
 */
export async function up(db: Database.Database): Promise<void> {
  console.log('🔒 Running migration 007: Add Account Isolation to Phase 1-3 Tables...');
  console.log('⚠️  This is a CRITICAL SECURITY FIX for multi-tenant isolation');

  // 1. Check if migration 003 tables exist
  const requiredTables = ['blobs', 'node_spans', 'node_signatures', 'lsh_bands'];
  const missingTables: string[] = [];

  for (const tableName of requiredTables) {
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(tableName);

    if (!tableExists) {
      missingTables.push(tableName);
    }
  }

  // If any tables are missing, migration 003 hasn't run
  if (missingTables.length > 0) {
    console.log('⏭️  Skipping migration 007: Phase 1-3 tables do not exist yet');
    console.log(`   Missing tables: ${missingTables.join(', ')}`);
    console.log('   → Migration 003 (grouping engine schema) must be run first');
    console.log('   → This is NORMAL for fresh databases');
    console.log('   → Migration 003 now includes account_id from day 1');
    return; // Skip gracefully
  }

  // 2. Check if account_id already exists (idempotency check)
  const blobColumns = db.prepare('PRAGMA table_info(blobs)').all() as any[];
  const hasAccountId = blobColumns.some((col: any) => col.name === 'account_id');

  if (hasAccountId) {
    console.log('✅ Migration 007 already applied - account_id columns exist');
    console.log('   (This is NORMAL if migration 003 was run with updated schema)');
    return; // Already applied
  }

  // 3. Tables exist but don't have account_id - this is old migration 003
  console.log('⚠️  Detected OLD migration 003 schema (no account_id)');
  console.log('   → Applying account_id columns and indexes...');

  try {
    db.exec(MIGRATION_007_UP);
    console.log('✅ Migration 007 completed successfully');
    console.log('📝 NOTE: Existing records have NULL account_id');
    console.log('📝 NEXT STEPS:');
    console.log('   1. Run backfill script: npx tsx scripts/backfill-account-ids.ts');
    console.log('   2. Update services to populate account_id for new records');
    console.log('   3. Create follow-up migration to make account_id NOT NULL');
  } catch (error: any) {
    // Handle duplicate column error gracefully
    if (error.message && error.message.includes('duplicate column name')) {
      console.log('✅ Migration 007 already applied (columns exist)');
      return;
    }

    console.error('❌ Migration 007 failed:', error);
    throw error;
  }
}

/**
 * Rollback migration
 */
export async function down(db: Database.Database): Promise<void> {
  console.log('Rolling back migration 007: Add Account Isolation...');

  try {
    db.exec(MIGRATION_007_DOWN);
    console.log('⚠️  Migration 007 rolled back (indexes removed, columns remain)');
    console.log('⚠️  For full rollback, manually recreate tables without account_id columns');
  } catch (error) {
    console.error('❌ Migration 007 rollback failed:', error);
    throw error;
  }
}

/**
 * Check if migration has been applied
 *
 * This migration is considered "applied" if:
 * 1. The blobs table doesn't exist (migration 003 not run yet - skip gracefully), OR
 * 2. The blobs table exists AND has account_id column
 *
 * This allows migration 007 to be idempotent and work with both fresh and migrated databases.
 */
export function isApplied(db: Database.Database): boolean {
  // Check if blobs table exists
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='blobs'")
    .get() as any;

  // If table doesn't exist, migration 003 hasn't run yet
  // Consider this migration "applied" (it will skip in up() function)
  if (!tableExists) {
    return true; // Return true to skip (no work needed)
  }

  // Table exists - check if it has account_id column
  const columns = db.prepare('PRAGMA table_info(blobs)').all() as any[];
  const hasAccountId = columns.some((col: any) => col.name === 'account_id');

  return hasAccountId;
}
