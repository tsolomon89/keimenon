
import { Database } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getKeimenonDataInClause, getSystemNodeInClause } from '@keimenon/types';

// Configuration
const homeDir = process.env.HOME || process.env.USERPROFILE || '';
const possiblePaths = [
    process.env.SQLITE_PATH,
    path.join(homeDir, '.keimenon', 'keimenon.db'),
    path.join(process.cwd(), 'keimenon.db'),
    'C:\\Users\\Audna\\.keimenon\\keimenon.db' // Hardcoded fallback based on user path
];

const DB_PATH = possiblePaths.find(p => p && fs.existsSync(p)) || '';

console.log(`\n🔍 Diagnostic Script: Deletion Logic Check`);
console.log(`==========================================`);
console.log(`📂 Resolved Database Path: ${DB_PATH}`);

if (!DB_PATH) {
  console.error(`❌ Database file not found in any of the checked locations:`);
  possiblePaths.forEach(p => p && console.log(`   - ${p}`));
  process.exit(1);
}

// Verify file permissions
try {
    fs.accessSync(DB_PATH, fs.constants.R_OK);
    console.log(`   ✅ Database file is readable`);
} catch (err) {
    console.error(`   ❌ Database file is NOT readable:`, err);
    process.exit(1);
}

const db = require('better-sqlite3')(DB_PATH);

const result: any = {
    dbPath: DB_PATH,
    totalNodes: 0,
    nodesByKind: [],
    nodesByAccount: [],
    totalByAccount: [],
    scopeKeimenon: { count: 0, clause: '' },
    scopeAllClients: { count: 0, clause: '' },
    users: [],
    accounts: [],
    userAccounts: [],
    error: null
};

try {
  // 1. Check total node count
  result.totalNodes = db.prepare('SELECT COUNT(*) as count FROM nodes').get().count;

  // 2. Count by Account and Kind
  const nodesByAccount = db.prepare('SELECT account_id, kind, COUNT(*) as count FROM nodes GROUP BY account_id, kind').all();
  result.nodesByAccount = nodesByAccount;

  // 2b. Total by Account
  const totalByAccount = db.prepare('SELECT account_id, COUNT(*) as count FROM nodes GROUP BY account_id').all();
  result.totalByAccount = totalByAccount;

  // 3. Simulate Keimenon Data Scope Deletion
  const keimenonClause = getKeimenonDataInClause();
  const keimenonQuery = `SELECT COUNT(*) as count FROM nodes WHERE kind IN (${keimenonClause})`;
  result.scopeKeimenon = {
      count: db.prepare(keimenonQuery).get().count,
      clause: keimenonClause
  };

  // 4. Simulate All Clients Scope Deletion
  const systemClause = getSystemNodeInClause();
  const allClientsQuery = `SELECT COUNT(*) as count FROM nodes WHERE kind NOT IN (${systemClause})`;
  result.scopeAllClients = {
      count: db.prepare(allClientsQuery).get().count,
      clause: systemClause
  };

  // 5. Check for Accounts
  result.users = db.prepare('SELECT id, name, email FROM users').all();
  result.accounts = db.prepare('SELECT id, name, account_type FROM accounts').all();
  result.userAccounts = db.prepare('SELECT user_id, account_id, permission_level FROM user_accounts').all();

} catch (error: any) {
  result.error = error.message;
} finally {
  db.close();
  console.log(JSON.stringify(result, null, 2));
}
