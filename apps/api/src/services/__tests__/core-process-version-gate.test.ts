import { mkdtemp, mkdir, rm, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

const artifactRoots = {
  importRoot: '',
  uploadRoot: '',
};

vi.mock('../../utils/import-artifacts', () => ({
  getImportArtifactsRoot: () => artifactRoots.importRoot,
  getUploadChunksRoot: () => artifactRoots.uploadRoot,
}));

import { runCoreProcessVersionGate } from '../core-process-version-gate';

type MetadataRow = { value?: string };
type CountRow = { count?: number };

const cleanupDirs: string[] = [];

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, account_id TEXT);
    CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY, account_id TEXT);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE IF NOT EXISTS upload_sessions (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE IF NOT EXISTS agent_tasks (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE IF NOT EXISTS job_events (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS job_items (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS job_change_pages (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS agent_artifacts (id TEXT PRIMARY KEY);

    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS user_settings (id TEXT PRIMARY KEY, key TEXT, value TEXT);
  `);
}

function getMetadata(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM schema_metadata WHERE key = ?').get(key) as
    | MetadataRow
    | undefined;
  return row?.value ?? null;
}

function getCount(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as CountRow | undefined;
  return row?.count ?? 0;
}

async function createTempDb(): Promise<{ db: Database.Database; dir: string; dbPath: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'core-process-gate-test-'));
  cleanupDirs.push(dir);
  const dbPath = path.join(dir, 'keimenon.db');
  const db = new Database(dbPath);
  createSchema(db);
  return { db, dir, dbPath };
}

afterEach(async () => {
  delete process.env.CORE_PROCESS_GATE_ENABLED;
  delete process.env.NODE_ENV;
  artifactRoots.importRoot = '';
  artifactRoots.uploadRoot = '';

  for (const dir of cleanupDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('runCoreProcessVersionGate', () => {
  it('returns disabled when gate is explicitly turned off', async () => {
    process.env.CORE_PROCESS_GATE_ENABLED = 'false';
    process.env.NODE_ENV = 'development';

    const { db } = await createTempDb();
    try {
      const result = await runCoreProcessVersionGate(db);
      expect(result).toEqual({
        applied: false,
        requiresReimport: false,
        reason: 'disabled',
      });
    } finally {
      db.close();
    }
  });

  it('skips when NODE_ENV is test', async () => {
    process.env.NODE_ENV = 'test';

    const { db } = await createTempDb();
    try {
      const result = await runCoreProcessVersionGate(db);
      expect(result).toEqual({
        applied: false,
        requiresReimport: false,
        reason: 'skipped_test',
      });
    } finally {
      db.close();
    }
  });

  it('marks a fresh database as current without requiring reimport', async () => {
    process.env.NODE_ENV = 'development';

    const { db } = await createTempDb();
    try {
      db.prepare('INSERT INTO accounts (id, name) VALUES (?, ?)').run('acc_1', 'Primary Account');
      db.prepare('INSERT INTO user_settings (id, key, value) VALUES (?, ?, ?)').run(
        'us_1',
        'theme',
        'dark'
      );

      const result = await runCoreProcessVersionGate(db);

      expect(result.applied).toBe(true);
      expect(result.requiresReimport).toBe(false);
      expect(result.reason).toBe('fresh_database');
      expect(getMetadata(db, 'core_process_version')).toBe('3');
      expect(getMetadata(db, 'core_process_reimport_required')).toBe('0');
      expect(getMetadata(db, 'core_process_previous_version')).toBe('none');
      expect(getMetadata(db, 'core_process_last_reset_at')).toBeTruthy();
      expect(getCount(db, 'accounts')).toBe(1);
      expect(getCount(db, 'user_settings')).toBe(1);
    } finally {
      db.close();
    }
  });

  it('returns already_current and preserves reimport-required state', async () => {
    process.env.NODE_ENV = 'development';

    const { db } = await createTempDb();
    try {
      db.prepare('INSERT INTO schema_metadata (key, value) VALUES (?, ?)').run(
        'core_process_version',
        '3'
      );
      db.prepare('INSERT INTO schema_metadata (key, value) VALUES (?, ?)').run(
        'core_process_reimport_required',
        '1'
      );

      const result = await runCoreProcessVersionGate(db);

      expect(result).toEqual({
        applied: false,
        requiresReimport: true,
        reason: 'already_current',
      });
    } finally {
      db.close();
    }
  });

  it('backs up and resets process artifacts while preserving account/settings data', async () => {
    process.env.NODE_ENV = 'development';

    const { db, dir } = await createTempDb();
    const importArtifactsRoot = path.join(dir, 'import-artifacts');
    const uploadChunksRoot = path.join(dir, 'upload-chunks');
    artifactRoots.importRoot = importArtifactsRoot;
    artifactRoots.uploadRoot = uploadChunksRoot;

    try {
      await mkdir(importArtifactsRoot, { recursive: true });
      await mkdir(uploadChunksRoot, { recursive: true });
      await writeFile(path.join(importArtifactsRoot, 'artifact.txt'), 'import-payload', 'utf8');
      await writeFile(path.join(uploadChunksRoot, 'chunk.bin'), 'chunk-bytes', 'utf8');

      db.prepare('INSERT INTO schema_metadata (key, value) VALUES (?, ?)').run(
        'core_process_version',
        '2'
      );

      db.prepare('INSERT INTO accounts (id, name) VALUES (?, ?)').run('acc_1', 'Primary Account');
      db.prepare('INSERT INTO user_settings (id, key, value) VALUES (?, ?, ?)').run(
        'us_1',
        'language',
        'en'
      );

      db.prepare('INSERT INTO nodes (id, account_id) VALUES (?, ?)').run('node_1', 'acc_1');
      db.prepare('INSERT INTO edges (id, account_id) VALUES (?, ?)').run('edge_1', 'acc_1');
      db.prepare('INSERT INTO jobs (id, status) VALUES (?, ?)').run('job_1', 'running');
      db.prepare('INSERT INTO upload_sessions (id, status) VALUES (?, ?)').run('up_1', 'uploading');
      db.prepare('INSERT INTO agent_tasks (id, status) VALUES (?, ?)').run('task_1', 'running');
      db.prepare('INSERT INTO job_events (id) VALUES (?)').run('evt_1');
      db.prepare('INSERT INTO job_items (id) VALUES (?)').run('item_1');
      db.prepare('INSERT INTO job_change_pages (id) VALUES (?)').run('page_1');
      db.prepare('INSERT INTO agent_runs (id) VALUES (?)').run('run_1');
      db.prepare('INSERT INTO agent_artifacts (id) VALUES (?)').run('art_1');

      const result = await runCoreProcessVersionGate(db);

      expect(result.applied).toBe(true);
      expect(result.reason).toBe('reset_completed');
      expect(result.requiresReimport).toBe(true);
      expect(result.backupPath).toBeTruthy();
      expect(getMetadata(db, 'core_process_version')).toBe('3');
      expect(getMetadata(db, 'core_process_reimport_required')).toBe('1');
      expect(getMetadata(db, 'core_process_previous_version')).toBe('2');
      expect(getMetadata(db, 'core_process_backup_path')).toBe(result.backupPath);
      expect(getMetadata(db, 'core_process_last_reset_at')).toBeTruthy();

      expect(getCount(db, 'nodes')).toBe(0);
      expect(getCount(db, 'edges')).toBe(0);
      expect(getCount(db, 'jobs')).toBe(0);
      expect(getCount(db, 'upload_sessions')).toBe(0);
      expect(getCount(db, 'agent_tasks')).toBe(0);
      expect(getCount(db, 'job_events')).toBe(0);
      expect(getCount(db, 'job_items')).toBe(0);
      expect(getCount(db, 'job_change_pages')).toBe(0);
      expect(getCount(db, 'agent_runs')).toBe(0);
      expect(getCount(db, 'agent_artifacts')).toBe(0);

      expect(getCount(db, 'accounts')).toBe(1);
      expect(getCount(db, 'user_settings')).toBe(1);

      const backupPath = result.backupPath as string;
      const backupStat = await stat(backupPath);
      expect(backupStat.isFile()).toBe(true);

      const backupDb = new Database(backupPath, { readonly: true });
      try {
        expect(getCount(backupDb, 'nodes')).toBe(1);
        expect(getCount(backupDb, 'jobs')).toBe(1);
      } finally {
        backupDb.close();
      }

      const backupDir = path.dirname(backupPath);
      const backupEntries = await readdir(backupDir);
      expect(backupEntries.some((entry) => entry.startsWith('import-artifacts-'))).toBe(true);
      expect(backupEntries.some((entry) => entry.startsWith('upload-chunks-'))).toBe(true);

      expect(await readdir(importArtifactsRoot)).toEqual([]);
      expect(await readdir(uploadChunksRoot)).toEqual([]);
    } finally {
      db.close();
    }
  });
});
