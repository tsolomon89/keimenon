#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { REQUIRED_NODE_MAJOR, isRequiredNodeVersion } = require('./project-node-runtime');

function fail(message) {
  console.error(`[sqlite-check] ${message}`);
  process.exit(1);
}

function resolveDatabasePath() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const localDocsPath =
    process.env.LOCAL_DOCS_PATH?.replace('~', homeDir) || path.join(homeDir, '.keimenon');
  return process.env.SQLITE_PATH?.replace('~', homeDir) || path.join(localDocsPath, 'keimenon.db');
}

function main() {
  if (!isRequiredNodeVersion()) {
    fail(
      `Node ${REQUIRED_NODE_MAJOR}.x is required for SQLite diagnostics. Active: v${process.versions.node}`
    );
  }

  const databasePath = resolveDatabasePath();

  if (!fs.existsSync(databasePath)) {
    fail(`Database not found: ${databasePath}`);
  }

  const db = new Database(databasePath, { readonly: true, fileMustExist: true });

  try {
    const integrityRows = db.prepare('PRAGMA integrity_check').all();
    const integritySummary = integrityRows
      .map((row) => row.integrity_check ?? Object.values(row)[0])
      .join(', ');
    const journalMode = db.pragma('journal_mode', { simple: true });
    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    const busyTimeout = db.pragma('busy_timeout', { simple: true });

    console.log(`[sqlite-check] database=${databasePath}`);
    console.log(
      `[sqlite-check] journal_mode=${journalMode} foreign_keys=${foreignKeys} busy_timeout=${busyTimeout}`
    );

    if (integritySummary !== 'ok') {
      fail(`Integrity check failed: ${integritySummary}`);
    }

    console.log('[sqlite-check] integrity_check=ok');
  } finally {
    db.close();
  }
}

main();
