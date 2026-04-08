#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const {
  resolveRuntimePaths,
  getKnownDatabaseCandidates,
  getExistingDatabaseCandidates,
} = require('./runtime-paths');

function inspectDatabase(dbPath) {
  const info = {
    path: dbPath,
    exists: fs.existsSync(dbPath),
    counts: null,
    error: null,
  };

  if (!info.exists) {
    return info;
  }

  try {
    const db = new Database(dbPath, { readonly: true });
    const tables = new Set(
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
        .all()
        .map((row) => row.name)
    );

    const count = (tableName) =>
      tables.has(tableName)
        ? db.prepare(`SELECT COUNT(*) AS c FROM ${tableName}`).get().c
        : 'missing';

    info.counts = {
      nodes: count('nodes'),
      edges: count('edges'),
      jobs: count('jobs'),
      accounts: count('accounts'),
      users: count('users'),
      account_api_keys: count('account_api_keys'),
      account_ai_settings: count('account_ai_settings'),
    };

    db.close();
  } catch (error) {
    info.error = error instanceof Error ? error.message : String(error);
  }

  return info;
}

function main() {
  const runtimePaths = resolveRuntimePaths();
  const knownDbs = getKnownDatabaseCandidates(runtimePaths.dbPath);
  const existingDbs = getExistingDatabaseCandidates(runtimePaths.dbPath);
  const staleExistingDbs = existingDbs.filter((dbPath) => dbPath !== runtimePaths.dbPath);

  const inspected = knownDbs.map((dbPath) => inspectDatabase(dbPath));

  console.log('[factory-reset-status] runtime paths');
  console.log(`- canonical db: ${runtimePaths.dbPath}`);
  console.log(`- local docs root: ${runtimePaths.localDocsRoot}`);
  console.log(`- storage path: ${runtimePaths.storagePath}`);
  console.log('');
  console.log('[factory-reset-status] known database candidates');

  for (const db of inspected) {
    const marker = db.path === runtimePaths.dbPath ? 'ACTIVE' : db.exists ? 'STALE' : 'MISSING';
    console.log(`- [${marker}] ${db.path}`);
    if (db.counts) {
      console.log(
        `    nodes=${db.counts.nodes} edges=${db.counts.edges} jobs=${db.counts.jobs} accounts=${db.counts.accounts} users=${db.counts.users}`
      );
      console.log(
        `    settings_schema: account_api_keys=${db.counts.account_api_keys} account_ai_settings=${db.counts.account_ai_settings}`
      );
    }
    if (db.error) {
      console.log(`    error: ${db.error}`);
    }
  }

  console.log('');
  if (staleExistingDbs.length === 0) {
    console.log('[factory-reset-status] no stale database files detected');
  } else {
    console.log('[factory-reset-status] stale database files detected:');
    for (const dbPath of staleExistingDbs) {
      console.log(`- ${dbPath}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(
    `[factory-reset-status] failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
