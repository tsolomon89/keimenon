import { Request, Response, Router } from 'express';

const router = Router();

/**
 * Basic health check endpoint
 * Returns OK if the server is running, plus database connection status
 */
router.get('/', async (req: Request, res: Response) => {
  const storageMode = process.env.STORAGE_MODE || 'local';
  let dbStatus = 'unknown';

  try {
    if (global.dbClient) {
      // Try a simple query to verify database is responsive
      if (storageMode === 'local') {
        // SQLite test
        await global.dbClient.execute('SELECT 1');
        dbStatus = 'connected';
      } else {
        // Neo4j test
        await global.dbClient.execute('RETURN 1');
        dbStatus = 'connected';
      }
    }
  } catch (error) {
    dbStatus = 'disconnected';
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'canvas-memory-api',
    version: '0.1.0',
    storageMode,
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
  };

  // Test database connectivity
  try {
    if (global.dbClient) {
      const storageMode = process.env.STORAGE_MODE || 'local';
      if (storageMode === 'local') {
        await global.dbClient.execute('SELECT 1');
      } else {
        await global.dbClient.execute('RETURN 1');
      }
      modules.database.responsive = true;
    } else {
      modules.database.error = 'Database client not initialized';
    }
  } catch (error: any) {
    modules.database.error = error.message || 'Database connectivity test failed';
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
