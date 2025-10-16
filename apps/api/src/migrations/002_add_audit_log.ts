/**
 * Migration 002: Add audit_log table
 * Tracks all user actions for security and analytics
 */

import Database from 'better-sqlite3';

export async function addAuditLogTable(db: Database.Database): Promise<void> {
  console.log('🔧 Running migration 002: Add audit_log table');

  try {
    // Check if audit_log table already exists
    const existingTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'")
      .get() as any;

    if (existingTable) {
      console.log('⏭️  audit_log table already exists, skipping migration');
      return;
    }

    // Create audit_log table
    db.exec(`
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT NOT NULL,
        actor_account_id TEXT NOT NULL,
        target_account_id TEXT,
        action TEXT NOT NULL CHECK(action IN ('read', 'create', 'update', 'delete')),
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        mode TEXT NOT NULL CHECK(mode IN ('native', 'crm', 'nested')),
        success INTEGER NOT NULL DEFAULT 1,
        reason TEXT,
        ip_address TEXT,
        user_agent TEXT,
        metadata TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
    `);

    console.log('✅ Created audit_log table');

    // Create indexes for common queries
    db.exec(`
      CREATE INDEX idx_audit_log_actor_user ON audit_log(actor_user_id);
      CREATE INDEX idx_audit_log_actor_account ON audit_log(actor_account_id);
      CREATE INDEX idx_audit_log_target_account ON audit_log(target_account_id);
      CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
      CREATE INDEX idx_audit_log_action ON audit_log(action);
      CREATE INDEX idx_audit_log_resource_type ON audit_log(resource_type);
      CREATE INDEX idx_audit_log_success ON audit_log(success);
      CREATE INDEX idx_audit_log_mode ON audit_log(mode);
    `);

    console.log('✅ Created indexes for audit_log table');

    // Update schema metadata
    db.prepare(`
      INSERT OR REPLACE INTO schema_metadata (key, value)
      VALUES ('migration_002', datetime('now'))
    `).run();

    console.log('✅ Migration 002 completed successfully');
  } catch (error) {
    console.error('❌ Migration 002 failed:', error);
    throw error;
  }
}

/**
 * Run this migration manually
 */
export async function runMigration(databasePath: string): Promise<void> {
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');

  try {
    await addAuditLogTable(db);
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Allow running directly with: npx tsx src/migrations/002_add_audit_log.ts
if (require.main === module) {
  const dbPath = process.env.DB_PATH || `${process.env.USERPROFILE}/.canvas-memory/canvas.db`;
  console.log(`Running migration on database: ${dbPath}`);
  runMigration(dbPath)
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}
