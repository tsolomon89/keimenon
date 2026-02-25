
import { Database } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getKeimenonDataInClause } from '@keimenon/types';

// Configuration
const homeDir = process.env.HOME || process.env.USERPROFILE || '';
const possiblePaths = [
    process.env.SQLITE_PATH,
    path.join(homeDir, '.keimenon', 'keimenon.db'),
    path.join(process.cwd(), 'keimenon.db'),
    'C:\\Users\\Audna\\.keimenon\\keimenon.db'
];

const DB_PATH = possiblePaths.find(p => p && fs.existsSync(p)) || '';

console.log(`\n🧪 Manual Delete Reproduction Script (Direct SQLite)`);
console.log(`===================================================`);
console.log(`📂 Database Path: ${DB_PATH}`);

if (!DB_PATH) {
  console.error(`❌ Database file not found`);
  process.exit(1);
}

const db = require('better-sqlite3')(DB_PATH);

try {
    // 1. Target Account (Admin User from diagnostic)
    const accountId = '4bd6176d-1a2c-417e-a3a5-ddb214a827a2'; 
    const scope = 'keimenon';

    console.log(`\n🎯 Target Account: ${accountId}`);
    console.log(`🎯 Scope: ${scope}`);

    // 2. Count before
    const keimenonClause = getKeimenonDataInClause();
    const countQuery = `SELECT COUNT(*) as count FROM nodes WHERE account_id = ? AND kind IN (${keimenonClause})`;
    
    const beforeCount = db.prepare(countQuery).get(accountId).count;
    console.log(`\n📊 Count BEFORE: ${beforeCount}`);

    if (beforeCount === 0) {
        console.log('⚠️ No nodes to delete.');
        process.exit(0);
    }

    // 3. Get Batch of IDs (limit 5 for safety test)
    const BATCH_SIZE = 5;
    const selectQuery = `SELECT id, kind FROM nodes
                   WHERE account_id = ?
                   AND kind IN (${keimenonClause})
                   LIMIT ?`;
    
    const nodes = db.prepare(selectQuery).all(accountId, BATCH_SIZE);
    
    console.log(`\n🔍 Found ${nodes.length} nodes to delete:`);
    nodes.forEach((n: any) => console.log(`   - ${n.id} (${n.kind})`));

    if (nodes.length === 0) process.exit(0);

    const nodeIds = nodes.map((n: any) => n.id);

    // 4. Delete Batch
    console.log(`\n🗑️  Attempting DELETE...`);
    const placeholders = nodeIds.map(() => '?').join(',');
    const deleteQuery = `DELETE FROM nodes WHERE account_id = ? AND id IN (${placeholders})`;
    
    // Execute delete
    const info = db.prepare(deleteQuery).run(accountId, ...nodeIds);
    
    console.log(`\n👉 Delete Result:`, info);
    console.log(`📉 Changes reported: ${info.changes}`);

    // 5. Count after
    const afterCount = db.prepare(countQuery).get(accountId).count;
    console.log(`\n📊 Count AFTER: ${beforeCount} -> ${afterCount}`);

    if (beforeCount - afterCount === info.changes) {
         console.log(`✅ SUCCESS: Counts match reported changes.`);
    } else {
         console.log(`❌ MISMATCH: Counts do not reflect reported changes.`);
    }

} catch (error) {
    console.error('❌ Error:', error);
} finally {
    db.close();
}
