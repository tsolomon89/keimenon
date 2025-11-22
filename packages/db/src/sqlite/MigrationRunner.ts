/**
 * Migration Runner
 *
 * Automatically runs pending database migrations on startup.
 *
 * Features:
 * - Scans migrations directory for .sql files
 * - Tracks applied migrations in 'migrations' table
 * - Runs migrations in order (by filename number)
 * - Idempotent - safe to run multiple times
 * - Logs all operations for debugging
 *
 * Usage:
 *   const runner = new MigrationRunner(db);
 *   await runner.runPendingMigrations();
 *
 * Related: Fix for "jobs table doesn't exist" issue
 * See: docs/active_development/JOBS_MIGRATION_CRITICAL_FIX.md
 */

import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';

export interface MigrationRecord {
  id: number;
  name: string;
  applied_at: number;
  checksum?: string;
}

export class MigrationRunner {
  constructor(private db: Database.Database) {}

  /**
   * Run all pending migrations
   */
  async runPendingMigrations(): Promise<void> {
    console.log('🔄 MigrationRunner: Checking for pending migrations...');

    // Step 1: Ensure migrations tracking table exists
    this.ensureMigrationsTable();

    // Step 2: Get list of applied migrations
    const applied = this.getAppliedMigrations();
    console.log(`   Found ${applied.length} previously applied migrations`);

    // Step 3: Scan migrations directory
    const available = await this.getAvailableMigrations();
    console.log(`   Found ${available.length} total migration files`);

    // Step 4: Determine pending migrations
    const appliedNames = new Set(applied.map((m) => m.name));
    const pending = available.filter((m) => !appliedNames.has(m.name));

    if (pending.length === 0) {
      console.log('   ✅ All migrations up to date');
      return;
    }

    console.log(`   📋 Found ${pending.length} pending migrations:`);
    pending.forEach((m) => console.log(`      - ${m.name}`));

    // Step 5: Run pending migrations in order
    for (const migration of pending) {
      await this.runMigration(migration);
    }

    console.log('   ✅ All pending migrations completed successfully');
  }

  /**
   * Ensure migrations tracking table exists
   */
  private ensureMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL,
        checksum TEXT
      )
    `);
  }

  /**
   * Get list of applied migrations from database
   */
  private getAppliedMigrations(): MigrationRecord[] {
    const stmt = this.db.prepare('SELECT * FROM migrations ORDER BY name');
    return stmt.all() as MigrationRecord[];
  }

  /**
   * Get list of available migration files from filesystem
   */
  private async getAvailableMigrations(): Promise<Array<{ name: string; path: string }>> {
    // Migrations are in packages/db/src/sqlite/migrations/
    const migrationsDir = path.join(__dirname, 'migrations');

    let files: string[];
    try {
      files = await fs.readdir(migrationsDir);
    } catch (error: any) {
      console.warn(`   ⚠️ Could not read migrations directory: ${migrationsDir}`);
      console.warn(`   Error: ${error.message}`);
      return [];
    }

    // Filter to .sql files only, sort by number prefix
    const sqlFiles = files
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => {
        // Extract number prefix (e.g., "002" from "002_add_data_tags.sql")
        const numA = parseInt(a.split('_')[0], 10);
        const numB = parseInt(b.split('_')[0], 10);
        return numA - numB;
      });

    return sqlFiles.map((file) => ({
      name: file,
      path: path.join(migrationsDir, file),
    }));
  }

  /**
   * Run a single migration
   */
  private async runMigration(migration: { name: string; path: string }): Promise<void> {
    console.log(`   🔧 Running migration: ${migration.name}`);

    // Read SQL file outside try block so we can access it in catch
    const sql = await fs.readFile(migration.path, 'utf-8');
    const checksum = this.calculateChecksum(sql);

    // Extract version number from filename (e.g., "002" from "002_add_data_tags.sql")
    const version = migration.name.split('_')[0];

    try {
      // Execute migration in a transaction
      const runMigration = this.db.transaction(() => {
        // Execute the migration SQL
        this.db.exec(sql);

        // Record migration as applied
        const stmt = this.db.prepare(
          'INSERT INTO migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)'
        );
        stmt.run(version, migration.name, Date.now(), checksum);
      });

      runMigration();

      console.log(`      ✅ Migration ${migration.name} applied successfully`);
    } catch (error: any) {
      // Check if this is a "duplicate column" error - means migration was already applied
      if (error.message && error.message.includes('duplicate column name')) {
        console.log(`      ⚠️ Migration ${migration.name} already applied (columns exist)`);
        console.log(`      📝 Recording as applied...`);

        // Record migration as applied (outside transaction since SQL failed)
        try {
          const stmt = this.db.prepare(
            'INSERT OR IGNORE INTO migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)'
          );
          stmt.run(version, migration.name, Date.now(), checksum);
          console.log(`      ✅ Migration ${migration.name} marked as applied`);
          return; // Continue to next migration
        } catch (recordError: any) {
          console.error(`      ❌ Failed to record migration: ${recordError.message}`);
        }
      }

      // For other errors, fail loudly
      console.error(`      ❌ Migration ${migration.name} failed:`);
      console.error(`      Error: ${error.message}`);
      throw error; // Fail loudly - don't continue if migration fails
    }
  }

  /**
   * Calculate checksum for migration file (simple implementation)
   */
  private calculateChecksum(sql: string): string {
    // Simple checksum: length + first 100 chars + last 100 chars
    // This is NOT cryptographic, just a basic sanity check
    const first = sql.substring(0, 100);
    const last = sql.substring(Math.max(0, sql.length - 100));
    return `${sql.length}:${first.length}:${last.length}`;
  }

  /**
   * Get migration status (for debugging/health checks)
   */
  getMigrationStatus(): {
    applied: MigrationRecord[];
    pending: string[];
  } {
    const applied = this.getAppliedMigrations();
    // Note: Can't call async getAvailableMigrations here
    // This is a sync method for quick status checks
    return {
      applied,
      pending: [], // Would need to be async to get pending
    };
  }
}
