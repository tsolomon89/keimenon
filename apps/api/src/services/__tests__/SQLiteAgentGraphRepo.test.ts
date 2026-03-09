import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SQLiteAgentGraphRepo } from '../agent/SQLiteAgentGraphRepo';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys = OFF;

    CREATE TABLE accounts (
      id TEXT PRIMARY KEY
    );

    CREATE TABLE users (
      id TEXT PRIMARY KEY
    );

    CREATE TABLE user_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      role_rank INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      joined_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      properties TEXT NOT NULL,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'real'
    );

    CREATE TABLE edges (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      properties TEXT,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'real'
    );
  `);

  db.prepare('INSERT INTO accounts (id) VALUES (?)').run('acc_1');
  db.prepare('INSERT INTO users (id) VALUES (?)').run('user_1');
  db.prepare(
    `
      INSERT INTO user_accounts (id, user_id, account_id, role_rank, status, joined_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run('ua_1', 'user_1', 'acc_1', 4, 'active', Date.now());

  return db;
}

describe('SQLiteAgentGraphRepo', () => {
  let db: Database.Database;
  let repo: SQLiteAgentGraphRepo;

  beforeEach(() => {
    db = createTestDb();
    repo = new SQLiteAgentGraphRepo(db);
  });

  it('creates and reuses account agent nodes', async () => {
    const first = await repo.getOrCreateAgent('acc_1');
    const second = await repo.getOrCreateAgent('acc_1');

    expect(first.id).toBe('agent-acc_1');
    expect(first.kind).toBe('AgentNode');
    expect(second.id).toBe(first.id);
  });

  it('persists task, run, and artifact lifecycle records', async () => {
    await repo.getOrCreateAgent('acc_1');

    await repo.saveTask({
      id: 'task_1',
      type: 'DUPLICATE_SUGGEST',
      account_id: 'acc_1',
      agent_id: 'agent-acc_1',
      status: 'pending',
      input: { scope: 'group', scopeId: 'grp_1' },
      config: { version: '1.0.0' },
      created_at: Date.now(),
    } as any);

    await repo.updateTaskStatus('task_1', 'running');
    await repo.saveRun({
      id: 'run_1',
      task_id: 'task_1',
      attempt: 1,
      status: 'running',
      started_at: Date.now(),
      metrics: { duration_ms: 0 },
    });
    await repo.updateRun('run_1', {
      status: 'completed',
      completed_at: Date.now(),
      metrics: { duration_ms: 12 },
    });

    await repo.saveArtifact({
      id: 'artifact_1',
      run_id: 'run_1',
      type: 'cluster_json',
      content_hash: 'abc123',
      storage_path: 'ab/abc123',
      created_at: Date.now(),
      metadata: { origin: 'test' },
    });

    await repo.updateTaskStatus('task_1', 'completed');

    const task = await repo.getTask('task_1');
    const tasks = await repo.listTasks('acc_1');
    const runs = await repo.getRuns('task_1');
    const artifacts = await repo.getArtifacts('run_1');

    expect(task?.status).toBe('completed');
    expect(tasks).toHaveLength(1);
    expect(runs[0].status).toBe('completed');
    expect(artifacts[0].type).toBe('cluster_json');
  });
});
