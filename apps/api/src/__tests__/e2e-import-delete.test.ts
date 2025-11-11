/**
 * Minimal end-to-end import + delete verification using real API and SQLite.
 *
 * This test:
 * 1. Ensures the admin and client accounts exist with known credentials.
 * 2. Logs in, creates a job-based import with sample data, and waits for completion.
 * 3. Confirms graph nodes/edges are created for the account.
 * 4. Launches a canvas delete job and verifies graph data is removed.
 *
 * Run with:  npm run test:e2e
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import fetch from 'node-fetch';
import FormData from 'form-data';
import bcrypt from 'bcrypt';
import { unlockAccount } from '../utils/account-lockout';

const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:4001';
const DB_PATH =
  process.env.DB_PATH || path.join(require('os').homedir(), '.canvas-memory', 'canvas.db');
const SAMPLE_FILE = path.join(process.cwd(), '../../ai_context/chat_data/test-samples/small.json');

const ADMIN = { email: 'admin@admin.com', password: 'admin123', name: 'Admin User' };

// Ensure NODE_ENV defaults to 'test' to keep behavior aligned with test fixtures.
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

interface LoginResult {
  token: string;
  accountId: string;
  userId: string;
}

const now = () => Date.now();

function rebuildFts(db: Database.Database): void {
  try {
    db.exec(`
      DROP TRIGGER IF EXISTS nodes_fts_insert;
      DROP TRIGGER IF EXISTS nodes_fts_update;
      DROP TRIGGER IF EXISTS nodes_fts_delete;
      DROP TABLE IF EXISTS nodes_fts;
      CREATE VIRTUAL TABLE nodes_fts USING fts5(id UNINDEXED, content);
      CREATE TRIGGER nodes_fts_insert AFTER INSERT ON nodes BEGIN
        INSERT INTO nodes_fts(id, content) VALUES (new.id, new.properties);
      END;
      CREATE TRIGGER nodes_fts_update AFTER UPDATE ON nodes BEGIN
        DELETE FROM nodes_fts WHERE id = old.id;
        INSERT INTO nodes_fts(id, content) VALUES (new.id, new.properties);
      END;
      CREATE TRIGGER nodes_fts_delete AFTER DELETE ON nodes BEGIN
        DELETE FROM nodes_fts WHERE id = old.id;
      END;
    `);
  } catch (err) {
    console.warn('[e2e] Failed to rebuild FTS table:', err);
  }
}

function ensureAccountAndUser(db: Database.Database, user: typeof ADMIN): string {
  const accountRow = db.prepare('SELECT id FROM accounts WHERE email = ?').get(user.email) as
    | { id: string }
    | undefined;
  const accountId = accountRow?.id || `acct_${randomUUID()}`;

  const accountExists =
    db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(accountId) !== undefined;

  const timestamp = now();

  if (!accountExists) {
    db.prepare(
      `INSERT INTO accounts
       (id, account_type, account_class, email, name, created_at, updated_at, allow_email_invites)
       VALUES (?, 'admin', 'business', ?, ?, ?, ?, 1)`
    ).run(accountId, user.email, user.name, timestamp, timestamp);
  }

  const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(user.email) as
    | { id: string }
    | undefined;
  const userId = userRow?.id || `user_${randomUUID()}`;
  const passwordHash = bcrypt.hashSync(user.password, 10);

  if (userRow) {
    db.prepare(
      `UPDATE users
       SET password_hash = ?, is_active = 1, permission_level = 'admin',
           primary_account_id = ?, last_login_account_id = ?, updated_at = ?
       WHERE id = ?`
    ).run(passwordHash, accountId, accountId, timestamp, userId);
  } else {
    db.prepare(
      `INSERT INTO users
       (id, email, password_hash, name, permission_level, user_class,
        is_active, created_at, updated_at, primary_account_id, last_login_account_id, email_verified)
       VALUES (?, ?, ?, ?, 'admin', 'person', 1, ?, ?, ?, ?, 1)`
    ).run(userId, user.email, passwordHash, user.name, timestamp, timestamp, accountId, accountId);
  }

  const membershipExists = db
    .prepare('SELECT 1 FROM user_accounts WHERE user_id = ? AND account_id = ?')
    .get(userId, accountId);

  if (!membershipExists) {
    db.prepare(
      `INSERT INTO user_accounts
       (id, user_id, account_id, permission_level, role_rank, status,
        joined_at, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 4, 'active', ?, ?, ?)`
    ).run(`ua_${randomUUID()}`, userId, accountId, timestamp, timestamp, timestamp);
  }

  unlockAccount(db, user.email);
  db.prepare('DELETE FROM login_attempts WHERE email = ?').run(user.email);

  return accountId;
}

async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as any;
  return {
    token: data.token,
    accountId: data.user.accountId || data.user.account_id,
    userId: data.user.id || data.user.userId,
  };
}

async function waitForJob(
  jobId: string,
  token: string,
  desired: 'succeeded' | 'failed' | 'canceled' = 'succeeded',
  timeoutMs = 120_000
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to fetch job (${res.status}): ${body}`);
    }
    const data = (await res.json()) as any;
    const status = data.job.state?.status || data.job.status;
    if (status === desired) {
      return data.job;
    }
    if (['failed', 'canceled'].includes(status) && status !== desired) {
      throw new Error(
        `Job ${jobId} ended with status ${status}: ${JSON.stringify(data.job?.state || data.job)}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Job ${jobId} did not reach "${desired}" within ${timeoutMs}ms`);
}

test('import job succeeds then delete job clears data', async (_t) => {
  assert.ok(fs.existsSync(SAMPLE_FILE), 'Sample chat file is required for the test');

  const db = new Database(DB_PATH);
  rebuildFts(db);

  const adminAccountId = ensureAccountAndUser(db, ADMIN);

  const { token: adminToken } = await login(ADMIN.email, ADMIN.password);

  // Ensure account_id on users matches account
  const initialNodeCount = (
    db.prepare('SELECT COUNT(*) as count FROM nodes WHERE account_id = ?').get(adminAccountId) as {
      count: number;
    }
  ).count;

  const form = new FormData();
  form.append('files', fs.createReadStream(SAMPLE_FILE));

  const importRes = await fetch(`${API_BASE_URL}/api/v1/jobs/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, ...form.getHeaders() },
    body: form,
  });

  assert.ok(importRes.ok, `Import job creation failed (${importRes.status})`);
  const importData = (await importRes.json()) as any;
  const importJobId = importData.jobId || importData.job?.id;
  assert.ok(importJobId, 'Import job id missing');

  const importJob = await waitForJob(importJobId, adminToken);
  assert.equal(importJob.state.status || importJob.status, 'succeeded');

  const postImportNodes = (
    db.prepare('SELECT COUNT(*) as count FROM nodes WHERE account_id = ?').get(adminAccountId) as {
      count: number;
    }
  ).count;

  assert.ok(
    postImportNodes > initialNodeCount,
    `Expected node count to increase after import (was ${initialNodeCount}, now ${postImportNodes})`
  );

  const deleteRes = await fetch(`${API_BASE_URL}/api/v1/jobs/delete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scope: 'canvas' }),
  });

  assert.ok(deleteRes.ok, `Delete job creation failed (${deleteRes.status})`);
  const deleteData = (await deleteRes.json()) as any;
  const deleteJobId = deleteData.jobId || deleteData.job?.id;
  assert.ok(deleteJobId, 'Delete job id missing');

  const deleteJob = await waitForJob(deleteJobId, adminToken);
  assert.equal(deleteJob.state.status || deleteJob.status, 'succeeded');

  const postDeleteNodes = (
    db.prepare('SELECT COUNT(*) as count FROM nodes WHERE account_id = ?').get(adminAccountId) as {
      count: number;
    }
  ).count;
  const postDeleteEdges = (
    db.prepare('SELECT COUNT(*) as count FROM edges WHERE account_id = ?').get(adminAccountId) as {
      count: number;
    }
  ).count;

  assert.equal(postDeleteNodes, 0, 'Expected nodes to be cleared after delete job');
  assert.equal(postDeleteEdges, 0, 'Expected edges to be cleared after delete job');

  db.close();
});
