import { randomUUID } from 'crypto';
import { SQLiteClient } from '../sqlite/client';

/**
 * Migration 002: Admin Nested Mode & Cross-Tenant Access
 *
 * Adds support for:
 * - Admin accounts viewing/operating within client accounts (nested portal/CRM)
 * - Rank-based permission hierarchy (1=junior, 2=senior, 3=leader, 4=admin)
 * - Per-user capability overrides
 * - Account linking (admin ↔ client relationships)
 * - Audit logging for privileged actions
 * - Service mode flag (debug accounts)
 */
export async function migration002AdminNestedMode(client: SQLiteClient): Promise<void> {
  const db = client.getDatabase();
  const now = Date.now();

  console.log('🌱 Running migration 002: Admin Nested Mode');

  try {
    // Check if migration already ran
    const migrationCheck = db
      .prepare("SELECT value FROM schema_metadata WHERE key = 'migration_002'")
      .get() as any;

    if (migrationCheck) {
      console.log('⏭️  Migration 002 already completed, skipping');
      return;
    }

    // Begin transaction
    const transaction = db.transaction(() => {
      // ====================================================================
      // STEP 1: Extend accounts table
      // ====================================================================
      console.log('📋 Step 1: Extending accounts table...');

      // Check if columns already exist
      const accountsInfo = db.prepare('PRAGMA table_info(accounts)').all() as any[];

      if (!accountsInfo.some((col: any) => col.name === 'mode_service')) {
        db.prepare('ALTER TABLE accounts ADD COLUMN mode_service INTEGER DEFAULT 0').run();
        console.log('  ✅ Added mode_service column');
      }

      if (!accountsInfo.some((col: any) => col.name === 'parent_account_id')) {
        db.prepare('ALTER TABLE accounts ADD COLUMN parent_account_id TEXT').run();
        console.log('  ✅ Added parent_account_id column');
      }

      if (!accountsInfo.some((col: any) => col.name === 'membership')) {
        db.prepare(`ALTER TABLE accounts ADD COLUMN membership TEXT DEFAULT 'free'`).run();
        console.log('  ✅ Added membership column');
      }

      if (!accountsInfo.some((col: any) => col.name === 'created_by')) {
        db.prepare('ALTER TABLE accounts ADD COLUMN created_by TEXT').run();
        console.log('  ✅ Added created_by column');
      }

      // Create indexes
      try {
        db.prepare('CREATE INDEX IF NOT EXISTS idx_accounts_mode_service ON accounts(mode_service)').run();
        db.prepare('CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_account_id)').run();
        db.prepare('CREATE INDEX IF NOT EXISTS idx_accounts_membership ON accounts(membership)').run();
        console.log('  ✅ Created indexes on accounts');
      } catch (e) {
        console.log('  ⚠️  Indexes may already exist');
      }

      // ====================================================================
      // STEP 2: Extend users table
      // ====================================================================
      console.log('📋 Step 2: Extending users table...');

      const usersInfo = db.prepare('PRAGMA table_info(users)').all() as any[];

      if (!usersInfo.some((col: any) => col.name === 'rank')) {
        db.prepare('ALTER TABLE users ADD COLUMN rank INTEGER DEFAULT 1').run();
        console.log('  ✅ Added rank column');
      }

      if (!usersInfo.some((col: any) => col.name === 'overrides')) {
        db.prepare('ALTER TABLE users ADD COLUMN overrides TEXT').run();
        console.log('  ✅ Added overrides column');
      }

      // Create index
      try {
        db.prepare('CREATE INDEX IF NOT EXISTS idx_users_rank ON users(rank)').run();
        console.log('  ✅ Created index on users');
      } catch (e) {
        console.log('  ⚠️  Index may already exist');
      }

      // ====================================================================
      // STEP 3: Create account_links table
      // ====================================================================
      console.log('📋 Step 3: Creating account_links table...');

      db.prepare(`
        CREATE TABLE IF NOT EXISTS account_links (
          id TEXT PRIMARY KEY,
          admin_account_id TEXT NOT NULL,
          client_account_id TEXT NOT NULL,
          linked_at INTEGER NOT NULL,
          linked_by TEXT NOT NULL,
          notes TEXT,
          FOREIGN KEY (admin_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          FOREIGN KEY (client_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          FOREIGN KEY (linked_by) REFERENCES users(id),
          UNIQUE(admin_account_id, client_account_id)
        )
      `).run();

      db.prepare('CREATE INDEX IF NOT EXISTS idx_account_links_admin ON account_links(admin_account_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_account_links_client ON account_links(client_account_id)').run();

      console.log('  ✅ Created account_links table');

      // ====================================================================
      // STEP 4: Create audit_log table
      // ====================================================================
      console.log('📋 Step 4: Creating audit_log table...');

      db.prepare(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          actor_user_id TEXT NOT NULL,
          actor_account_id TEXT NOT NULL,
          target_account_id TEXT,
          action TEXT NOT NULL,
          resource_type TEXT NOT NULL,
          resource_id TEXT,
          mode TEXT NOT NULL CHECK(mode IN ('native', 'crm', 'nested')),
          success INTEGER NOT NULL,
          reason TEXT,
          ip_address TEXT,
          user_agent TEXT,
          metadata TEXT,
          timestamp INTEGER NOT NULL,
          FOREIGN KEY (actor_user_id) REFERENCES users(id),
          FOREIGN KEY (actor_account_id) REFERENCES accounts(id),
          FOREIGN KEY (target_account_id) REFERENCES accounts(id)
        )
      `).run();

      db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_user_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_account ON audit_log(actor_account_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_account_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, resource_type)').run();

      console.log('  ✅ Created audit_log table');

      // ====================================================================
      // STEP 5: Migrate existing data - Set ranks based on permission_level
      // ====================================================================
      console.log('📋 Step 5: Setting user ranks...');

      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;

      if (userCount.count > 0) {
        // Map permission_level to rank: junior=1, senior=2, leader=3, admin=4
        db.prepare(`UPDATE users SET rank = 1 WHERE permission_level = 'junior'`).run();
        db.prepare(`UPDATE users SET rank = 2 WHERE permission_level = 'senior'`).run();
        db.prepare(`UPDATE users SET rank = 3 WHERE permission_level = 'leader'`).run();
        db.prepare(`UPDATE users SET rank = 4 WHERE permission_level = 'admin'`).run();

        console.log(`  ✅ Set ranks for ${userCount.count} users`);
      }

      // ====================================================================
      // STEP 6: Set membership field for existing accounts
      // ====================================================================
      console.log('📋 Step 6: Setting account membership tiers...');

      const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get() as any;

      if (accountCount.count > 0) {
        // Copy account_class to membership for display
        db.prepare(`UPDATE accounts SET membership = account_class`).run();
        console.log(`  ✅ Set membership for ${accountCount.count} accounts`);
      }

      // ====================================================================
      // STEP 7: Link all client accounts to admin account
      // ====================================================================
      console.log('📋 Step 7: Linking client accounts to admin...');

      // Get admin account
      const adminAccount = db
        .prepare("SELECT id FROM accounts WHERE account_type = 'admin' ORDER BY created_at LIMIT 1")
        .get() as any;

      if (adminAccount) {
        // Get admin user for linked_by
        const adminUser = db
          .prepare('SELECT id FROM users WHERE account_id = ? ORDER BY created_at LIMIT 1')
          .get(adminAccount.id) as any;

        if (adminUser) {
          // Link all client accounts
          const clientAccounts = db.prepare("SELECT id FROM accounts WHERE account_type = 'client'").all() as any[];

          for (const client of clientAccounts) {
            const linkId = randomUUID();
            db.prepare(`
              INSERT OR IGNORE INTO account_links (id, admin_account_id, client_account_id, linked_at, linked_by, notes)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(
              linkId,
              adminAccount.id,
              client.id,
              now,
              adminUser.id,
              'Auto-linked during migration 002'
            );
          }

          console.log(`  ✅ Linked ${clientAccounts.length} client accounts to admin`);
        }
      }

      // ====================================================================
      // STEP 8: Create example debug account with mode_service=true
      // ====================================================================
      console.log('📋 Step 8: Creating example debug account...');

      if (adminAccount) {
        const adminUser = db
          .prepare('SELECT id FROM users WHERE account_id = ? ORDER BY created_at LIMIT 1')
          .get(adminAccount.id) as any;

        // Check if debug account already exists
        const existingDebug = db
          .prepare("SELECT id FROM accounts WHERE name = 'Debug Playground' AND mode_service = 1")
          .get() as any;

        if (!existingDebug && adminUser) {
          // Create debug account
          const debugAccountId = randomUUID();
          db.prepare(`
            INSERT INTO accounts (id, account_type, account_class, email, name, mode_service, parent_account_id, membership, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            debugAccountId,
            'client',
            'business',
            'debug@canvas-memory.com',
            'Debug Playground',
            1, // mode_service = true
            adminAccount.id,
            'business',
            adminUser.id,
            now,
            now
          );

          // Create debug user
          const debugUserId = randomUUID();
          db.prepare(`
            INSERT INTO users (id, account_id, email, password_hash, google_id, name, permission_level, user_class, rank, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            debugUserId,
            debugAccountId,
            'debug@debug.com',
            null,
            null,
            'Debug User',
            'admin',
            'person',
            4,
            1,
            now,
            now
          );

          // Link debug account to admin
          const linkId = randomUUID();
          db.prepare(`
            INSERT INTO account_links (id, admin_account_id, client_account_id, linked_at, linked_by, notes)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            linkId,
            adminAccount.id,
            debugAccountId,
            now,
            adminUser.id,
            'Debug/playground account for testing - mode_service enabled'
          );

          console.log(`  ✅ Created debug account: ${debugAccountId}`);
        } else {
          console.log('  ⏭️  Debug account already exists');
        }
      }

      // ====================================================================
      // STEP 9: Update schema metadata
      // ====================================================================
      db.prepare(`
        INSERT OR REPLACE INTO schema_metadata (key, value)
        VALUES ('migration_002', datetime('now'))
      `).run();

      console.log('📋 Migration 002 metadata recorded');
    });

    // Execute transaction
    transaction();

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
  const client = new SQLiteClient({ databasePath });

  try {
    await client.connect();
    await migration002AdminNestedMode(client);
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await client.disconnect();
  }
}

// Allow running directly with: npx tsx src/migrations/002_admin_nested_mode.ts
if (require.main === module) {
  const dbPath = process.env.DB_PATH || './data/canvas.db';
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
