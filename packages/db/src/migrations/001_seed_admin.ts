import { randomUUID } from 'crypto';
import { SQLiteClient } from '../sqlite/client';

/**
 * Migration 001: Seed Admin Account
 *
 * Creates the system admin account and admin user.
 * The admin account owns all existing data in the system.
 *
 * Admin credentials:
 * - Email: admin@admin.com
 * - Password: any (all passwords accepted for admin user)
 */
export async function seedAdminAccount(client: SQLiteClient): Promise<void> {
  const db = client.getDatabase();
  const now = Date.now();

  console.log('🌱 Running migration 001: Seed Admin Account');

  try {
    // Check if admin account already exists
    const existingAccount = db
      .prepare('SELECT id FROM accounts WHERE account_type = ?')
      .get('admin') as any;

    if (existingAccount) {
      console.log('⏭️  Admin account already exists, skipping migration');
      return;
    }

    // Begin transaction
    const transaction = db.transaction(() => {
      // 1. Create admin account
      const adminAccountId = randomUUID();
      db.prepare(`
        INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        adminAccountId,
        'admin',
        'business', // Admin gets business tier features
        'admin@canvas-memory.com',
        'System Admin',
        now,
        now
      );

      console.log(`✅ Created admin account: ${adminAccountId}`);

      // 2. Create admin user
      const adminUserId = randomUUID();
      db.prepare(`
        INSERT INTO users (id, account_id, email, password_hash, google_id, name, permission_level, user_class, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        adminUserId,
        adminAccountId,
        'admin@admin.com',
        null, // No password hash - special handling in auth service
        null, // No Google ID
        'Admin',
        'admin',
        'person',
        1,
        now,
        now
      );

      console.log(`✅ Created admin user: ${adminUserId}`);

      // 3. Migrate existing nodes to admin account
      const nodeCount = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as any;

      if (nodeCount.count > 0) {
        // Check if nodes already have account_id column (schema already updated)
        const tableInfo = db.prepare('PRAGMA table_info(nodes)').all() as any[];
        const hasAccountId = tableInfo.some((col: any) => col.name === 'account_id');

        if (hasAccountId) {
          // Update existing nodes - set account_id and created_by to admin
          db.prepare(`
            UPDATE nodes
            SET account_id = ?, created_by = ?
            WHERE account_id IS NULL OR account_id = ''
          `).run(adminAccountId, adminUserId);

          console.log(`✅ Migrated ${nodeCount.count} nodes to admin account`);
        } else {
          console.log('⚠️  Nodes table does not have account_id column yet - will be added by schema update');
        }
      }

      // 4. Migrate existing edges to admin account
      const edgeCount = db.prepare('SELECT COUNT(*) as count FROM edges').get() as any;

      if (edgeCount.count > 0) {
        // Check if edges already have account_id column
        const tableInfo = db.prepare('PRAGMA table_info(edges)').all() as any[];
        const hasAccountId = tableInfo.some((col: any) => col.name === 'account_id');

        if (hasAccountId) {
          // Update existing edges
          db.prepare(`
            UPDATE edges
            SET account_id = ?, created_by = ?
            WHERE account_id IS NULL OR account_id = ''
          `).run(adminAccountId, adminUserId);

          console.log(`✅ Migrated ${edgeCount.count} edges to admin account`);
        } else {
          console.log('⚠️  Edges table does not have account_id column yet - will be added by schema update');
        }
      }

      // 5. Update schema metadata
      db.prepare(`
        INSERT OR REPLACE INTO schema_metadata (key, value)
        VALUES ('migration_001', datetime('now'))
      `).run();
    });

    // Execute transaction
    transaction();

    console.log('✅ Migration 001 completed successfully');
  } catch (error) {
    console.error('❌ Migration 001 failed:', error);
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
    await seedAdminAccount(client);
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await client.disconnect();
  }
}

// Allow running directly with: npx tsx src/migrations/001_seed_admin.ts
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
