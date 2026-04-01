/**
 * Database Snapshot Manager
 *
 * Creates and manages pristine database snapshots for E2E testing.
 *
 * Architecture:
 *   1. Global setup creates a "golden snapshot" with:
 *      - Complete schema (all migrations applied)
 *      - Standard test user (admin@admin.com / TestPass123!)
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
import bcrypt from 'bcrypt';
import { createHash } from 'crypto';

export class DatabaseSnapshotManager {
  private snapshotPath: string;
  private jobsSnapshotPath: string;
  private testDbsDir: string;

  constructor() {
    this.testDbsDir = path.join(process.cwd(), '.test-dbs');
    this.snapshotPath = path.join(this.testDbsDir, 'snapshot-template.db');
    this.jobsSnapshotPath = path.join(this.testDbsDir, 'snapshot-template-jobs.db');
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
      // IMPORTANT: Using standard test password that meets all validation requirements
      console.log('   Creating test user (admin@admin.com / TestPass123!)...');
      const userId = 'usr_test_e2e';
      const passwordHash = await bcrypt.hash('TestPass123!', 10);

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

      // CRITICAL FIX: Create session for test user
      // This fixes "Valid JWT token but no session found" errors in ~10 tests
      // Tests require both valid JWT AND database session record
      console.log('   Creating test session...');
      const sessionId = 'sess_test_e2e';
      const testToken = 'test_jwt_token_e2e_main';
      const testTokenHash = createHash('sha256').update(testToken).digest('hex');
      const expiresAt = now + 86400000; // 24 hours from now

      db.prepare(
        `
        INSERT INTO sessions (
          id, user_id, account_id, token, token_hash, token_family_id, parent_session_id,
          created_at, expires_at, operating_account_id, data_tag, last_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'test', ?)
      `
      ).run(
        sessionId,
        userId,
        accountId,
        testTokenHash,
        testTokenHash,
        sessionId,
        null,
        now,
        expiresAt,
        accountId,
        now
      );

      console.log('   ✅ Test session created successfully');

      // Create fixture accounts for visual stability testing
      // These accounts provide consistent data across test runs, preventing
      // visual differences caused by "No accounts found" vs populated states
      console.log('   Creating fixture accounts for visual stability...');

      // IMPORTANT: All test accounts use the SAME simple password for consistency
      // This prevents bcrypt/password mismatch issues during testing
      const TEST_PASSWORD = 'TestPass123!';

      const fixtureAccounts = [
        {
          id: 'acc_fixture_alpha',
          name: 'Client Account Alpha',
          type: 'client',
          class: 'free',
          email: 'client-alpha@fixture.test',
          userId: 'usr_fixture_alpha',
          userAccountId: 'ua_fixture_alpha',
          password: TEST_PASSWORD,
        },
        {
          id: 'acc_fixture_beta',
          name: 'Client Account Beta',
          type: 'client',
          class: 'professional',
          email: 'client-beta@fixture.test',
          userId: 'usr_fixture_beta',
          userAccountId: 'ua_fixture_beta',
          password: TEST_PASSWORD,
        },
        {
          id: 'acc_fixture_gamma',
          name: 'Client Account Gamma',
          type: 'client',
          class: 'business',
          email: 'client-gamma@fixture.test',
          userId: 'usr_fixture_gamma',
          userAccountId: 'ua_fixture_gamma',
          password: TEST_PASSWORD,
        },
      ];

      for (const acc of fixtureAccounts) {
        // Create account
        db.prepare(
          `
          INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        ).run(acc.id, acc.type, acc.class, acc.email, acc.name, now, now);

        // Create user for this account
        const fixturePasswordHash = await bcrypt.hash(acc.password, 10);
        db.prepare(
          `
          INSERT INTO users (id, email, password_hash, name, permission_level, user_class, is_active, created_at, updated_at, email_verified)
          VALUES (?, ?, ?, ?, 'senior', 'person', 1, ?, ?, 1)
        `
        ).run(acc.userId, acc.email, fixturePasswordHash, acc.name, now, now);

        // Link user to account
        db.prepare(
          `
          INSERT INTO user_accounts (id, user_id, account_id, permission_level, status, joined_at, created_at, updated_at)
          VALUES (?, ?, ?, 'senior', 'active', ?, ?, ?)
        `
        ).run(acc.userAccountId, acc.userId, acc.id, now, now, now);

        // IMPORTANT: We do NOT pre-create sessions for fixture accounts
        // Sessions are created dynamically when tests call login()
        // Pre-created sessions with placeholder tokens cause "session not found" warnings
        // because the JWT tokens created at runtime don't match the placeholder tokens
      }

      console.log(
        `   ✅ Created ${fixtureAccounts.length} fixture accounts with users (sessions created at runtime)`
      );

      // CRITICAL: Link gamma user to all accounts for multi-account switching tests
      // The gamma user needs access to alpha and beta accounts to test account switching
      console.log('   Linking gamma user to multiple accounts for switching tests...');
      const gammaUserId = 'usr_fixture_gamma';

      // Link gamma user to alpha account
      db.prepare(
        `
        INSERT INTO user_accounts (id, user_id, account_id, permission_level, status, joined_at, created_at, updated_at)
        VALUES (?, ?, ?, 'senior', 'active', ?, ?, ?)
      `
      ).run('ua_gamma_to_alpha', gammaUserId, 'acc_fixture_alpha', now, now, now);

      // Link gamma user to beta account
      db.prepare(
        `
        INSERT INTO user_accounts (id, user_id, account_id, permission_level, status, joined_at, created_at, updated_at)
        VALUES (?, ?, ?, 'senior', 'active', ?, ?, ?)
      `
      ).run('ua_gamma_to_beta', gammaUserId, 'acc_fixture_beta', now, now, now);

      console.log(`   ✅ Gamma user now has access to all 3 accounts (for switching tests)`);

      // Verify snapshot has expected structure (sessions for test users, zero nodes/edges)
      const sessionCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as any;
      const nodeCount = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as any;
      const edgeCount = db.prepare('SELECT COUNT(*) as count FROM edges').get() as any;

      // Expected: 1 session (main test user only - fixture accounts create sessions at runtime), 0 nodes, 0 edges
      // CRITICAL FIX #5: Changed from 4 sessions to 1 session
      // Fixture account sessions are NOT pre-created to avoid "session not found" warnings
      if (sessionCount.count !== 1 || nodeCount.count !== 0 || edgeCount.count !== 0) {
        throw new Error(
          `Snapshot has unexpected data! Expected: 1 session, 0 nodes, 0 edges. Got: sessions=${sessionCount.count}, nodes=${nodeCount.count}, edges=${edgeCount.count}`
        );
      }

      // CRITICAL FIX #8: Drop and recreate FTS5 table to fix "no such column: T.content" error
      // This error occurs when FTS5's internal tables (nodes_fts_content, nodes_fts_data) are out of sync
      // Simply rebuilding doesn't fix corrupted internal tables - we need to drop and recreate
      console.log('   Rebuilding FTS5 indexes for integrity...');
      try {
        // Drop existing FTS table and its triggers
        db.prepare('DROP TABLE IF EXISTS nodes_fts').run();

        // Recreate FTS table with correct schema (from schema.sql)
        db.prepare(
          'CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(id UNINDEXED, content)'
        ).run();

        // Recreate FTS triggers (from schema.sql)
        db.prepare(
          `
          CREATE TRIGGER IF NOT EXISTS nodes_fts_insert AFTER INSERT ON nodes BEGIN
            INSERT INTO nodes_fts(id, content) VALUES (new.id, new.properties);
          END
        `
        ).run();

        db.prepare(
          `
          CREATE TRIGGER IF NOT EXISTS nodes_fts_update AFTER UPDATE ON nodes BEGIN
            DELETE FROM nodes_fts WHERE id = old.id;
            INSERT INTO nodes_fts(id, content) VALUES (new.id, new.properties);
          END
        `
        ).run();

        db.prepare(
          `
          CREATE TRIGGER IF NOT EXISTS nodes_fts_delete AFTER DELETE ON nodes BEGIN
            DELETE FROM nodes_fts WHERE id = old.id;
          END
        `
        ).run();

        console.log('   ✅ FTS5 table and triggers recreated successfully');
      } catch (ftsError: any) {
        // FTS5 recreation might fail if there are schema issues
        // Log warning but don't fail snapshot creation
        console.warn(`   ⚠️  FTS5 recreation warning: ${ftsError.message}`);
      }

      console.log('   ✅ Snapshot created successfully');
      console.log(`   Location: ${this.snapshotPath}`);
      console.log(`   Size: ${this.getFileSize(this.snapshotPath)}`);
      console.log(
        `   Contents: 4 accounts (1 test + 3 fixtures), 4 users, 1 session (test user only), 0 nodes, 0 edges`
      );

      // Close the database
      db.close();

      // CRITICAL FIX: Create separate jobs database for test mode
      // This avoids SQLite locking conflicts when jobs are created inside SAVEPOINT transactions
      console.log('\n📁 Creating separate jobs database template...');

      // Delete old jobs snapshot if exists
      if (fs.existsSync(this.jobsSnapshotPath)) {
        fs.unlinkSync(this.jobsSnapshotPath);
        console.log('   Deleted old jobs snapshot');
      }

      // Create jobs database
      const jobsDb = new Database(this.jobsSnapshotPath);

      // Load jobs schema
      const jobsSchemaPath = path.join(process.cwd(), 'packages/db/src/sqlite/jobs-schema.sql');
      if (!fs.existsSync(jobsSchemaPath)) {
        throw new Error(`Jobs schema file not found: ${jobsSchemaPath}`);
      }

      const jobsSchemaSQL = fs.readFileSync(jobsSchemaPath, 'utf-8');

      // Execute jobs schema
      console.log('   Executing jobs schema...');
      jobsDb.exec(jobsSchemaSQL);

      // Verify jobs database has expected structure
      const jobsTableCount = jobsDb
        .prepare(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name IN ('jobs', 'job_events', 'job_items')"
        )
        .get() as any;

      if (jobsTableCount.count !== 3) {
        throw new Error(
          `Jobs database has unexpected structure! Expected 3 tables (jobs, job_events, job_items), got ${jobsTableCount.count}`
        );
      }

      console.log('   ✅ Jobs snapshot created successfully');
      console.log(`   Location: ${this.jobsSnapshotPath}`);
      console.log(`   Size: ${this.getFileSize(this.jobsSnapshotPath)}`);
      console.log(`   Contents: 3 tables (jobs, job_events, job_items), 0 jobs`);

      // Close jobs database
      jobsDb.close();
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
   * CRITICAL FIX #5: Windows file locking retry logic
   * - On Windows, SQLite files may be locked by API server's cached connections
   * - Retry deletion with exponential backoff to handle transient locks
   * - Handles EBUSY errors gracefully
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

    // CRITICAL FIX #5: Helper to delete file with retry logic for Windows file locking
    const deleteFileWithRetry = async (filePath: string, maxRetries = 3): Promise<void> => {
      if (!fs.existsSync(filePath)) {
        return; // File doesn't exist, nothing to delete
      }

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          fs.unlinkSync(filePath);
          console.log(
            `[Worker ${workerIndex}] ✅ Deleted ${path.basename(filePath)} (attempt ${attempt})`
          );
          return; // Success!
        } catch (error: any) {
          if (error.code === 'EBUSY' || error.code === 'EPERM') {
            if (attempt === maxRetries) {
              console.warn(
                `[Worker ${workerIndex}] ⚠️  Failed to delete ${path.basename(filePath)} after ${maxRetries} attempts (file locked)`
              );
              throw error; // Give up after max retries
            }

            // Wait with exponential backoff before retry
            const delayMs = 50 * Math.pow(2, attempt - 1); // 50ms, 100ms, 200ms
            console.log(
              `[Worker ${workerIndex}] ⏳ File locked, retrying in ${delayMs}ms... (attempt ${attempt}/${maxRetries})`
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          } else {
            // Different error - throw immediately
            throw error;
          }
        }
      }
    };

    // Delete old worker DB if exists (with retry for Windows)
    await deleteFileWithRetry(workerDbPath);

    // Also delete WAL and SHM files (with retry for Windows)
    await deleteFileWithRetry(`${workerDbPath}-wal`);
    await deleteFileWithRetry(`${workerDbPath}-shm`);

    // CRITICAL FIX: Also delete jobs database files
    const dir = path.dirname(workerDbPath);
    const ext = path.extname(workerDbPath);
    const name = path.basename(workerDbPath, ext);
    const jobsDbPath = path.join(dir, `${name}-jobs${ext}`);
    await deleteFileWithRetry(jobsDbPath);
    await deleteFileWithRetry(`${jobsDbPath}-wal`);
    await deleteFileWithRetry(`${jobsDbPath}-shm`);

    // Copy data snapshot to worker DB
    fs.copyFileSync(this.snapshotPath, workerDbPath);

    // CRITICAL FIX: Also copy jobs snapshot to worker jobs DB
    fs.copyFileSync(this.jobsSnapshotPath, jobsDbPath);

    console.log(
      `[Worker ${workerIndex}] Restored databases from snapshots:\n` +
        `                       - Data DB: ${this.getFileSize(workerDbPath)}\n` +
        `                       - Jobs DB: ${this.getFileSize(jobsDbPath)}`
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
