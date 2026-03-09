import { Router, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import type { AuthServiceV2 } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';

type MetadataRow = { value?: string };

function getDatabase(): Database.Database {
  const dbClient = global.dbClient as any;
  if (!dbClient) {
    throw new Error('Database client not initialized');
  }

  if (dbClient.db) {
    return dbClient.db as Database.Database;
  }

  if (typeof dbClient.getDatabase === 'function') {
    return dbClient.getDatabase() as Database.Database;
  }

  throw new Error('Database handle unavailable');
}

function getMetadata(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM schema_metadata WHERE key = ?').get(key) as
    | MetadataRow
    | undefined;
  return row?.value ?? null;
}

function setMetadata(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO schema_metadata (key, value) VALUES (?, ?)').run(key, value);
}

export function createSystemRoutes(authService: AuthServiceV2): Router {
  const router = Router();
  router.use(requireAuth(authService));

  router.get('/reimport-status', (_req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const requiresReimport = getMetadata(db, 'core_process_reimport_required') === '1';

      return res.json({
        requiresReimport,
        version: getMetadata(db, 'core_process_version'),
        lastResetAt: getMetadata(db, 'core_process_last_reset_at'),
        backupPath: getMetadata(db, 'core_process_backup_path'),
      });
    } catch (error: any) {
      return res.status(503).json({ error: error.message || 'System status unavailable' });
    }
  });

  router.post('/reimport-complete', (_req: Request, res: Response) => {
    try {
      const db = getDatabase();
      setMetadata(db, 'core_process_reimport_required', '0');
      setMetadata(db, 'core_process_reimport_completed_at', new Date().toISOString());
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(503).json({ error: error.message || 'Failed to update reimport status' });
    }
  });

  return router;
}
