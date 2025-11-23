/**
 * Test FTS5 Availability in better-sqlite3
 *
 * This script verifies that FTS5 is compiled into the better-sqlite3 package
 * used by this project.
 */

import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';

const testDbPath = './test-fts5-check.db';

// Clean up if exists
if (existsSync(testDbPath)) {
  unlinkSync(testDbPath);
}

try {
  console.log('🔍 Testing FTS5 availability in better-sqlite3...\n');

  const db = new Database(testDbPath);

  // 1. Check compile options
  console.log('1. Checking SQLite compile options:');
  const compileOptions = db.pragma('compile_options');
  const ftsOptions = compileOptions.filter(opt =>
    opt.compile_options.includes('FTS')
  );

  if (ftsOptions.length > 0) {
    console.log('   ✅ FTS-related compile options found:');
    ftsOptions.forEach(opt => console.log(`      - ${opt.compile_options}`));
  } else {
    console.log('   ⚠️  No FTS-related compile options shown');
  }

  // 2. Check SQLite version
  console.log('\n2. SQLite version:');
  const version = db.prepare('SELECT sqlite_version() as version').get();
  console.log(`   📦 SQLite version: ${version.version}`);

  // 3. Try to create FTS5 table with trigram
  console.log('\n3. Testing FTS5 table creation with trigram tokenizer:');
  try {
    db.exec(`
      CREATE VIRTUAL TABLE test_fts5 USING fts5(
        content,
        tokenize = 'trigram'
      );
    `);
    console.log('   ✅ FTS5 table with trigram tokenizer created successfully!');

    // 4. Test FTS5 operations
    console.log('\n4. Testing FTS5 operations:');
    db.prepare('INSERT INTO test_fts5(content) VALUES (?)').run('hello world');
    db.prepare('INSERT INTO test_fts5(content) VALUES (?)').run('hello there');
    db.prepare('INSERT INTO test_fts5(content) VALUES (?)').run('goodbye world');

    const results = db.prepare(`
      SELECT content, rank
      FROM test_fts5
      WHERE content MATCH 'hello'
      ORDER BY rank
    `).all();

    console.log(`   ✅ FTS5 search works! Found ${results.length} matches:`);
    results.forEach((row, i) => {
      console.log(`      ${i + 1}. "${row.content}" (rank: ${row.rank})`);
    });

    // 5. Test FTS5 with UNINDEXED columns (like our migration uses)
    console.log('\n5. Testing FTS5 with UNINDEXED columns:');
    db.exec(`
      CREATE VIRTUAL TABLE test_fts5_advanced USING fts5(
        node_id UNINDEXED,
        content,
        account_id UNINDEXED,
        tokenize = 'trigram'
      );
    `);
    console.log('   ✅ FTS5 with UNINDEXED columns created successfully!');

    db.prepare('INSERT INTO test_fts5_advanced(node_id, content, account_id) VALUES (?, ?, ?)').run('node_1', 'test message', 'acc_1');
    const advResults = db.prepare('SELECT * FROM test_fts5_advanced WHERE content MATCH ?').all('test');
    console.log(`   ✅ FTS5 advanced search works! Found ${advResults.length} match(es)`);

    console.log('\n✅ RESULT: FTS5 is FULLY AVAILABLE and WORKING in better-sqlite3!');
    console.log('✅ Migration 022_add_fts5_duplicate_detection.sql should work perfectly.\n');

  } catch (ftsError) {
    console.log(`   ❌ FTS5 table creation failed: ${ftsError.message}`);
    console.log('\n❌ RESULT: FTS5 is NOT available in better-sqlite3');
    console.log('   This is unexpected for better-sqlite3 v12.4.1');
    console.log('   You may need to rebuild better-sqlite3 with FTS5 enabled.\n');
  }

  db.close();

  // Clean up test database
  if (existsSync(testDbPath)) {
    unlinkSync(testDbPath);
  }

} catch (error) {
  console.error('❌ Fatal error:', error.message);
  console.error(error.stack);

  // Clean up on error
  if (existsSync(testDbPath)) {
    unlinkSync(testDbPath);
  }

  process.exit(1);
}
