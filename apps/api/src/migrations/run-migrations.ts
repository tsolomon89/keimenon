import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import * as migration003 from './003_grouping_engine_schema';
import * as migration004 from './004_canonical_map_and_stats';
import * as migration005 from './005_clustering_schema';
import * as migration008 from './008_settings_schema';
import * as migration006_policy from './006_policy_versions_and_runs';
import * as migration007 from './007_add_account_isolation_to_phase1_tables';
import * as migration009 from './009_migrate_chat_threads';

/**
 * Migration runner for SQLite database
 *
 * Usage:
 *   npx tsx src/migrations/run-migrations.ts
 *   npx tsx src/migrations/run-migrations.ts --rollback 006
 *   npx tsx src/migrations/run-migrations.ts --status
 */

interface MigrationModule {
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

const MIGRATIONS: Record<string, MigrationModule> = {
  '003': migration003,
  '004': migration004,
  '005': migration005,
  '006_policy': migration006_policy,
  '007': migration007,
  '008': migration008,
  '009': migration009,
};

function getDatabasePath(): string {
  // Default to ~/.keimenon/keimenon.db
  const defaultPath = path.join(os.homedir(), '.keimenon', 'keimenon.db');

  // Check environment variable
  const envPath = process.env.DB_PATH || process.env.DATABASE_PATH;

  return envPath || defaultPath;
}

async function ensureMigrationsTable(db: Database.Database): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);
}

async function getAppliedMigrations(db: Database.Database): Promise<string[]> {
  await ensureMigrationsTable(db);

  const rows = db.prepare('SELECT version FROM migrations ORDER BY version').all() as Array<{
    version: string;
  }>;

  return rows.map((row) => row.version);
}

async function runMigration(
  db: Database.Database,
  version: string,
  module: MigrationModule
): Promise<void> {
  console.log(`\n📦 Running migration ${version}...`);

  try {
    module.up(db);

    // Record migration
    db.prepare('INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
      version,
      `migration_${version}`,
      Date.now()
    );

    console.log(`✅ Migration ${version} completed successfully`);
  } catch (error) {
    console.error(`❌ Migration ${version} failed:`, error);
    throw error;
  }
}

async function rollbackMigration(
  db: Database.Database,
  version: string,
  module: MigrationModule
): Promise<void> {
  console.log(`\n🔄 Rolling back migration ${version}...`);

  try {
    module.down(db);

    // Remove migration record
    db.prepare('DELETE FROM migrations WHERE version = ?').run(version);

    console.log(`✅ Migration ${version} rolled back successfully`);
  } catch (error) {
    console.error(`❌ Migration ${version} rollback failed:`, error);
    throw error;
  }
}

async function showStatus(db: Database.Database): Promise<void> {
  const appliedMigrations = await getAppliedMigrations(db);

  console.log('\n📊 Migration Status\n');
  console.log('Available Migrations:');

  for (const [version] of Object.entries(MIGRATIONS)) {
    const isApplied = appliedMigrations.includes(version);
    const status = isApplied ? '✅ Applied' : '⏳ Pending';
    console.log(`  ${version}: ${status}`);
  }

  console.log('\nDatabase Schema Version:');
  const schemaVersion = db
    .prepare("SELECT value FROM schema_metadata WHERE key = 'version'")
    .get() as any;
  console.log(`  ${schemaVersion?.value || 'unknown'}`);
}

async function runAllPendingMigrations(db: Database.Database): Promise<void> {
  const appliedMigrations = await getAppliedMigrations(db);
  const sortedVersions = Object.keys(MIGRATIONS).sort();

  let ranCount = 0;

  for (const version of sortedVersions) {
    if (!appliedMigrations.includes(version)) {
      await runMigration(db, version, MIGRATIONS[version]);
      ranCount++;
    }
  }

  if (ranCount === 0) {
    console.log('\n✅ All migrations are up to date');
  } else {
    console.log(`\n✅ Ran ${ranCount} migration(s)`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const target = args[1];

  const dbPath = getDatabasePath();
  console.log(`📂 Database: ${dbPath}`);

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  const fs = await import('fs/promises');
  await fs.mkdir(dir, { recursive: true });

  // Connect to database
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    if (command === '--status') {
      await showStatus(db);
    } else if (command === '--rollback') {
      if (!target) {
        console.error('❌ Error: Please specify migration version to rollback');
        console.error('   Usage: npm run migrate -- --rollback 003');
        process.exit(1);
      }

      if (!MIGRATIONS[target]) {
        console.error(`❌ Error: Migration ${target} not found`);
        process.exit(1);
      }

      await rollbackMigration(db, target, MIGRATIONS[target]);
    } else {
      // Default: run all pending migrations
      await runAllPendingMigrations(db);
    }
  } finally {
    db.close();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}

export { main, runAllPendingMigrations, rollbackMigration, showStatus };
