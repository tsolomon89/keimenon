
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Paths to check
const homeDir = os.homedir();
const possiblePaths = [
  path.join(homeDir, '.canvas-memory', 'canvas.db'),
  path.join(homeDir, '.keimenon', 'keimenon.db'),
];

async function seed() {
  const passwordHash = await bcrypt.hash('admin123', 10);
  const devPassHash = await bcrypt.hash('DevPass123!', 10);
  const now = Date.now();

  for (const dbPath of possiblePaths) {
    if (!fs.existsSync(dbPath)) {
      console.log(`Skipping missing DB: ${dbPath}`);
      continue;
    }

    console.log(`\nSeeding DB: ${dbPath}`);
    try {
      const db = new Database(dbPath);

      // 1. Seed Admin
      const existingAdmin = db.prepare("SELECT * FROM users WHERE email = 'admin@admin.com'").get();
      if (!existingAdmin) {
        const adminWait = db.prepare("INSERT INTO users (id, email, password_hash, name, permission_level, user_class, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        adminWait.run('seed-admin-id', 'admin@admin.com', passwordHash, 'Admin', 'admin', 'person', 1, now, now);
        console.log('✅ Created admin@admin.com / admin123');
        
        // Account linkage (simplified)
        const accountId = 'seed-admin-account';
        const existAcc = db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId);
        if (!existAcc) {
            db.prepare("INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(accountId, 'admin', 'business', 'admin@keimenon.com', 'Admin Account', now, now);
        }
        db.prepare("INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, status, joined_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run('seed-link-admin', 'seed-admin-id', accountId, 'admin', 1, 'active', now, now, now);
      } else {
        console.log('ℹ️ Admin user already exists. Updating password...');
        db.prepare("UPDATE users SET password_hash = ? WHERE email = 'admin@admin.com'").run(passwordHash);
        console.log('✅ Admin password reset to admin123');
      }

      // 2. Seed Dev
      const existingDev = db.prepare("SELECT * FROM users WHERE email = 'dev@keimenon.local'").get();
      if (!existingDev) {
        db.prepare("INSERT INTO users (id, email, password_hash, name, permission_level, user_class, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run('seed-dev-id', 'dev@keimenon.local', devPassHash, 'Developer', 'admin', 'person', 1, now, now);
        console.log('✅ Created dev@keimenon.local / DevPass123!');
        
        // Account linkage
        const devAccountId = 'seed-dev-account';
         const existDevAcc = db.prepare("SELECT * FROM accounts WHERE id = ?").get(devAccountId);
        if (!existDevAcc) {
             db.prepare("INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(devAccountId, 'admin', 'business', 'dev@keimenon.local', 'Dev Account', now, now);
        }
        db.prepare("INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, status, joined_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run('seed-link-dev', 'seed-dev-id', devAccountId, 'admin', 1, 'active', now, now, now);
      } else {
        console.log('ℹ️ Dev user already exists. Updating password...');
        db.prepare("UPDATE users SET password_hash = ? WHERE email = 'dev@keimenon.local'").run(devPassHash);
         console.log('✅ Dev password reset to DevPass123!');
      }

    } catch (e: any) {
      console.error(`❌ Error seeding ${dbPath}:`, e.message);
    }
  }
}

seed();
