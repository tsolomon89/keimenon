#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');

function resolveDbPath() {
  if (process.env.SQLITE_PATH && process.env.SQLITE_PATH.trim().length > 0) {
    return process.env.SQLITE_PATH;
  }
  return path.join(os.homedir(), '.keimenon', 'keimenon.db');
}

function main() {
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error(`[backfill-dedupe-role-defaults] Database not found: ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  try {
    const result = db
      .prepare(
        `
        UPDATE dedupe_evidence
        SET
          role_user_count = COALESCE(role_user_count, 0),
          role_assistant_count = COALESCE(role_assistant_count, 0),
          role_system_count = COALESCE(role_system_count, 0),
          role_unknown_count = COALESCE(role_unknown_count, 0),
          updated_at = COALESCE(updated_at, CAST(strftime('%s', 'now') AS INTEGER) * 1000)
      `
      )
      .run();

    console.log(`[backfill-dedupe-role-defaults] Completed: rows_updated=${result.changes || 0}`);
  } finally {
    db.close();
  }
}

main();
