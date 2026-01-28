/**
 * Standalone script to rebuild database snapshot
 * Run with: npx tsx rebuild-snapshot.ts
 */
import { DatabaseSnapshotManager } from '../tests/e2e/fixtures/database-snapshots';

async function main() {
  console.log('\n📸 Rebuilding database snapshot...\n');

  const manager = new DatabaseSnapshotManager();
  await manager.createSnapshot();

  console.log('\n✅ Snapshot rebuilt successfully!\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Snapshot rebuild failed:', error);
  process.exit(1);
});
