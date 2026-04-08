import { Request, Response, Router } from 'express';

const router = Router();

/**
 * Basic health check endpoint
 * Returns OK if the server is running, plus database connection status
 */
router.get('/', async (req: Request, res: Response) => {
  let dbStatus = 'unknown';

  try {
    if (global.dbClient) {
      // Try a simple query to verify database is responsive
      await global.dbClient.execute('SELECT 1');
      dbStatus = 'connected';
    }
  } catch (error) {
    dbStatus = 'disconnected';
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'keimenon-api',
    version: '0.1.0',
    storageMode: 'local',
    dependencies: {
      database: dbStatus,
    },
  });
});

/**
 * Module health check endpoint
 * Validates that critical modules and services are loaded correctly
 * Helps detect HMR cache poisoning and module resolution issues
 */
router.get('/modules', async (req: Request, res: Response) => {
  const modules = {
    // Check if critical services are initialized
    database: {
      loaded: !!global.dbClient,
      responsive: false,
      error: null as string | null,
    },
    auth: {
      loaded: !!(global as any).authService,
      error: null as string | null,
    },
    storage: {
      loaded: !!(global as any).storageService,
      error: null as string | null,
    },
    workerPool: {
      loaded: !!(global as any).workerPool,
      error: null as string | null,
    },
    jobRepository: {
      loaded: !!(global as any).jobRepository,
      error: null as string | null,
    },
    settingsSchema: {
      loaded: false,
      responsive: false,
      error: null as string | null,
      details: null as {
        missingTables: string[];
        missingColumns: string[];
      } | null,
    },
  };

  // Test database connectivity
  try {
    if (global.dbClient) {
      await global.dbClient.execute('SELECT 1');
      modules.database.responsive = true;
    } else {
      modules.database.error = 'Database client not initialized';
    }
  } catch (error: any) {
    modules.database.error = error.message || 'Database connectivity test failed';
  }

  // Check settings/tooling schema objects for explicit diagnostics.
  try {
    const sqlite = (global.dbClient as any)?.getDatabase?.();
    if (sqlite && typeof sqlite.prepare === 'function') {
      const hasTable = (tableName: string) =>
        !!sqlite
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
          .get(tableName);
      const hasColumn = (tableName: string, columnName: string) => {
        if (!hasTable(tableName)) return false;
        const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
          name: string;
        }>;
        return columns.some((column) => column.name === columnName);
      };

      const requiredTables = ['account_api_keys', 'account_ai_settings'];
      const missingTables = requiredTables.filter((tableName) => !hasTable(tableName));
      const missingColumns: string[] = [];

      if (hasTable('account_ai_settings') && !hasColumn('account_ai_settings', 'litellm_url')) {
        missingColumns.push('account_ai_settings.litellm_url');
      }
      if (hasTable('account_ai_settings') && !hasColumn('account_ai_settings', 'searxng_url')) {
        missingColumns.push('account_ai_settings.searxng_url');
      }

      modules.settingsSchema.details = { missingTables, missingColumns };
      modules.settingsSchema.loaded = missingTables.length === 0 && missingColumns.length === 0;
      modules.settingsSchema.responsive = modules.settingsSchema.loaded;

      if (!modules.settingsSchema.loaded) {
        modules.settingsSchema.error =
          'Settings schema drift detected. Run npm run settings:schema:repair';
      }
    } else {
      modules.settingsSchema.error = 'Database client does not expose SQLite handle';
    }
  } catch (error: any) {
    modules.settingsSchema.error = error.message || 'Settings schema check failed';
  }

  // Determine overall health
  const allModulesLoaded = Object.values(modules).every((m) => m.loaded);
  const dbHealthy = modules.database.loaded && modules.database.responsive;
  const healthy = allModulesLoaded && dbHealthy;

  // Return 503 if modules aren't healthy (fail fast for tests)
  const statusCode = healthy ? 200 : 503;

  res.status(statusCode).json({
    healthy,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    modules,
    issues: !healthy
      ? Object.entries(modules)
          .filter(([_, status]) => !status.loaded || status.error)
          .map(([name, status]) => ({
            module: name,
            issue: !status.loaded ? 'Not loaded' : status.error,
          }))
      : [],
  });
});

export default router;
