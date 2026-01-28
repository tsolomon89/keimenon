#!/usr/bin/env node

/**
 * E2E Test Data Cleanup Script
 *
 * Clears test-related data to ensure tests start with a clean state:
 * 1. Clears login_attempts from main database (fixes account lockout)
 * 2. Deletes all worker databases (.test-dbs/worker-*.db)
 * 3. Deletes snapshot template (.test-dbs/snapshot-template.db)
 *
 * Usage:
 *   npm run e2e:clean
 *   node scripts/cleanup-test-data.js
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { killPorts } = require('./kill-port');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function main() {
  log('\n🧹 E2E Test Data Cleanup', colors.blue);
  log('================================\n', colors.blue);

  let cleaned = {
    portsKilled: false,
    loginAttempts: 0,
    workerDatabases: 0,
    snapshotDeleted: false,
  };

  // 0. Kill ports to ensure no zombie processes
  try {
    log('🔌 Killing ports 3000 and 4001...', colors.cyan);
    await killPorts([3000, 4001], { force: true });
    cleaned.portsKilled = true;
    log('   ✅ Ports killed successfully', colors.green);
  } catch (error) {
    log(`   ⚠️  Warning: ${error.message}`, colors.yellow);
  }

  // 1. Clear login_attempts from main database
  const mainDbPath = path.join(
    process.env.USERPROFILE || process.env.HOME,
    '.keimenon',
    'keimenon.db'
  );

  if (fs.existsSync(mainDbPath)) {
    try {
      log('📊 Clearing login_attempts from main database...', colors.cyan);
      const db = new Database(mainDbPath);

      const result = db.prepare('DELETE FROM login_attempts').run();
      cleaned.loginAttempts = result.changes;

      db.close();
      log(`   ✅ Cleared ${cleaned.loginAttempts} login attempt records`, colors.green);
    } catch (error) {
      log(`   ⚠️  Warning: ${error.message}`, colors.yellow);
    }
  } else {
    log(
      '   ℹ️  Main database not found (this is OK if running tests for first time)',
      colors.yellow
    );
  }

  // 2. Delete all worker databases
  const testDbsDir = path.join(process.cwd(), '.test-dbs');

  if (fs.existsSync(testDbsDir)) {
    log('\n🗑️  Deleting worker databases...', colors.cyan);

    const files = fs.readdirSync(testDbsDir);
    const workerDbs = files.filter((f) => f.startsWith('worker-') && f.endsWith('.db'));

    for (const file of workerDbs) {
      try {
        fs.unlinkSync(path.join(testDbsDir, file));
        cleaned.workerDatabases++;
      } catch (error) {
        log(`   ⚠️  Failed to delete ${file}: ${error.message}`, colors.yellow);
      }
    }

    if (cleaned.workerDatabases > 0) {
      log(`   ✅ Deleted ${cleaned.workerDatabases} worker database(s)`, colors.green);
    } else {
      log('   ℹ️  No worker databases found', colors.yellow);
    }
  } else {
    log(
      '\n   ℹ️  .test-dbs directory not found (will be created on first test run)',
      colors.yellow
    );
  }

  // 3. Delete snapshot template
  const snapshotPath = path.join(testDbsDir, 'snapshot-template.db');

  if (fs.existsSync(snapshotPath)) {
    try {
      log('\n🗑️  Deleting snapshot template...', colors.cyan);
      fs.unlinkSync(snapshotPath);
      cleaned.snapshotDeleted = true;
      log('   ✅ Snapshot template deleted (will be recreated on next test run)', colors.green);
    } catch (error) {
      log(`   ⚠️  Failed to delete snapshot: ${error.message}`, colors.yellow);
    }
  } else {
    log('\n   ℹ️  Snapshot template not found (will be created on next test run)', colors.yellow);
  }

  // Summary
  log('\n================================', colors.blue);
  log('✨ Cleanup Complete!\n', colors.green);
  log('Summary:', colors.cyan);
  log(`  • Ports killed (3000, 4001): ${cleaned.portsKilled ? 'Yes' : 'No'}`, colors.reset);
  log(`  • Login attempts cleared: ${cleaned.loginAttempts}`, colors.reset);
  log(`  • Worker databases deleted: ${cleaned.workerDatabases}`, colors.reset);
  log(`  • Snapshot template deleted: ${cleaned.snapshotDeleted ? 'Yes' : 'No'}`, colors.reset);
  log('\nYou can now run your E2E tests with a clean state:', colors.cyan);
  log('  npm run e2e:dev', colors.reset);
  log('  npm run e2e -- tests/e2e/boards-crud-operations.spec.ts\n', colors.reset);
}

main().catch((error) => {
  log(`\n❌ Error: ${error.message}`, colors.red);
  process.exit(1);
});
