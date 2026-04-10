#!/usr/bin/env node

const fs = require('node:fs');
const Database = require('better-sqlite3');
const { resolveRuntimePaths } = require('./runtime-paths');

function tableExists(db, tableName) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(tableName);
  return !!row;
}

function countOrMissing(db, tableName, whereClause = '', params = []) {
  if (!tableExists(db, tableName)) {
    return { missing: true, count: 0 };
  }
  const sql = `SELECT COUNT(*) AS count FROM ${tableName}${whereClause ? ` WHERE ${whereClause}` : ''}`;
  const row = db.prepare(sql).get(...params);
  return { missing: false, count: Number(row?.count ?? 0) };
}

function fail(message, details = {}) {
  console.error(`[assert-clean-baseline] FAIL ${message}`);
  if (Object.keys(details).length > 0) {
    console.error(JSON.stringify(details, null, 2));
  }
  process.exit(1);
}

function main() {
  const runtimePaths = resolveRuntimePaths();
  if (!fs.existsSync(runtimePaths.dbPath)) {
    fail('Canonical database file missing', { dbPath: runtimePaths.dbPath });
  }

  const db = new Database(runtimePaths.dbPath, { readonly: true });
  try {
    const adminUser = tableExists(db, 'users')
      ? db.prepare(`SELECT id, email FROM users WHERE email = 'admin@admin.com'`).get()
      : null;

    if (!adminUser) {
      fail('admin@admin.com is missing');
    }

    const nonAdminUsers = countOrMissing(db, 'users', `email != 'admin@admin.com'`);
    const nonAdminAccounts = countOrMissing(db, 'accounts', `account_type != 'admin'`);
    const jobs = countOrMissing(db, 'jobs');
    const uploadSessions = countOrMissing(db, 'upload_sessions');
    const sessions = countOrMissing(db, 'sessions');
    const nodes = countOrMissing(db, 'nodes');
    const edges = countOrMissing(db, 'edges');
    const nonSeedNodes = countOrMissing(
      db,
      'nodes',
      `kind NOT IN ('AccountNode', 'Principal', 'UserNode', 'AgentNode')`
    );
    const nonSeedEdges = countOrMissing(
      db,
      'edges',
      `
      id IN (
        SELECT e.id
        FROM edges e
        LEFT JOIN nodes src ON src.id = e.from_id AND src.account_id = e.account_id
        LEFT JOIN nodes dst ON dst.id = e.to_id AND dst.account_id = e.account_id
        WHERE src.id IS NULL
           OR dst.id IS NULL
           OR NOT (src.kind IN ('AccountNode', 'Principal', 'UserNode', 'AgentNode')
                   AND dst.kind IN ('AccountNode', 'Principal', 'UserNode', 'AgentNode'))
      )
      `
    );

    const checks = {
      nonAdminUsers: nonAdminUsers.count,
      nonAdminAccounts: nonAdminAccounts.count,
      jobs: jobs.count,
      uploadSessions: uploadSessions.count,
      sessions: sessions.count,
      nodes: nodes.count,
      edges: edges.count,
      nonSeedNodes: nonSeedNodes.count,
      nonSeedEdges: nonSeedEdges.count,
    };

    const failures = [];
    if (nonAdminUsers.count > 0) failures.push('non_admin_users_remain');
    if (nonAdminAccounts.count > 0) failures.push('non_admin_accounts_remain');
    if (jobs.count > 0) failures.push('jobs_not_empty');
    if (uploadSessions.count > 0) failures.push('upload_sessions_not_empty');
    if (sessions.count > 0) failures.push('sessions_not_empty');
    if (nonSeedNodes.count > 0) failures.push('non_seed_nodes_present');
    if (nonSeedEdges.count > 0) failures.push('non_seed_edges_present');

    if (failures.length > 0) {
      fail('Baseline assertions failed', {
        dbPath: runtimePaths.dbPath,
        failures,
        checks,
      });
    }

    console.log('[assert-clean-baseline] PASS');
    console.log(`- db: ${runtimePaths.dbPath}`);
    console.log(`- admin user: admin@admin.com`);
    console.log(
      `- residue counts: jobs=${jobs.count} upload_sessions=${uploadSessions.count} sessions=${sessions.count}`
    );
    console.log(
      `- graph counts: nodes=${nodes.count} edges=${edges.count} (non-seed nodes=${nonSeedNodes.count}, non-seed edges=${nonSeedEdges.count})`
    );
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
