/**
 * Factory Reset Script
 *
 * Wipes ALL data from the system and resets to a clean state with
 * a fresh Admin account.
 *
 * WARNING: THIS DELETES ALL DATA.
 *
 * Usage: npx tsx apps/api/src/scripts/factory-reset.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

// Configuration
const DB_PATH = process.env.SQLITE_PATH || process.env.DB_PATH || 'C:\\Users\\Audna\\.canvas-memory\\canvas.db';

async function main() {
  console.log('🏭 FACTORY RESET INITIATED');
  console.log(`📂 Database: ${DB_PATH}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ Database file not found at ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  try {
    // 1. Wipe Data
    console.log('🧹 Wiping data...');
    
    // Disable Foreign Keys to allow wiping cyclic dependencies
    db.pragma('foreign_keys = OFF');

    // Get list of all tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row: any) => row.name);
    console.log('   Found tables:', tables.join(', '));

    const targetTables = [
        'job_events', 'jobs', 
        'edges', 'nodes', 
        'sessions', 'user_accounts', 'users', 'accounts', 
        'account_links'
    ];

    // Use transaction for consistency
    const wipeTransaction = db.transaction(() => {
        for (const table of targetTables) {
            if (tables.includes(table)) {
                try {
                    db.prepare(`DELETE FROM ${table}`).run();
                    console.log(`   ✓ ${table} cleared`);
                } catch (err: any) {
                     console.error(`   ❌ Failed to clear ${table}: ${err.message}`);
                     throw err;
                }
            } else {
                console.log(`   - ${table} not found (skipping)`);
            }
        }
    });

    wipeTransaction();
    console.log('✨ Data wipe complete.');

    // 2. Reseed Admin
    console.log('🌱 Reseeding Admin Account...');
    
    const now = Date.now();
    const passwordHash = await bcrypt.hash('admin123', 12);
    const adminAccountId = '00000000-0000-0000-0000-000000000001'; // Fixed ID for easier debugging
    const adminUserId = '00000000-0000-0000-0000-000000000002'; // Fixed ID

    const seedTransaction = db.transaction(() => {
        // Create Admin Account
        db.prepare(`
            INSERT INTO accounts (id, account_type, account_class, email, name, owner_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            adminAccountId,
            'admin',
            'business',
            'admin@keimenon.com',
            'System Admin',
            adminUserId,
            now,
            now
        );

        // Create Admin User
        db.prepare(`
            INSERT INTO users (id, email, password_hash, name, permission_level, user_class, is_active, primary_account_id, last_login_account_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
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

        // Link User to Account
        const membershipId = randomUUID();
        db.prepare(`
            INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, status, joined_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            membershipId,
            adminUserId,
            adminAccountId,
            'admin',
            4,
            'active',
            now,
            now,
            now
        );

        // Update Account Owner
        db.prepare('UPDATE accounts SET owner_user_id = ? WHERE id = ?').run(adminUserId, adminAccountId);
        
        // Update Schema Metadata if table exists
        try {
            db.prepare(`
                INSERT OR REPLACE INTO schema_metadata (key, value)
                VALUES ('last_factory_reset', datetime('now'))
            `).run();
        } catch (e) {
            // Ignore if table doesn't exist
        }
    });

    seedTransaction();

    console.log('✅ Admin Account Restored');
    console.log('   Email: admin@admin.com');
    console.log('   Password: admin123');
    console.log('   Account ID: ' + adminAccountId);
    
  } catch (error) {
    console.error('❌ Factory Reset Failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
