import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { appLogger } from '../utils/logger';
import {
  getImportArtifactsRoot,
  getUploadChunksRoot,
  isManagedImportArtifactPath,
  isPathUnder,
} from '../utils/import-artifacts';

export interface ImportArtifactJanitorStats {
  filesDeleted: number;
  dirsDeleted: number;
  bytesFreed: number;
  scannedFiles: number;
  scannedDirs: number;
  lastRunAt: number | null;
}

export class ImportArtifactJanitorService {
  private timer: NodeJS.Timeout | null = null;
  private readonly failedRetentionMs: number;
  private readonly orphanGraceMs: number;
  private stats: ImportArtifactJanitorStats = {
    filesDeleted: 0,
    dirsDeleted: 0,
    bytesFreed: 0,
    scannedFiles: 0,
    scannedDirs: 0,
    lastRunAt: null,
  };

  constructor(
    private db: Database.Database,
    private intervalMs: number = Number.parseInt(
      process.env.IMPORT_ARTIFACT_JANITOR_INTERVAL_MS || String(60 * 60 * 1000),
      10
    )
  ) {
    this.failedRetentionMs = Number.parseInt(
      process.env.IMPORT_FAILED_ARTIFACT_RETENTION_MS || String(24 * 60 * 60 * 1000),
      10
    );
    this.orphanGraceMs = Number.parseInt(
      process.env.IMPORT_ORPHAN_ARTIFACT_GRACE_MS || String(60 * 60 * 1000),
      10
    );
  }

  start(): void {
    if (this.timer) {
      return;
    }

    appLogger.info('import.artifact_janitor.started', {
      intervalMs: this.intervalMs,
      failedRetentionMs: this.failedRetentionMs,
      orphanGraceMs: this.orphanGraceMs,
    });

    void this.runCleanup();
    this.timer = setInterval(() => {
      void this.runCleanup();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    appLogger.info('import.artifact_janitor.stopped');
  }

  getStats(): ImportArtifactJanitorStats {
    return { ...this.stats };
  }

  async runCleanup(): Promise<void> {
    const now = Date.now();
    const keepFilePaths = this.loadActiveImportArtifactPaths(now);
    const keepChunkDirs = this.loadActiveChunkDirectories(now);

    await this.cleanupImportFiles(keepFilePaths, now);
    await this.cleanupChunkDirectories(keepChunkDirs, now);

    this.stats.lastRunAt = now;
    appLogger.info('import.artifact_janitor.completed', {
      ...this.getStats(),
    });
  }

  private loadActiveImportArtifactPaths(now: number): Set<string> {
    const rows = this.db
      .prepare(
        `
        SELECT config, status, state_data
        FROM jobs
        WHERE type = 'import'
      `
      )
      .all() as Array<{ config: string; status: string; state_data: string }>;

    const keep = new Set<string>();
    for (const row of rows) {
      let config: any = {};
      let stateData: any = {};
      try {
        config = JSON.parse(row.config || '{}');
      } catch {
        config = {};
      }
      try {
        stateData = JSON.parse(row.state_data || '{}');
      } catch {
        stateData = {};
      }

      const retainedUntil = Number(stateData?.metadata?.inputFileRetainedUntil || 0);
      const shouldKeep =
        row.status === 'queued' ||
        row.status === 'running' ||
        row.status === 'blocked' ||
        (row.status === 'failed' && retainedUntil > now);
      if (!shouldKeep) {
        continue;
      }

      const files = Array.isArray(config?.files) ? config.files : [];
      for (const file of files) {
        const filePath = typeof file?.filePath === 'string' ? file.filePath : '';
        if (filePath && isManagedImportArtifactPath(filePath)) {
          keep.add(path.resolve(filePath));
        }
      }
    }

    return keep;
  }

  private loadActiveChunkDirectories(now: number): Set<string> {
    const rows = this.db
      .prepare(
        `
        SELECT chunks_path, status, expires_at
        FROM upload_sessions
      `
      )
      .all() as Array<{ chunks_path: string; status: string; expires_at: number }>;

    const keep = new Set<string>();
    for (const row of rows) {
      const active =
        (row.status === 'uploading' || row.status === 'assembling') &&
        Number(row.expires_at || 0) > now;
      if (active && row.chunks_path && isPathUnder(getUploadChunksRoot(), row.chunks_path)) {
        keep.add(path.resolve(row.chunks_path));
      }
    }

    return keep;
  }

  private async cleanupImportFiles(keepFilePaths: Set<string>, now: number): Promise<void> {
    const root = getImportArtifactsRoot();
    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const fullPath = path.join(root, entry.name);
      const resolved = path.resolve(fullPath);
      this.stats.scannedFiles++;
      if (keepFilePaths.has(resolved)) {
        continue;
      }

      try {
        const stat = await fs.stat(fullPath);
        if (now - stat.mtimeMs < this.orphanGraceMs) {
          continue;
        }
        await fs.rm(fullPath, { force: true });
        this.stats.filesDeleted++;
        this.stats.bytesFreed += stat.size;
      } catch {
        // non-fatal
      }
    }
  }

  private async cleanupChunkDirectories(keepChunkDirs: Set<string>, now: number): Promise<void> {
    const root = getUploadChunksRoot();
    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const fullPath = path.join(root, entry.name);
      const resolved = path.resolve(fullPath);
      this.stats.scannedDirs++;
      if (keepChunkDirs.has(resolved)) {
        continue;
      }

      try {
        const stat = await fs.stat(fullPath);
        if (now - stat.mtimeMs < this.orphanGraceMs) {
          continue;
        }
        await fs.rm(fullPath, { recursive: true, force: true });
        this.stats.dirsDeleted++;
      } catch {
        // non-fatal
      }
    }
  }
}
