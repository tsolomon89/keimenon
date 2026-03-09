import { promises as fs } from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getImportArtifactsRoot, getUploadChunksRoot } from '../utils/import-artifacts';

const CORE_PROCESS_VERSION = '3';
const RESET_TABLES = [
  'agent_artifacts',
  'agent_runs',
  'agent_tasks',
  'job_events',
  'job_items',
  'job_change_pages',
  'jobs',
  'upload_sessions',
  'edges',
  'nodes',
];

type MetadataRow = { value?: string };
type CountRow = { count?: number };
type NameRow = { name?: string };

export interface CoreProcessGateResult {
  applied: boolean;
  requiresReimport: boolean;
  reason: 'disabled' | 'skipped_test' | 'already_current' | 'fresh_database' | 'reset_completed';
  backupPath?: string;
}

export async function runCoreProcessVersionGate(
  db: Database.Database
): Promise<CoreProcessGateResult> {
  if (process.env.CORE_PROCESS_GATE_ENABLED === 'false') {
    return { applied: false, requiresReimport: false, reason: 'disabled' };
  }

  if (process.env.NODE_ENV === 'test') {
    return { applied: false, requiresReimport: false, reason: 'skipped_test' };
  }

  const currentVersion = getMetadata(db, 'core_process_version');
  if (currentVersion === CORE_PROCESS_VERSION) {
    return {
      applied: false,
      requiresReimport: getMetadata(db, 'core_process_reimport_required') === '1',
      reason: 'already_current',
    };
  }

  const processDataCount = getProcessDataCount(db);
  if (processDataCount === 0) {
    setMetadata(db, 'core_process_version', CORE_PROCESS_VERSION);
    setMetadata(db, 'core_process_reimport_required', '0');
    setMetadata(db, 'core_process_last_reset_at', new Date().toISOString());
    setMetadata(db, 'core_process_previous_version', currentVersion || 'none');
    return { applied: true, requiresReimport: false, reason: 'fresh_database' };
  }

  const backupPath = await createBackup(db);
  resetProcessData(db);
  await purgeImportArtifacts();

  setMetadata(db, 'core_process_version', CORE_PROCESS_VERSION);
  setMetadata(db, 'core_process_reimport_required', '1');
  setMetadata(db, 'core_process_last_reset_at', new Date().toISOString());
  setMetadata(db, 'core_process_previous_version', currentVersion || 'none');
  if (backupPath) {
    setMetadata(db, 'core_process_backup_path', backupPath);
  }

  return {
    applied: true,
    requiresReimport: true,
    reason: 'reset_completed',
    backupPath: backupPath || undefined,
  };
}

function getMetadata(db: Database.Database, key: string): string | null {
  const row = db.prepare(`SELECT value FROM schema_metadata WHERE key = ?`).get(key) as
    | MetadataRow
    | undefined;
  return row?.value ?? null;
}

function setMetadata(db: Database.Database, key: string, value: string): void {
  db.prepare(`INSERT OR REPLACE INTO schema_metadata (key, value) VALUES (?, ?)`).run(key, value);
}

function getProcessDataCount(db: Database.Database): number {
  const tables = getExistingTables(db);
  const countables = ['nodes', 'edges', 'jobs', 'upload_sessions', 'agent_tasks'].filter((table) =>
    tables.has(table)
  );

  return countables.reduce((total, table) => {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as CountRow | undefined;
    return total + (row?.count ?? 0);
  }, 0);
}

function getExistingTables(db: Database.Database): Set<string> {
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as NameRow[];
  return new Set(rows.map((row) => row.name).filter(Boolean) as string[]);
}

function resetProcessData(db: Database.Database): void {
  const existing = getExistingTables(db);
  const tx = db.transaction(() => {
    for (const table of RESET_TABLES) {
      if (!existing.has(table)) {
        continue;
      }
      db.prepare(`DELETE FROM ${table}`).run();
    }
  });

  tx();
}

async function createBackup(db: Database.Database): Promise<string | null> {
  const dbPath = getDatabasePath(db);
  if (!dbPath) {
    return null;
  }

  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // Non-fatal: best-effort checkpoint.
  }

  const backupDir = path.join(path.dirname(dbPath), 'backups');
  await fs.mkdir(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDbPath = path.join(
    backupDir,
    `core-process-v${CORE_PROCESS_VERSION}-${timestamp}.db`
  );
  await fs.copyFile(dbPath, backupDbPath);

  await backupArtifacts(backupDir, timestamp);
  return backupDbPath;
}

function getDatabasePath(db: Database.Database): string | null {
  const dbPath = (db as any).name as string | undefined;
  if (!dbPath || dbPath === ':memory:' || dbPath.startsWith('file:')) {
    return null;
  }
  return dbPath;
}

async function backupArtifacts(backupDir: string, timestamp: string): Promise<void> {
  const artifactRoots = [
    { source: getImportArtifactsRoot(), name: `import-artifacts-${timestamp}` },
    { source: getUploadChunksRoot(), name: `upload-chunks-${timestamp}` },
  ];

  for (const root of artifactRoots) {
    try {
      await fs.access(root.source);
      await fs.cp(root.source, path.join(backupDir, root.name), { recursive: true });
    } catch {
      // Ignore missing artifacts.
    }
  }
}

async function purgeImportArtifacts(): Promise<void> {
  const roots = [getImportArtifactsRoot(), getUploadChunksRoot()];
  for (const root of roots) {
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(root, { recursive: true });
  }
}
