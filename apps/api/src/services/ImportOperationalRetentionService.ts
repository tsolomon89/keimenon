import Database from 'better-sqlite3';
import { appLogger } from '../utils/logger';

export interface ImportOperationalRetentionStats {
  runs: number;
  lastRunAt: number | null;
  jobEventsDeleted: number;
  terminalJobsCompacted: number;
  lastError?: string;
}

interface RetentionOptions {
  intervalMs?: number;
  retentionMs?: number;
  maxTerminalRowsPerRun?: number;
}

export class ImportOperationalRetentionService {
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly retentionMs: number;
  private readonly maxTerminalRowsPerRun: number;
  private stats: ImportOperationalRetentionStats = {
    runs: 0,
    lastRunAt: null,
    jobEventsDeleted: 0,
    terminalJobsCompacted: 0,
  };

  constructor(
    private db: Database.Database,
    options: RetentionOptions = {}
  ) {
    this.intervalMs =
      options.intervalMs ??
      Number.parseInt(process.env.IMPORT_RETENTION_INTERVAL_MS || String(60 * 60 * 1000), 10);
    this.retentionMs =
      options.retentionMs ??
      Number.parseInt(process.env.IMPORT_RETENTION_MS || String(30 * 24 * 60 * 60 * 1000), 10);
    this.maxTerminalRowsPerRun =
      options.maxTerminalRowsPerRun ??
      Number.parseInt(process.env.IMPORT_RETENTION_MAX_ROWS_PER_RUN || '200', 10);
  }

  start(): void {
    if (this.timer) {
      return;
    }

    appLogger.info('import.retention.started', {
      intervalMs: this.intervalMs,
      retentionMs: this.retentionMs,
      maxTerminalRowsPerRun: this.maxTerminalRowsPerRun,
    });

    void this.runRetention();
    this.timer = setInterval(() => {
      void this.runRetention();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    appLogger.info('import.retention.stopped');
  }

  getStats(): ImportOperationalRetentionStats {
    return { ...this.stats };
  }

  async runRetention(): Promise<void> {
    const now = Date.now();
    const cutoff = now - this.retentionMs;

    try {
      const deleteEvents = this.db.prepare('DELETE FROM job_events WHERE timestamp < ?');
      const deleteResult = deleteEvents.run(cutoff);
      this.stats.jobEventsDeleted += deleteResult.changes;

      const terminalRows = this.db
        .prepare(
          `
          SELECT id, account_id, state_data
          FROM jobs
          WHERE type = 'import'
            AND status IN ('succeeded', 'failed', 'canceled')
            AND updated_at < ?
          ORDER BY updated_at ASC
          LIMIT ?
        `
        )
        .all(cutoff, this.maxTerminalRowsPerRun) as Array<{
        id: string;
        account_id: string;
        state_data: string;
      }>;

      const updateState = this.db.prepare(`
        UPDATE jobs
        SET state_data = ?, updated_at = ?
        WHERE id = ? AND account_id = ?
      `);

      for (const row of terminalRows) {
        let stateData: any = null;
        try {
          stateData = JSON.parse(row.state_data || '{}');
        } catch {
          continue;
        }

        let changed = false;
        if (stateData?.checkpoint) {
          delete stateData.checkpoint;
          changed = true;
        }

        if (stateData?.changeTracker) {
          const tracker = stateData.changeTracker;
          stateData.changeTrackerSummary = {
            nodesCreatedCount: Array.isArray(tracker.nodesCreated)
              ? tracker.nodesCreated.length
              : 0,
            edgesCreatedCount: Array.isArray(tracker.edgesCreated)
              ? tracker.edgesCreated.length
              : 0,
            nodesDeletedCount: Array.isArray(tracker.nodesDeleted)
              ? tracker.nodesDeleted.length
              : 0,
            edgesDeletedCount: Array.isArray(tracker.edgesDeleted)
              ? tracker.edgesDeleted.length
              : 0,
          };
          delete stateData.changeTracker;
          changed = true;
        }

        if (Array.isArray(stateData?.metadata?.inputFilesDeleted)) {
          stateData.metadata.inputFilesDeletedCount = stateData.metadata.inputFilesDeleted.length;
          delete stateData.metadata.inputFilesDeleted;
          changed = true;
        }

        if (!changed) {
          continue;
        }

        stateData.metadata = {
          ...(stateData.metadata || {}),
          retentionCompactedAt: new Date(now).toISOString(),
        };

        updateState.run(JSON.stringify(stateData), now, row.id, row.account_id);
        this.stats.terminalJobsCompacted++;
      }

      this.stats.runs++;
      this.stats.lastRunAt = now;
      this.stats.lastError = undefined;

      appLogger.info('import.retention.completed', {
        jobEventsDeleted: deleteResult.changes,
        terminalJobsScanned: terminalRows.length,
      });
    } catch (error: any) {
      this.stats.lastError = error.message;
      appLogger.error('import.retention.failed', { error: error.message });
    }
  }
}
