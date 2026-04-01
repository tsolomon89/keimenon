#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

function resolveDbPath() {
  if (process.env.SQLITE_PATH && process.env.SQLITE_PATH.trim().length > 0) {
    return process.env.SQLITE_PATH;
  }
  return path.join(os.homedir(), '.keimenon', 'keimenon.db');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isLikelySha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function main() {
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error(`[backfill-auth-token-hashes] Database not found: ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  let sessionUpdates = 0;
  let resetUpdates = 0;

  try {
    const run = db.transaction(() => {
      const sessions = db
        .prepare('SELECT id, token, token_hash FROM sessions WHERE token IS NOT NULL')
        .all();

      const updateSession = db.prepare(
        'UPDATE sessions SET token = ?, token_hash = ?, token_family_id = COALESCE(token_family_id, id) WHERE id = ?'
      );

      for (const row of sessions) {
        const token = row.token;
        const existingHash = row.token_hash;
        const shouldUpdate = !isLikelySha256(existingHash) || existingHash !== token;
        if (!shouldUpdate) {
          continue;
        }
        const hashed = hashToken(token);
        updateSession.run(hashed, hashed, row.id);
        sessionUpdates += 1;
      }

      const resetTokens = db
        .prepare('SELECT id, token, token_hash FROM password_reset_tokens WHERE token IS NOT NULL')
        .all();

      const updateResetToken = db.prepare(
        'UPDATE password_reset_tokens SET token = ?, token_hash = ? WHERE id = ?'
      );

      for (const row of resetTokens) {
        const token = row.token;
        const existingHash = row.token_hash;
        const shouldUpdate = !isLikelySha256(existingHash) || existingHash !== token;
        if (!shouldUpdate) {
          continue;
        }
        const hashed = hashToken(token);
        updateResetToken.run(hashed, hashed, row.id);
        resetUpdates += 1;
      }
    });

    run();
    console.log(
      `[backfill-auth-token-hashes] Completed: sessions=${sessionUpdates}, password_reset_tokens=${resetUpdates}`
    );
  } finally {
    db.close();
  }
}

main();
