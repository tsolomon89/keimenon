/**
 * Simple test script to verify SQLite setup
 * Run with: npx tsx packages/db/src/sqlite/test-sqlite.ts
 */

import { SQLiteClient } from './client';
import { SourceNode, GroupNode, ContainsEdge } from '@canvas-memory/types';
import path from 'path';
import os from 'os';

async function testSQLite() {
  console.log('🧪 Testing SQLite setup...\n');

  // Create client with test database
  const testDbPath = path.join(os.tmpdir(), 'test-sqlite.db');
  console.log(`📁 Test database: ${testDbPath}\n`);

  const client = new SQLiteClient({
    databasePath: testDbPath,
    verbose: false,
  });

  try {
    // Connect
    await client.connect();
    console.log('✅ Connection successful\n');

    // Create a source node
    const source: SourceNode = {
      id: 'src_test_123',
      kind: 'Source',
      fingerprint: 'test_fingerprint',
      mime_type: 'text/markdown',
      size_bytes: 1024,
      title: 'Test Source',
      created_at: Date.now(),
      updated_at: Date.now(),
      provenance: {
        origin: 'test',
        attested: false,
      },
    };

    await client.createNode(source);
    console.log('✅ Created source node');

    // Create a group node
    const group: GroupNode = {
      id: 'grp_test_456',
      kind: 'Group',
      name: 'Test Group',
      purpose: 'Testing',
      member_count: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    await client.createNode(group);
    console.log('✅ Created group node');

    // Create a CONTAINS edge
    const edge: ContainsEdge = {
      id: 'edge_test_789',
      kind: 'CONTAINS',
      from: group.id,
      to: source.id,
      created_at: Date.now(),
    };

    await client.createEdge(edge);
    console.log('✅ Created CONTAINS edge\n');

    // Query back
    const retrievedSource = await client.getNode(source.id);
    console.log('📖 Retrieved source:', retrievedSource?.id);

    const retrievedGroup = await client.getNode(group.id);
    console.log('📖 Retrieved group:', retrievedGroup?.id);

    const groupEdges = await client.getNodeEdges?.(group.id, 'outgoing');
    console.log('📖 Group edges:', groupEdges?.length, 'edge(s)\n');

    // Get stats
    const stats = await client.getStats?.();
    console.log('📊 Database stats:');
    console.log(`   Nodes: ${stats?.nodes}`);
    console.log(`   Edges: ${stats?.edges}`);
    console.log(`   Node types:`, stats?.nodesByKind);
    console.log(`   Edge types:`, stats?.edgesByKind);
    console.log('');

    // Cleanup
    await client.disconnect();
    console.log('✅ Disconnected');

    console.log('\n🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testSQLite();
