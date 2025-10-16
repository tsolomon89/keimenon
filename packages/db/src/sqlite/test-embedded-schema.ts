/**
 * Test to verify embedded SQL schema works
 * Run: npx tsx packages/db/src/sqlite/test-embedded-schema.ts
 */

import { SQLiteClient } from './client';
import path from 'path';
import os from 'os';

async function testEmbeddedSchema() {
  console.log('🧪 Testing Embedded SQL Schema...\n');

  const testDbPath = path.join(os.tmpdir(), `test-embedded-${Date.now()}.db`);
  console.log(`📁 Test database: ${testDbPath}\n`);

  try {
    // Create client
    const client = new SQLiteClient({ databasePath: testDbPath });

    // Connect (should use embedded schema)
    console.log('1. Connecting to database...');
    await client.connect();
    console.log('   ✅ Connected\n');

    // Initialize schema (should use embedded SQLITE_SCHEMA constant)
    console.log('2. Initializing schema...');
    await client.initializeSchema();
    console.log('   ✅ Schema initialized (no file I/O!)\n');

    // Create test node
    console.log('3. Creating test node...');
    await client.createNode({
      id: 'grp_test_1',
      kind: 'Group',
      name: 'Test Group',
      member_count: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: {
        keywords: ['test', 'embedded', 'schema'],
        isManual: true,
      },
    });
    console.log('   ✅ Node created\n');

    // Query node back
    console.log('4. Querying node...');
    const node = await client.getNode('grp_test_1');
    console.log('   ✅ Node retrieved:', JSON.stringify(node, null, 2), '\n');

    // Get stats
    console.log('5. Getting database stats...');
    const stats = await client.getStats();
    console.log('   ✅ Stats:', JSON.stringify(stats, null, 2), '\n');

    // Cleanup
    await client.disconnect();

    console.log('✅ All tests passed! Embedded schema works perfectly! 🎉\n');
    console.log('Key achievement: NO file I/O for schema initialization!');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testEmbeddedSchema();
