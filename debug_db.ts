import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const dbPath = path.join(os.homedir(), '.canvas-memory', 'canvas.db');
console.log(`Checking database at: ${dbPath}`);

try {
  const db = new Database(dbPath, { readonly: true });

  const user = db.prepare('SELECT id, email, is_active FROM users WHERE email = ?').get('admin@admin.com');
  if (user) {
    console.log(`User: ${JSON.stringify(user)}`);
    console.log(`Email length: ${user.email.length}`);
    console.log(`is_active: ${user.is_active} (Type: ${typeof user.is_active})`);
  } else {
    console.log('USER NOT FOUND');
  }


} catch (error) {
  console.error('Error opening database:', error);
}
