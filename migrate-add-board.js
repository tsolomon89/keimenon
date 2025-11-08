// Migration to add 'Board' node kind to existing database
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), '.canvas-memory', 'canvas.db');
const db = new Database(dbPath);

console.log('Migrating database to add Board node kind...');
console.log('Database:', dbPath);

try {
  // SQLite doesn't support ALTER TABLE ... MODIFY CHECK constraint directly
  // We need to:
  // 1. Create a new table with the updated constraint
  // 2. Copy data
  // 3. Drop old table
  // 4. Rename new table

  db.exec(`
    BEGIN TRANSACTION;

    -- Create new table with Board added
    CREATE TABLE nodes_new (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN (
        'UploadItem', 'Chat', 'MessageRef', 'Source', 'Group', 'CodeBlock', 'Folder',
        'ChatThread', 'Message', 'ObjectiveClaim', 'UnifiedDoc', 'Constellation', 'UserNode', 'AccountNode', 'Board'
      )),
      properties TEXT NOT NULL,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Copy all data
    INSERT INTO nodes_new SELECT * FROM nodes;

    -- Drop old table
    DROP TABLE nodes;

    -- Rename new table
    ALTER TABLE nodes_new RENAME TO nodes;

    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
    CREATE INDEX IF NOT EXISTS idx_nodes_account ON nodes(account_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_created_by ON nodes(created_by);
    CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes(created_at);
    CREATE INDEX IF NOT EXISTS idx_nodes_updated ON nodes(updated_at);
    CREATE INDEX IF NOT EXISTS idx_nodes_data_tag ON nodes(data_tag);
    CREATE INDEX IF NOT EXISTS idx_nodes_account_tag ON nodes(account_id, data_tag);

    COMMIT;
  `);

  console.log('✅ Migration completed successfully!');
  console.log('Board node kind has been added to the database.');
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
