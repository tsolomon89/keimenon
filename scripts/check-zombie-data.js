#!/usr/bin/env node

/**
 * Zombie Data Detection Script
 *
 * Scans test databases for leftover data after test runs.
 * Should be run after E2E tests complete to verify cleanup worked.
 *
 * Usage:
 *   node scripts/check-zombie-data.js
 *   npm run check-zombie-data  (if added to package.json)
 *
 * Exit codes:
 *   0 = No zombie data found (success)
 *   1 = Zombie data detected (failure)
 *   2 = Script error
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const TEST_DBS_DIR = path.join(process.cwd(), '.test-dbs');
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

/**
 * Tables to check for zombie data
 * Each table should have zero records with data_tag='test' after cleanup
 */
const TABLES_TO_CHECK = [
  'sessions',
  'login_attempts',
  'jobs',
  'job_events',
  'job_items',
  'nodes',
  'edges',
  'settings_config',
  'settings_changes',
];

/**
 * Check a single database for zombie data
 */
function checkDatabase(dbPath) {
  const dbName = path.basename(dbPath);
  console.log(`\nChecking ${dbName}...`);

  const db = new Database(dbPath, { readonly: true });
  const zombieCounts = {};
  let totalZombies = 0;
  const errors = [];

  try {
    for (const table of TABLES_TO_CHECK) {
      try {
        // Check for test data
        const result = db
          .prepare(`SELECT COUNT(*) as count FROM ${table} WHERE data_tag = 'test'`)
          .get();
        const count = result.count;
        zombieCounts[table] = count;
        totalZombies += count;

        if (count > 0) {
          console.log(`  ${RED}❌ ${table}: ${count} zombie records${RESET}`);
        } else {
          console.log(`  ${GREEN}✅ ${table}: clean${RESET}`);
        }
      } catch (error) {
        // Table might not have data_tag column (migration not run)
        if (error.message.includes('no such column: data_tag')) {
          console.log(
            `  ${YELLOW}⚠️  ${table}: data_tag column missing (migration pending?)${RESET}`
          );
          errors.push(`${table}: missing data_tag column`);
        } else {
          console.log(`  ${RED}❌ ${table}: error - ${error.message}${RESET}`);
          errors.push(`${table}: ${error.message}`);
        }
      }
    }

    // Additional checks for tables without data_tag (shouldn't have any records at all in tests)
    try {
      const allSessionsCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get().count;
      if (allSessionsCount > 0) {
        console.log(`\n  ${YELLOW}⚠️  Total sessions (all tags): ${allSessionsCount}${RESET}`);
      }
    } catch (error) {
      // Ignore if table doesn't exist
    }
  } finally {
    db.close();
  }

  return { totalZombies, errors, zombieCounts };
}

/**
 * Main function
 */
function main() {
  console.log('🔍 Checking for zombie test data...\n');

  // Check if .test-dbs directory exists
  if (!fs.existsSync(TEST_DBS_DIR)) {
    console.log(`${YELLOW}⚠️  No .test-dbs directory found${RESET}`);
    console.log("This might be normal if tests haven't run yet.");
    process.exit(0);
  }

  // Find all worker databases
  const dbFiles = fs
    .readdirSync(TEST_DBS_DIR)
    .filter((file) => file.endsWith('.db') && file.startsWith('worker-'))
    .map((file) => path.join(TEST_DBS_DIR, file));

  if (dbFiles.length === 0) {
    console.log(`${YELLOW}⚠️  No worker databases found in ${TEST_DBS_DIR}${RESET}`);
    console.log("This might be normal if tests haven't run yet.");
    process.exit(0);
  }

  console.log(`Found ${dbFiles.length} worker database(s)\n`);

  let hasZombies = false;
  let hasErrors = false;
  const allResults = [];

  // Check each database
  for (const dbPath of dbFiles) {
    const result = checkDatabase(dbPath);
    allResults.push({ dbPath, ...result });

    if (result.totalZombies > 0) {
      hasZombies = true;
    }
    if (result.errors.length > 0) {
      hasErrors = true;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const totalZombiesAllDbs = allResults.reduce((sum, r) => sum + r.totalZombies, 0);

  if (totalZombiesAllDbs === 0 && !hasErrors) {
    console.log(`\n${GREEN}✅ No zombie data found! All test databases are clean.${RESET}`);
    process.exit(0);
  } else if (hasZombies) {
    console.log(`\n${RED}❌ ZOMBIE DATA DETECTED!${RESET}`);
    console.log(`\nTotal zombie records across all databases: ${RED}${totalZombiesAllDbs}${RESET}`);

    // Show detailed breakdown
    console.log('\nDetails by database:');
    for (const result of allResults) {
      if (result.totalZombies > 0) {
        console.log(`\n  ${path.basename(result.dbPath)}: ${result.totalZombies} zombies`);
        for (const [table, count] of Object.entries(result.zombieCounts)) {
          if (count > 0) {
            console.log(`    - ${table}: ${count}`);
          }
        }
      }
    }

    console.log('\n' + RED + '⚠️  This indicates savepoint cleanup failed or was skipped.' + RESET);
    console.log('Possible causes:');
    console.log('  1. Test isolation middleware not applied (check apps/api/src/index.ts)');
    console.log('  2. Savepoint API endpoints not working (check /api/v1/test/savepoint)');
    console.log('  3. Test fixture not wrapping tests in savepoints (check test-isolation.ts)');
    console.log('  4. Migration 018 not run (data_tag columns missing)');

    process.exit(1);
  } else if (hasErrors) {
    console.log(`\n${YELLOW}⚠️  Errors encountered during check${RESET}`);
    console.log('Most likely: migration 018 (add data_tag to all tables) has not been run.');
    console.log('\nRun migrations with:');
    console.log('  npm run migrate  (or equivalent migration command)');

    process.exit(2);
  }
}

// Run the script
try {
  main();
} catch (error) {
  console.error(`\n${RED}❌ Script error:${RESET}`, error.message);
  console.error(error.stack);
  process.exit(2);
}
