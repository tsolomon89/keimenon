#!/usr/bin/env node
/**
 * Clear Account Lockouts Script
 *
 * Removes all failed login attempts from the database.
 * Use this to reset lockouts during development or after fixing lockout issues.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Determine database path
const DB_PATH =
  process.env.DB_PATH ||
  path.join(process.env.HOME || process.env.USERPROFILE, '.canvas-memory', 'canvas.db');

console.log('🔓 Clearing Account Lockouts...\n');
console.log(`📂 Database: ${DB_PATH}\n`);

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Database not found at:', DB_PATH);
  console.error('   Set DB_PATH environment variable to specify location');
  process.exit(1);
}

try {
  const db = new Database(DB_PATH);

  // Count existing lockout records
  const countResult = db
    .prepare('SELECT COUNT(*) as count FROM login_attempts WHERE success = 0')
    .get();
  console.log(`📊 Found ${countResult.count} failed login attempts\n`);

  if (countResult.count === 0) {
    console.log('✅ No lockouts to clear - database is clean!');
    db.close();
    process.exit(0);
  }

  // Delete all failed login attempts
  const result = db.prepare('DELETE FROM login_attempts WHERE success = 0').run();
  console.log(`✅ Cleared ${result.changes} failed login attempts`);
  console.log('✅ All accounts unlocked!\n');

  db.close();
} catch (error) {
  console.error('❌ Error clearing lockouts:', error.message);
  process.exit(1);
}
