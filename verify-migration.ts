import Database from 'better-sqlite3';

const db = new Database('C:\\Users\\Audna\\.canvas-memory\\canvas.db', { readonly: true });

console.log('Job Tables:');
const tables = db
  .prepare(
    `
  SELECT name FROM sqlite_master
  WHERE type='table' AND name LIKE 'job%'
  ORDER BY name
`
  )
  .all();
console.log(tables);

console.log('\nJob Views:');
const views = db
  .prepare(
    `
  SELECT name FROM sqlite_master
  WHERE type='view' AND (name LIKE '%job%' OR name LIKE '%active%')
  ORDER BY name
`
  )
  .all();
console.log(views);

console.log('\nJobs table schema:');
const schema = db.pragma('table_info(jobs)');
console.log(schema);

db.close();
