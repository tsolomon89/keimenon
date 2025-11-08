#!/usr/bin/env node
/**
 * Unlock Specific Account Script
 *
 * Usage: node scripts/unlock-account.js email@example.com
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const email = process.argv[2];

if (!email) {
  console.error('❌ Usage: node scripts/unlock-account.js <email>');
  process.exit(1);
}

const DB_PATH =
  process.env.DB_PATH ||
  path.join(process.env.HOME || process.env.USERPROFILE, '.canvas-memory', 'canvas.db');

console.log(`🔓 Unlocking account: ${email}\n`);
console.log(`📂 Database: ${DB_PATH}\n`);

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Database not found at:', DB_PATH);
  process.exit(1);
}

try {
  const db = new Database(DB_PATH);

  // Count failed attempts for this email
  const countResult = db
    .prepare('SELECT COUNT(*) as count FROM login_attempts WHERE email = ? AND success = 0')
    .get(email);

  if (countResult.count === 0) {
    console.log(`✅ No lockouts found for ${email}`);
    db.close();
    process.exit(0);
  }

  console.log(`📊 Found ${countResult.count} failed attempts for ${email}`);

  // Clear failed attempts
  const result = db
    .prepare('DELETE FROM login_attempts WHERE email = ? AND success = 0')
    .run(email);

  console.log(`✅ Unlocked ${email} (cleared ${result.changes} attempts)\n`);

  db.close();
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
