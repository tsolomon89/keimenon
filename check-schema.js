const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), '.canvas-memory', 'canvas.db');
console.log('Database path:', dbPath);

const db = new Database(dbPath);

console.log('\nTables:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
tables.forEach(t => console.log('  -', t.name));

console.log('\nSchema version:');
try {
  const version = db.prepare("SELECT value FROM schema_metadata WHERE key='version'").get();
  console.log('  Version:', version?.value || 'unknown');
} catch (e) {
  console.log('  No schema_metadata table');
}

console.log('\nChecking for auth tables:');
const authTables = ['accounts', 'users', 'sessions'];
authTables.forEach(tableName => {
  const exists = tables.some(t => t.name === tableName);
  console.log(`  ${tableName}: ${exists ? '✓' : '✗'}`);
});

console.log('\nChecking nodes table structure:');
const nodesInfo = db.prepare("PRAGMA table_info(nodes)").all();
const hasAccountId = nodesInfo.some(col => col.name === 'account_id');
const hasCreatedBy = nodesInfo.some(col => col.name === 'created_by');
console.log('  account_id column:', hasAccountId ? '✓' : '✗');
console.log('  created_by column:', hasCreatedBy ? '✓' : '✗');

db.close();
