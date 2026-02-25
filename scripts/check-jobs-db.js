const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), '.test-dbs/snapshot-template-jobs.db');
console.log(`Checking DB at: ${dbPath}`);

try {
  const db = new Database(dbPath, { readonly: true });
  const tableInfo = db.pragma('table_info(jobs)');
  console.log('JOBS Table Columns:');
  tableInfo.forEach(col => console.log(`- ${col.name} (${col.type})`));
  
  const hasDataTag = tableInfo.some(col => col.name === 'data_tag');
  console.log(`\nHas data_tag column? ${hasDataTag}`);
} catch (err) {
  console.error('Error:', err.message);
}
