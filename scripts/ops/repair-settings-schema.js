#!/usr/bin/env node

const path = require('node:path');
const Database = require('better-sqlite3');
const { resolveRuntimePaths } = require('./runtime-paths');

function tableExists(db, tableName) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(tableName);
  return !!row;
}

function columnExists(db, tableName, columnName) {
  if (!tableExists(db, tableName)) {
    return false;
  }

  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

function ensureTableAccountApiKeys(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_api_keys (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK(provider IN (
        'openai', 'anthropic', 'groq', 'google', 'azure', 'ollama', 'tavily', 'custom'
      )),
      encrypted_key TEXT NOT NULL,
      key_hint TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      UNIQUE(account_id, provider)
    );
  `);

  if (!columnExists(db, 'account_api_keys', 'data_tag')) {
    db.exec(`ALTER TABLE account_api_keys ADD COLUMN data_tag TEXT DEFAULT 'real'`);
  }

  db.exec(`
    DELETE FROM account_api_keys
    WHERE rowid IN (
      SELECT rowid FROM (
        SELECT
          rowid,
          ROW_NUMBER() OVER (
            PARTITION BY account_id, provider
            ORDER BY updated_at DESC, created_at DESC, rowid DESC
          ) AS row_rank
        FROM account_api_keys
      )
      WHERE row_rank > 1
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_account ON account_api_keys(account_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON account_api_keys(provider)`);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_account_provider_unique
    ON account_api_keys(account_id, provider)
  `);
}

function ensureTableAccountAiSettings(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_ai_settings (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL UNIQUE,
      preferred_provider TEXT CHECK(preferred_provider IN (
        'openai', 'anthropic', 'groq', 'google', 'azure', 'ollama', 'custom'
      )),
      preferred_model TEXT,
      litellm_url TEXT,
      searxng_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
  `);

  const requiredColumns = [
    { name: 'preferred_provider', sql: 'preferred_provider TEXT' },
    { name: 'preferred_model', sql: 'preferred_model TEXT' },
    { name: 'litellm_url', sql: 'litellm_url TEXT' },
    { name: 'searxng_url', sql: 'searxng_url TEXT' },
    { name: 'created_at', sql: 'created_at INTEGER NOT NULL DEFAULT 0' },
    { name: 'updated_at', sql: 'updated_at INTEGER NOT NULL DEFAULT 0' },
    { name: 'data_tag', sql: "data_tag TEXT DEFAULT 'real'" },
  ];

  for (const column of requiredColumns) {
    if (!columnExists(db, 'account_ai_settings', column.name)) {
      db.exec(`ALTER TABLE account_ai_settings ADD COLUMN ${column.sql}`);
    }
  }

  if (columnExists(db, 'account_ai_settings', 'litellm_base_url')) {
    db.exec(`
      UPDATE account_ai_settings
      SET litellm_url = COALESCE(NULLIF(litellm_url, ''), litellm_base_url)
      WHERE litellm_base_url IS NOT NULL
    `);
  }

  if (columnExists(db, 'account_ai_settings', 'searxng_base_url')) {
    db.exec(`
      UPDATE account_ai_settings
      SET searxng_url = COALESCE(NULLIF(searxng_url, ''), searxng_base_url)
      WHERE searxng_base_url IS NOT NULL
    `);
  }

  db.exec(`
    DELETE FROM account_ai_settings
    WHERE rowid IN (
      SELECT rowid FROM (
        SELECT
          rowid,
          ROW_NUMBER() OVER (
            PARTITION BY account_id
            ORDER BY updated_at DESC, created_at DESC, rowid DESC
          ) AS row_rank
        FROM account_ai_settings
      )
      WHERE row_rank > 1
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_settings_account ON account_ai_settings(account_id)`);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_settings_account_unique
    ON account_ai_settings(account_id)
  `);
}

function main() {
  const runtimePaths = resolveRuntimePaths();
  const dbPath = runtimePaths.dbPath;
  const db = new Database(dbPath);

  try {
    db.exec('PRAGMA foreign_keys = ON');
    ensureTableAccountApiKeys(db);
    ensureTableAccountAiSettings(db);

    const apiKeysCount = db.prepare(`SELECT COUNT(*) AS c FROM account_api_keys`).get().c;
    const aiSettingsCount = db.prepare(`SELECT COUNT(*) AS c FROM account_ai_settings`).get().c;

    console.log('[settings-schema-repair] complete');
    console.log(`- database: ${dbPath}`);
    console.log(`- account_api_keys rows: ${apiKeysCount}`);
    console.log(`- account_ai_settings rows: ${aiSettingsCount}`);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(
    `[settings-schema-repair] failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
