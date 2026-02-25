
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('c:/Development/Projects/keimenon/.test-dbs/worker-0-jobs.db');
console.log('Opening DB:', dbPath);

try {
  const db = new Database(dbPath, { verbose: console.log });
  const rows = db.prepare('SELECT * FROM jobs').all();
  console.log('Jobs found:', rows.length);
  rows.forEach(row => {
    console.log(`- ${row.id} (${row.status})`);
  });
} catch (err) {
  console.error('Error:', err);
}
