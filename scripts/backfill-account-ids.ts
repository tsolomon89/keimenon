/**
 * Backfill Script: Populate account_id in Phase 1-3 Tables
 *
 * After migration 007 adds account_id columns to blobs, node_spans,
 * node_signatures, and lsh_bands, this script backfills existing records
 * by copying account_id from the nodes table.
 *
 * Usage:
 *   npx tsx scripts/backfill-account-ids.ts
 *   DB_PATH=./path/to/canvas.db npx tsx scripts/backfill-account-ids.ts
 *
 * IMPORTANT: Run this AFTER migration 007 and BEFORE making account_id NOT NULL.
 */

import { SQLiteClient } from '../packages/db/src/sqlite/client';
import * as path from 'path';

interface BackfillStats {
  blobsUpdated: number;
  spansUpdated: number;
  signaturesUpdated: number;
  lshBandsUpdated: number;
  orphanedNodes: number;
}

async function backfillAccountIds(dbPath: string): Promise<BackfillStats> {
  console.log('🔄 Starting account_id backfill...');
  console.log(`📂 Database: ${dbPath}`);

  const client = new SQLiteClient({ databasePath: dbPath });
  await client.connect();

  const db = client.getDatabase();

  const stats: BackfillStats = {
    blobsUpdated: 0,
    spansUpdated: 0,
    signaturesUpdated: 0,
    lshBandsUpdated: 0,
    orphanedNodes: 0,
  };

  try {
    // 1. Find all nodes without account_id in Phase 1-3 tables
    console.log('\n📊 Checking for orphaned records...');

    const orphanedSpans = db
      .prepare('SELECT COUNT(DISTINCT node_id) as count FROM node_spans WHERE account_id IS NULL')
      .get() as any;
    console.log(`  - node_spans: ${orphanedSpans.count} orphaned node IDs`);

    const orphanedSigs = db
      .prepare(
        'SELECT COUNT(DISTINCT node_id) as count FROM node_signatures WHERE account_id IS NULL'
      )
      .get() as any;
    console.log(`  - node_signatures: ${orphanedSigs.count} orphaned node IDs`);

    const orphanedBands = db
      .prepare('SELECT COUNT(DISTINCT node_id) as count FROM lsh_bands WHERE account_id IS NULL')
      .get() as any;
    console.log(`  - lsh_bands: ${orphanedBands.count} orphaned node IDs`);

    const orphanedBlobs = db
      .prepare('SELECT COUNT(*) as count FROM blobs WHERE account_id IS NULL')
      .get() as any;
    console.log(`  - blobs: ${orphanedBlobs.count} orphaned blobs`);

    // 2. Get unique node IDs from node_spans that need backfill
    const orphanedNodes = db
      .prepare(
        `
      SELECT DISTINCT node_id FROM node_spans WHERE account_id IS NULL
    `
      )
      .all() as any[];

    console.log(`\n🔍 Found ${orphanedNodes.length} unique node IDs to backfill`);

    if (orphanedNodes.length === 0) {
      console.log('✅ No orphaned records found. Backfill not needed.');
      await client.disconnect();
      return stats;
    }

    // 3. Prepare update statements
    const updateSpan = db.prepare(`
      UPDATE node_spans
      SET account_id = ?
      WHERE node_id = ? AND account_id IS NULL
    `);

    const updateSig = db.prepare(`
      UPDATE node_signatures
      SET account_id = ?
      WHERE node_id = ? AND account_id IS NULL
    `);

    const updateLsh = db.prepare(`
      UPDATE lsh_bands
      SET account_id = ?
      WHERE node_id = ? AND account_id IS NULL
    `);

    const updateBlob = db.prepare(`
      UPDATE blobs
      SET account_id = ?
      WHERE hash IN (
        SELECT blob_hash FROM node_spans WHERE node_id = ?
      ) AND account_id IS NULL
    `);

    // 4. Run backfill in transaction
    console.log('\n⚙️  Running backfill transaction...');

    const transaction = db.transaction((nodes: any[]) => {
      for (const { node_id } of nodes) {
        // Get account_id from nodes table
        const node = db
          .prepare(
            `
          SELECT account_id FROM nodes WHERE id = ?
        `
          )
          .get(node_id) as any;

        if (node && node.account_id) {
          // Update all Phase 1-3 tables for this node
          const spansResult = updateSpan.run(node.account_id, node_id);
          const sigResult = updateSig.run(node.account_id, node_id);
          const lshResult = updateLsh.run(node.account_id, node_id);
          const blobResult = updateBlob.run(node.account_id, node_id);

          stats.spansUpdated += spansResult.changes;
          stats.signaturesUpdated += sigResult.changes;
          stats.lshBandsUpdated += lshResult.changes;
          stats.blobsUpdated += blobResult.changes;
        } else {
          console.warn(`⚠️  No account_id found for node ${node_id}`);
          stats.orphanedNodes++;
        }
      }
    });

    transaction(orphanedNodes);

    console.log('\n✅ Account_id backfill complete!');

    // 5. Verify backfill
    console.log('\n🔍 Verifying backfill results...');

    const remainingSpans = db
      .prepare('SELECT COUNT(*) as count FROM node_spans WHERE account_id IS NULL')
      .get() as any;
    const remainingSigs = db
      .prepare('SELECT COUNT(*) as count FROM node_signatures WHERE account_id IS NULL')
      .get() as any;
    const remainingBands = db
      .prepare('SELECT COUNT(*) as count FROM lsh_bands WHERE account_id IS NULL')
      .get() as any;
    const remainingBlobs = db
      .prepare('SELECT COUNT(*) as count FROM blobs WHERE account_id IS NULL')
      .get() as any;

    console.log(`  - Remaining NULL account_ids in node_spans: ${remainingSpans.count}`);
    console.log(`  - Remaining NULL account_ids in node_signatures: ${remainingSigs.count}`);
    console.log(`  - Remaining NULL account_ids in lsh_bands: ${remainingBands.count}`);
    console.log(`  - Remaining NULL account_ids in blobs: ${remainingBlobs.count}`);

    // 6. Print summary
    console.log('\n📊 Backfill Summary:');
    console.log(`  ✓ Blobs updated: ${stats.blobsUpdated}`);
    console.log(`  ✓ Node spans updated: ${stats.spansUpdated}`);
    console.log(`  ✓ Node signatures updated: ${stats.signaturesUpdated}`);
    console.log(`  ✓ LSH bands updated: ${stats.lshBandsUpdated}`);
    if (stats.orphanedNodes > 0) {
      console.log(`  ⚠️  Orphaned nodes (no account_id): ${stats.orphanedNodes}`);
    }

    // 7. Check for success
    const totalRemaining =
      remainingSpans.count + remainingSigs.count + remainingBands.count + remainingBlobs.count;

    if (totalRemaining === 0) {
      console.log('\n✅ SUCCESS: All records have account_id populated!');
      console.log('📝 Next steps:');
      console.log('   1. Run all tests to verify multi-tenant isolation');
      console.log('   2. Create follow-up migration to make account_id NOT NULL');
      console.log('   3. Remove legacy behavior (optional accountId parameters)');
    } else {
      console.log('\n⚠️  WARNING: Some records still have NULL account_id');
      console.log('   This may indicate orphaned data or missing nodes in the nodes table.');
      console.log('   Review the warnings above and investigate further.');
    }

    await client.disconnect();
    return stats;
  } catch (error) {
    console.error('\n❌ Backfill failed:', error);
    await client.disconnect();
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  const dbPath =
    process.env.DB_PATH ||
    path.join(process.env.USERPROFILE || process.env.HOME || '.', '.canvas-memory', 'canvas.db');

  console.log('🚀 Account ID Backfill Script');
  console.log('================================\n');

  backfillAccountIds(dbPath)
    .then((stats) => {
      console.log('\n✅ Backfill completed successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ Backfill failed:', err);
      process.exit(1);
    });
}

// Export for testing
export { backfillAccountIds, BackfillStats };
