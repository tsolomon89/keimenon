/**
 * Database Snapshot Manager
 *
 * Creates and manages pristine database snapshots for E2E testing.
 *
 * Architecture:
 *   1. Global setup creates a "golden snapshot" with:
 *      - Complete schema (all migrations applied)
 *      - Standard test user (admin@admin.com / 123456)
 *      - Zero data (completely empty)
 *
 *   2. Each Playwright worker restores from this snapshot:
 *      - Worker 0 gets a copy: .test-dbs/worker-0.db
 *      - Worker 1 gets a copy: .test-dbs/worker-1.db
 *      - etc.
 *
 *   3. Workers use savepoints to isolate individual tests:
 *      - BEGIN SAVEPOINT before each test
 *      - ROLLBACK TO SAVEPOINT after each test
 *      - Result: Perfect isolation, zero zombie data
 *
 * Usage:
 *   // In global-setup.ts
 *   const manager = new DatabaseSnapshotManager();
 *   await manager.createSnapshot();
 *
 *   // In test-isolation.ts (worker fixture)
 *   const dbPath = await manager.restoreToWorker(workerInfo.workerIndex);
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

export class DatabaseSnapshotManager {
  private snapshotPath: string;
  private testDbsDir: string;

  constructor() {
    this.testDbsDir = path.join(process.cwd(), '.test-dbs');
    this.snapshotPath = path.join(this.testDbsDir, 'snapshot-template.db');
  }

  /**
   * Create pristine database snapshot with schema + test user
   *
   * This runs once during global setup before all tests.
   * Creates a clean template that workers will copy from.
   */
  async createSnapshot(): Promise<void> {
    console.log('\n📸 Creating database snapshot template...');

    // Ensure .test-dbs directory exists
    if (!fs.existsSync(this.testDbsDir)) {
      fs.mkdirSync(this.testDbsDir, { recursive: true });
    }

    // Delete old snapshot if exists
    if (fs.existsSync(this.snapshotPath)) {
      fs.unlinkSync(this.snapshotPath);
      console.log('   Deleted old snapshot');
    }

    try {
      // Create database using better-sqlite3 directly (avoids ESM module loading issues)
      console.log('   Creating database using better-sqlite3...');
      const db = new Database(this.snapshotPath);

      // Load schema from schema.sql file
      console.log('   Loading schema from schema.sql...');
      const schemaPath = path.join(process.cwd(), 'packages/db/src/sqlite/schema.sql');

      if (!fs.existsSync(schemaPath)) {
        throw new Error(`Schema file not found: ${schemaPath}`);
      }

      const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');

      // Execute schema to create all tables
      console.log('   Executing schema...');
      db.exec(schemaSQL);

      // Create standard test account
      console.log('   Creating test account...');
      const accountId = 'acc_test_e2e';
      const now = Date.now();

      db.prepare(
        `
        INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
        VALUES (?, 'client', 'business', 'test-account@example.com', 'E2E Test Account', ?, ?)
      `
      ).run(accountId, now, now);

      // Create standard test user
      console.log('   Creating test user (admin@admin.com / 123456)...');
      const userId = 'usr_test_e2e';
      const passwordHash = await bcrypt.hash('123456', 10);

      db.prepare(
        `
        INSERT INTO users (id, email, password_hash, name, permission_level, user_class, is_active, created_at, updated_at, email_verified)
        VALUES (?, 'admin@admin.com', ?, 'E2E Test User', 'admin', 'person', 1, ?, ?, 1)
      `
      ).run(userId, passwordHash, now, now);

      // Link user to account
      const userAccountId = 'ua_test_e2e';
      db.prepare(
        `
        INSERT INTO user_accounts (id, user_id, account_id, permission_level, status, joined_at, created_at, updated_at)
        VALUES (?, ?, ?, 'admin', 'active', ?, ?, ?)
      `
      ).run(userAccountId, userId, accountId, now, now, now);

      // Create fixture accounts for visual stability testing
      // These accounts provide consistent data across test runs, preventing
      // visual differences caused by "No accounts found" vs populated states
      console.log('   Creating fixture accounts for visual stability...');

      const fixtureAccounts = [
        {
          id: 'acc_fixture_client_1',
          name: 'Client Account Alpha',
          type: 'client',
          class: 'free',
          email: 'client-alpha@fixture.test',
        },
        {
          id: 'acc_fixture_client_2',
          name: 'Client Account Beta',
          type: 'client',
          class: 'professional',
          email: 'client-beta@fixture.test',
        },
        {
          id: 'acc_fixture_client_3',
          name: 'Client Account Gamma',
          type: 'client',
          class: 'business',
          email: 'client-gamma@fixture.test',
        },
      ];

      for (const acc of fixtureAccounts) {
        db.prepare(
          `
          INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        ).run(acc.id, acc.type, acc.class, acc.email, acc.name, now, now);
      }

      console.log(`   ✅ Created ${fixtureAccounts.length} fixture accounts`);

      // Verify snapshot is clean (zero data)
      const sessionCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as any;
      const nodeCount = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as any;
      const edgeCount = db.prepare('SELECT COUNT(*) as count FROM edges').get() as any;

      if (sessionCount.count !== 0 || nodeCount.count !== 0 || edgeCount.count !== 0) {
        throw new Error(
          `Snapshot is not clean! sessions=${sessionCount.count}, nodes=${nodeCount.count}, edges=${edgeCount.count}`
        );
      }

      console.log('   ✅ Snapshot created successfully');
      console.log(`   Location: ${this.snapshotPath}`);
      console.log(`   Size: ${this.getFileSize(this.snapshotPath)}`);
      console.log(
        `   Contents: 4 accounts (1 test + 3 fixtures), 1 user, 0 sessions, 0 nodes, 0 edges (pristine state)`
      );

      // Close the database
      db.close();
    } catch (error: any) {
      console.error('❌ Failed to create snapshot:', error.message);
      throw error;
    }
  }

  /**
   * Restore snapshot to worker database
   *
   * Copies the pristine snapshot to a worker-specific database file.
   * Each worker gets its own isolated copy.
   *
   * @param workerIndex - Playwright worker index (0, 1, 2, 3, etc.)
   * @returns Path to worker database
   */
  async restoreToWorker(workerIndex: number): Promise<string> {
    const workerDbPath = path.join(this.testDbsDir, `worker-${workerIndex}.db`);

    if (!this.snapshotExists()) {
      throw new Error(
        `Snapshot template not found at ${this.snapshotPath}. Run global setup first.`
      );
    }

    // Delete old worker DB if exists
    if (fs.existsSync(workerDbPath)) {
      fs.unlinkSync(workerDbPath);
    }

    // Also delete WAL and SHM files
    if (fs.existsSync(`${workerDbPath}-wal`)) {
      fs.unlinkSync(`${workerDbPath}-wal`);
    }
    if (fs.existsSync(`${workerDbPath}-shm`)) {
      fs.unlinkSync(`${workerDbPath}-shm`);
    }

    // Copy snapshot to worker DB
    fs.copyFileSync(this.snapshotPath, workerDbPath);

    console.log(
      `[Worker ${workerIndex}] Restored database from snapshot (${this.getFileSize(workerDbPath)})`
    );

    return workerDbPath;
  }

  /**
   * Check if snapshot template exists
   */
  snapshotExists(): boolean {
    return fs.existsSync(this.snapshotPath);
  }

  /**
   * Get snapshot path (for debugging)
   */
  getSnapshotPath(): string {
    return this.snapshotPath;
  }

  /**
   * Apply all database migrations from packages/db/src/sqlite/migrations
   *
   * Reads migration files in order and executes them.
   * Migration files are named: 001_*.sql, 002_*.sql, etc.
   */
  private async applyMigrations(db: Database.Database): Promise<void> {
    const migrationsDir = path.join(process.cwd(), 'packages/db/src/sqlite/migrations');

    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found: ${migrationsDir}`);
    }

    // Get all .sql files sorted by name (001, 002, 003, etc.)
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    console.log(`   Found ${migrationFiles.length} migration files`);

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      try {
        // Execute migration SQL
        db.exec(sql);
        console.log(`   ✅ Applied: ${file}`);
      } catch (error: any) {
        console.error(`   ❌ Failed to apply ${file}:`, error.message);
        throw error;
      }
    }
  }

  /**
   * Get human-readable file size
   */
  private getFileSize(filePath: string): string {
    const stats = fs.statSync(filePath);
    const bytes = stats.size;

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
