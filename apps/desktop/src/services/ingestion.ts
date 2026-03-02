import * as fs from 'fs';
import * as path from 'path';
import { app, BrowserWindow } from 'electron';
import log from 'electron-log';
import { DatabaseFactory, DatabaseClient } from '@keimenon/db';
import { v4 as uuidv4 } from 'uuid';

export class FileIngestionService {
  private db: DatabaseClient | null = null;

  constructor(private mainWindow: BrowserWindow) {}

  private async getDb(): Promise<DatabaseClient> {
    if (!this.db) {
      // Use correct user data path for production
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'keimenon.db');

      log.info(`[Ingest] Initializing DB at: ${dbPath}`);

      this.db = await DatabaseFactory.getClient({
        mode: 'local',
        local: {
          databasePath: dbPath,
          verbose: !app.isPackaged, // Only verbose in dev
        },
      });
    }
    return this.db;
  }

  async ingestFile(filePath: string): Promise<void> {
    try {
      log.info(`[Ingest] Starting ingestion job for: ${filePath}`);

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);
      const fileSize = stats.size;

      // Get DB Connection
      const db = await this.getDb();

      // 1. Get Account ID (Desktop Single User Mode)
      // Try to find the first account, or default to 'admin'/system
      let accountId = 'admin';
      try {
        const result = await (db as any).execute('SELECT id FROM accounts LIMIT 1');
        if (result && result.records && result.records.length > 0) {
          accountId = result.records[0].id;
        }
      } catch (err) {
        log.warn('[Ingest] Could not fetch accounts, defaulting to "admin"', err);
      }

      // 2. Create Job Record
      const jobId = uuidv4();
      const now = Date.now();

      const jobConfig = {
        files: [
          {
            filePath,
            fileName,
            fileSize,
            mimeType: 'application/json', // Assume JSON for now
          },
        ],
        importOptions: {
          processingMode: 'automatic',
          duplicateDetection: { enabled: true },
        },
      };

      // Insert directly into 'jobs' table
      // This shares the DB with the embedded API server, so the WorkerPool will pick it up.
      const insertSql = `
                INSERT INTO jobs (
                    id, type, account_id, created_by, config, status, 
                    state_data, created_at, updated_at, data_tag
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

      await db.execute(insertSql, [
        jobId,
        'import',
        accountId,
        'desktop-user', // created_by
        JSON.stringify(jobConfig),
        'queued', // Initial status
        JSON.stringify({ progress: 0 }),
        now,
        now,
        'real',
      ]);

      log.info(`[Ingest] Job created: ${jobId}`);

      // 3. Notify UI immediately
      this.sendProgress('queued', 0, 'Job queued for processing...');

      // The polling hook in UI (useJobStream) should pick up the job via SSE from API
      // But we can also send a specialized event if needed.
    } catch (err: unknown) {
      log.error('[Ingest] Failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.sendProgress('error', 0, `Failed: ${errorMessage}`);
      throw err;
    }
  }

  private sendProgress(stage: string, percent: number, message: string) {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('ingest:progress', { stage, percent, message });
    }
  }
}
