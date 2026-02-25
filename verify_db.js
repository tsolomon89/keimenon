const Database = require('better-sqlite3');
const path = 'C:\\Users\\Audna\\AppData\\Roaming\\Electron\\keimenon.db';

console.log('Checking database at:', path);

try {
  const db = new Database(path, { readonly: true });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@admin.com');
  console.log('User found:', user ? 'YES' : 'NO');
  if (user) {
    console.log('User details:', JSON.stringify(user, null, 2));
  }
  
  const account = db.prepare('SELECT * FROM accounts WHERE account_type = ?').get('admin');
  console.log('Admin Account found:', account ? 'YES' : 'NO');

} catch (e) {
  console.error('Error reading DB:', e);
}
