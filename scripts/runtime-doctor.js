#!/usr/bin/env node

const {
  REQUIRED_NODE_MAJOR,
  getCurrentNodeMajor,
  isRequiredNodeVersion,
} = require('./project-node-runtime');

function fail(message) {
  console.error(`[runtime-doctor] ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`[runtime-doctor] ${message}`);
}

async function main() {
  const currentVersion = process.versions.node;
  const currentMajor = getCurrentNodeMajor(currentVersion);

  log(`Active Node.js version: v${currentVersion}`);

  if (!isRequiredNodeVersion()) {
    fail(
      `Unsupported Node.js version. Required: v${REQUIRED_NODE_MAJOR}.x, found: v${currentVersion}`
    );
  }

  log(`Node major matches required runtime: ${REQUIRED_NODE_MAJOR}`);

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (error) {
    fail(`Failed to load better-sqlite3: ${error.message}`);
  }

  if (typeof Database !== 'function') {
    fail('better-sqlite3 did not export a database constructor.');
  }

  log('better-sqlite3 loaded successfully');

  let db;
  try {
    db = new Database(':memory:');
    const journalMode = db.pragma('journal_mode', { simple: true });
    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    const row = db.prepare('SELECT sqlite_version() AS sqlite_version').get();
    log(
      `SQLite opened in memory (sqlite_version=${row.sqlite_version}, journal_mode=${journalMode}, foreign_keys=${foreignKeys})`
    );
  } catch (error) {
    fail(`Failed to open in-memory SQLite database: ${error.message}`);
  } finally {
    if (db) {
      db.close();
    }
  }

  log(`Native ABI verified for Node ${currentMajor}`);
}

main().catch((error) => fail(error.message));
