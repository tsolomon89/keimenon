/**
 * Factory Reset Script
 *
 * Clears all operational data while preserving admin account(s) and admin users
 * that belong to admin account(s). If no admin principals exist, the script
 * bootstraps a default admin account/user pair.
 *
 * Usage:
 *   npx tsx apps/api/src/scripts/factory-reset.ts
 *   SQLITE_PATH=/path/to/db npx tsx apps/api/src/scripts/factory-reset.ts
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getImportArtifactsRoot, getUploadChunksRoot } from '../utils/import-artifacts';

const DB_PATH =
  process.env.SQLITE_PATH || process.env.DB_PATH || 'C:\\Users\\Audna\\.canvas-memory\\canvas.db';

type IdRow = { id: string };
type NameRow = { name: string };
type CountRow = { count: number };

const SYSTEM_TABLES = new Set(['sqlite_sequence', 'migrations', 'schema_metadata']);
const WIPE_TABLES = [
  'job_events',
  'job_items',
  'job_change_pages',
  'jobs',
  'upload_sessions',
  'edges',
  'nodes',
  'policy_profiles',
  'sessions',
  'password_reset_tokens',
  'audit_log',
  'login_attempts',
  'settings_changes',
  'settings_config',
  'account_links',
  'user_accounts',
  'users',
  'accounts',
];

function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}

function countRows(db: Database.Database, tableName: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as
    | CountRow
    | undefined;
  return row?.count ?? 0;
}

function selectIds(db: Database.Database, sql: string): string[] {
  return (db.prepare(sql).all() as IdRow[]).map((row) => row.id);
}

function deleteAllNonAdminAccounts(db: Database.Database, adminAccountIds: string[]): void {
  if (adminAccountIds.length === 0) {
    db.prepare('DELETE FROM accounts').run();
    return;
  }
  db.prepare(`DELETE FROM accounts WHERE id NOT IN (${placeholders(adminAccountIds.length)})`).run(
    ...adminAccountIds
  );
}

function deleteAllNonAdminUsers(db: Database.Database, adminUserIds: string[]): void {
  if (adminUserIds.length === 0) {
    db.prepare('DELETE FROM users').run();
    return;
  }
  db.prepare(`DELETE FROM users WHERE id NOT IN (${placeholders(adminUserIds.length)})`).run(
    ...adminUserIds
  );
}

function keepOnlyAdminMemberships(
  db: Database.Database,
  adminAccountIds: string[],
  adminUserIds: string[]
): void {
  if (adminAccountIds.length === 0 || adminUserIds.length === 0) {
    db.prepare('DELETE FROM user_accounts').run();
    return;
  }

  const accountPlaceholders = placeholders(adminAccountIds.length);
  const userPlaceholders = placeholders(adminUserIds.length);
  db.prepare(
    `
      DELETE FROM user_accounts
      WHERE account_id NOT IN (${accountPlaceholders})
         OR user_id NOT IN (${userPlaceholders})
    `
  ).run(...adminAccountIds, ...adminUserIds);
}

async function purgeImportArtifacts(): Promise<void> {
  const roots = [getImportArtifactsRoot(), getUploadChunksRoot()];
  for (const root of roots) {
    try {
      await fsp.rm(root, { recursive: true, force: true });
      console.log(`   purged artifact root: ${root}`);
    } catch (error: any) {
      console.warn(`   failed to purge artifact root ${root}: ${error.message}`);
    }
  }
}

async function seedDefaultAdminIfMissing(db: Database.Database, now: number): Promise<void> {
  const adminAccounts = db
    .prepare(`SELECT COUNT(*) AS count FROM accounts WHERE account_type = 'admin'`)
    .get() as CountRow;
  const adminUsers = db
    .prepare(
      `
        SELECT COUNT(DISTINCT u.id) AS count
        FROM users u
        JOIN user_accounts ua ON ua.user_id = u.id
        JOIN accounts a ON a.id = ua.account_id
        WHERE a.account_type = 'admin'
      `
    )
    .get() as CountRow;

  if ((adminAccounts.count ?? 0) > 0 && (adminUsers.count ?? 0) > 0) {
    return;
  }

  const adminAccountId = '00000000-0000-0000-0000-000000000001';
  const adminUserId = '00000000-0000-0000-0000-000000000002';
  const passwordHash = await bcrypt.hash('admin123', 12);

  const seedTx = db.transaction(() => {
    db.prepare(
      `
        INSERT OR REPLACE INTO accounts (
          id, account_type, account_class, email, name, owner_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      adminAccountId,
      'admin',
      'business',
      'admin@keimenon.com',
      'System Admin',
      adminUserId,
      now,
      now
    );

    db.prepare(
      `
        INSERT OR REPLACE INTO users (
          id, email, password_hash, name, permission_level, user_class, is_active,
          primary_account_id, last_login_account_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      adminUserId,
      'admin@admin.com',
      passwordHash,
      'Admin',
      'admin',
      'person',
      1,
      adminAccountId,
      adminAccountId,
      now,
      now
    );

    db.prepare(
      `
        INSERT OR REPLACE INTO user_accounts (
          id, user_id, account_id, permission_level, role_rank, status, joined_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(randomUUID(), adminUserId, adminAccountId, 'admin', 4, 'active', now, now, now);

    db.prepare('UPDATE accounts SET owner_user_id = ? WHERE id = ?').run(
      adminUserId,
      adminAccountId
    );
  });

  seedTx();
  console.log('   bootstrapped default admin because no protected admin principal remained');
}

function updateResetMetadata(db: Database.Database, resetEpochMs: number): void {
  const resetIso = new Date(resetEpochMs).toISOString();
  db.prepare(`INSERT OR REPLACE INTO schema_metadata (key, value) VALUES (?, ?)`).run(
    'last_factory_reset',
    resetIso
  );
  db.prepare(`INSERT OR REPLACE INTO schema_metadata (key, value) VALUES (?, ?)`).run(
    'last_factory_reset_ms',
    String(resetEpochMs)
  );
  db.prepare(`INSERT OR REPLACE INTO schema_metadata (key, value) VALUES (?, ?)`).run(
    'auth_token_epoch_ms',
    String(resetEpochMs)
  );
}

async function main(): Promise<void> {
  console.log('[factory-reset] starting');
  console.log(`[factory-reset] database: ${DB_PATH}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`[factory-reset] database file not found: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  const resetEpochMs = Date.now();

  try {
    db.pragma('foreign_keys = OFF');

    const tableRows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all() as NameRow[];
    const availableTables = new Set(tableRows.map((row) => row.name));

    const tableNames = [...availableTables];
    console.log(`[factory-reset] found ${tableNames.length} tables`);

    const adminAccountIds = selectIds(db, `SELECT id FROM accounts WHERE account_type = 'admin'`);
    const adminUserIds = selectIds(
      db,
      `
        SELECT DISTINCT u.id
        FROM users u
        JOIN user_accounts ua ON ua.user_id = u.id
        JOIN accounts a ON a.id = ua.account_id
        WHERE a.account_type = 'admin'
      `
    );

    console.log(
      `[factory-reset] preserving admin principals: accounts=${adminAccountIds.length}, users=${adminUserIds.length}`
    );

    const wipeTx = db.transaction(() => {
      for (const tableName of WIPE_TABLES) {
        if (!availableTables.has(tableName)) {
          continue;
        }
        if (tableName === 'accounts' || tableName === 'users' || tableName === 'user_accounts') {
          continue;
        }
        if (SYSTEM_TABLES.has(tableName)) {
          continue;
        }
        db.prepare(`DELETE FROM ${tableName}`).run();
        console.log(`   cleared table: ${tableName}`);
      }

      keepOnlyAdminMemberships(db, adminAccountIds, adminUserIds);
      deleteAllNonAdminUsers(db, adminUserIds);
      deleteAllNonAdminAccounts(db, adminAccountIds);
    });

    wipeTx();
    await seedDefaultAdminIfMissing(db, resetEpochMs);
    updateResetMetadata(db, resetEpochMs);

    const finalAdminAccounts = (
      db
        .prepare(`SELECT COUNT(*) AS count FROM accounts WHERE account_type = 'admin'`)
        .get() as CountRow
    ).count;
    const finalUsers = countRows(db, 'users');
    const finalAccounts = countRows(db, 'accounts');
    const finalJobs = countRows(db, 'jobs');
    const finalNodes = countRows(db, 'nodes');

    console.log('[factory-reset] summary');
    console.log(`   accounts remaining: ${finalAccounts}`);
    console.log(`   users remaining: ${finalUsers}`);
    console.log(`   admin accounts remaining: ${finalAdminAccounts}`);
    console.log(`   jobs remaining: ${finalJobs}`);
    console.log(`   nodes remaining: ${finalNodes}`);

    await purgeImportArtifacts();
    console.log('[factory-reset] complete');
  } catch (error: any) {
    console.error(`[factory-reset] failed: ${error.message}`);
    process.exit(1);
  } finally {
    try {
      db.pragma('foreign_keys = ON');
    } catch {
      // ignore
    }
    db.close();
  }
}

main();
