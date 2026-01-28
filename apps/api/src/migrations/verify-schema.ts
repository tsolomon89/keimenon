import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

/**
 * Verify Migration 003 schema
 *
 * Checks that all expected tables, columns, and indexes were created
 */

function getDatabasePath(): string {
  const defaultPath = path.join(os.homedir(), '.keimenon', 'keimenon.db');
  return process.env.DB_PATH || process.env.DATABASE_PATH || defaultPath;
}

async function verifySchema() {
  const dbPath = getDatabasePath();
  console.log(`📂 Verifying database: ${dbPath}\n`);

  const db = new Database(dbPath, { readonly: true });

  try {
    // 1. Check schema version
    console.log('1️⃣  Checking schema version...');
    const versionResult = db
      .prepare("SELECT value FROM schema_metadata WHERE key = 'version'")
      .get() as any;
    const version = versionResult?.value;
    console.log(`   Schema version: ${version}`);
    if (parseFloat(version) >= 3.0) {
      console.log('   ✅ Version is 3.0 or higher\n');
    } else {
      console.log('   ❌ Expected version 3.0+\n');
      return false;
    }

    // 2. Check new tables exist
    console.log('2️⃣  Checking new tables...');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const expectedTables = [
      'blobs',
      'node_spans',
      'node_signatures',
      'lsh_bands',
      'clusters',
      'cluster_members',
      'migrations',
    ];

    const tableNames = tables.map((t) => t.name);
    let allTablesExist = true;

    for (const expected of expectedTables) {
      const exists = tableNames.includes(expected);
      console.log(`   ${exists ? '✅' : '❌'} ${expected}`);
      if (!exists) allTablesExist = false;
    }

    if (!allTablesExist) {
      console.log('\n❌ Some tables are missing\n');
      return false;
    }

    console.log('   ✅ All expected tables exist\n');

    // 3. Check nodes table has new columns
    console.log('3️⃣  Checking nodes table columns...');
    const nodesColumns = db.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>;

    const nodesColumnNames = nodesColumns.map((c) => c.name);
    const expectedColumns = ['node_key', 'content_id'];

    let allColumnsExist = true;
    for (const expected of expectedColumns) {
      const exists = nodesColumnNames.includes(expected);
      console.log(`   ${exists ? '✅' : '❌'} ${expected}`);
      if (!exists) allColumnsExist = false;
    }

    if (!allColumnsExist) {
      console.log('\n❌ Some columns are missing\n');
      return false;
    }

    console.log('   ✅ All expected columns exist\n');

    // 4. Check indexes
    console.log('4️⃣  Checking indexes...');
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
      .all() as Array<{ name: string }>;

    const expectedIndexes = [
      'idx_nodes_node_key',
      'idx_nodes_content_id',
      'idx_blobs_account',
      'idx_spans_level_modality',
      'idx_sig_node_key',
      'idx_sig_content_id',
      'idx_lsh_band_hash',
      'idx_clusters_modality',
      'idx_cluster_members_node',
    ];

    const indexNames = indexes.map((i) => i.name);
    let allIndexesExist = true;

    for (const expected of expectedIndexes) {
      const exists = indexNames.includes(expected);
      console.log(`   ${exists ? '✅' : '❌'} ${expected}`);
      if (!exists) allIndexesExist = false;
    }

    if (!allIndexesExist) {
      console.log('\n⚠️  Some indexes are missing (may not be critical)\n');
    } else {
      console.log('   ✅ All expected indexes exist\n');
    }

    // 5. Check node_spans schema details
    console.log('5️⃣  Checking node_spans table schema...');
    const nodeSpansSchema = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='node_spans'")
      .get() as any;

    if (nodeSpansSchema.sql.includes('PRIMARY KEY (node_id, blob_hash, byte_start, byte_end)')) {
      console.log('   ✅ Multi-span primary key is correct\n');
    } else {
      console.log('   ❌ Primary key is incorrect\n');
      return false;
    }

    // 6. Check migration record
    console.log('6️⃣  Checking migration record...');
    const migrationRecord = db
      .prepare("SELECT * FROM migrations WHERE version = '003'")
      .get() as any;

    if (migrationRecord) {
      console.log(
        `   ✅ Migration 003 recorded: ${new Date(migrationRecord.applied_at).toISOString()}\n`
      );
    } else {
      console.log('   ❌ Migration record not found\n');
      return false;
    }

    // 7. Count records
    console.log('7️⃣  Database statistics...');
    const stats = {
      nodes: db.prepare('SELECT COUNT(*) as count FROM nodes').get() as any,
      edges: db.prepare('SELECT COUNT(*) as count FROM edges').get() as any,
      blobs: db.prepare('SELECT COUNT(*) as count FROM blobs').get() as any,
      node_spans: db.prepare('SELECT COUNT(*) as count FROM node_spans').get() as any,
      node_signatures: db.prepare('SELECT COUNT(*) as count FROM node_signatures').get() as any,
      clusters: db.prepare('SELECT COUNT(*) as count FROM clusters').get() as any,
    };

    console.log(`   Nodes: ${stats.nodes.count}`);
    console.log(`   Edges: ${stats.edges.count}`);
    console.log(`   Blobs: ${stats.blobs.count}`);
    console.log(`   Node Spans: ${stats.node_spans.count}`);
    console.log(`   Node Signatures: ${stats.node_signatures.count}`);
    console.log(`   Clusters: ${stats.clusters.count}\n`);

    // All checks passed
    console.log('✅ Schema verification PASSED\n');
    console.log('Migration 003 is correctly applied.');
    return true;
  } catch (error) {
    console.error('❌ Verification failed:', error);
    return false;
  } finally {
    db.close();
  }
}

// Run if called directly
if (require.main === module) {
  verifySchema().then((success) => {
    process.exit(success ? 0 : 1);
  });
}

export { verifySchema };
