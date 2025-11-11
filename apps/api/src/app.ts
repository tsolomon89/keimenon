/**
 * Express App Configuration
 *
 * Separates app creation from server lifecycle for testability.
 * This module creates and configures the Express app without starting the server.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import { requireAuth, requirePermission, isolateByAccount } from './middleware/auth.middleware';
import {
  configureCors,
  configureHelmet,
  addCustomSecurityHeaders,
} from './middleware/security.middleware';
import { errorLogger, notFoundHandler } from './middleware/error-handler.middleware';
import { initSentry, addSentryErrorHandler } from './services/sentry.service';
import ingestRoutes, { setAuthDependencies as setIngestAuthDeps } from './routes/ingest';
import nodesRoutes, { setAuthDependencies as setNodesAuthDeps } from './routes/nodes';
import boardsRoutes, { setAuthDependencies as setBoardsAuthDeps } from './routes/boards';
import edgesRoutes, { setAuthDependencies as setEdgesAuthDeps } from './routes/edges';
import { createImportDecisionsRoutes } from './routes/import-decisions';
import { createImportEnhancedRoutes } from './routes/import-enhanced';
import contentRoutes, { setAuthDependencies as setContentAuthDeps } from './routes/content';
import configRoutes from './routes/config';
import { createDuplicatesRoutes } from './routes/duplicates';
import reviewQueueRoutes from './routes/review-queue.routes';
import clusterRoutes from './routes/cluster.routes';
import { createAuthRoutes } from './routes/auth.routes';
import { createAccountsRoutes } from './routes/accounts.routes';
import { createUsersRoutes } from './routes/users.routes';
import { createAnalyticsRoutes } from './routes/analytics.routes';
import { createGroupsRoutes } from './routes/groups.routes';
import { createSettingsRoutes } from './routes/settings.routes';
import { createAdminRoutes } from './routes/admin.routes';
import { createDataManagementRoutes } from './routes/data-management';
import { createDeduplicationRoutes } from './routes/deduplication';
import { createJobsRoutes } from './modules/jobs/infrastructure/jobs.routes';
import { createStreamRoutes } from './modules/jobs/infrastructure/stream.routes';
import { createImportJobsRoutes as createJobBasedImportRoutes } from './modules/jobs/infrastructure/import-jobs.routes';
import { createTestHelperRoutes } from './routes/test-helpers';
import { SSEBroadcaster } from './modules/jobs/infrastructure/SSEBroadcaster';
import { WorkerPool } from './modules/workers/domain/WorkerPool';
import { DatabaseWriteQueue } from './services/DatabaseWriteQueue';
import { AuthService } from './services/auth.service';
import { testIsolationMiddleware } from './middleware/test-isolation.middleware';
import { dbContextMiddleware } from './middleware/db-context.middleware';

/**
 * App context holds initialized services
 */
export interface AppContext {
  app: Express;
  authService: AuthService | null;
  sseBroadcaster: SSEBroadcaster | null;
  writeQueue: DatabaseWriteQueue | null;
  workerPool: WorkerPool | null;
  isReady: boolean;
}

/**
 * Create and configure Express app
 */
export function createApp(): { app: Express; context: AppContext } {
  const app: Express = express();

  // Initialize Sentry (MUST be before all other middleware)
  initSentry(app);

  // Security Middleware
  app.use(configureHelmet());
  app.use(configureCors());
  app.use(addCustomSecurityHeaders());

  // Body parsing
  // Skip JSON/urlencoded parsing for import routes (they use multipart/form-data with busboy)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/v1/import') || req.path.startsWith('/api/import')) {
      return next(); // Skip body parsing for import routes
    }
    return express.json({ limit: '10mb' })(req, res, next);
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/v1/import') || req.path.startsWith('/api/import')) {
      return next(); // Skip body parsing for import routes
    }
    return express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
  });

  // Test isolation (only active in test environment)
  if (process.env.NODE_ENV === 'test') {
    app.use(testIsolationMiddleware);
    app.use(dbContextMiddleware);
    console.log('🧪 Test isolation middleware enabled - using per-worker databases');
  }

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${req.method} ${req.path}`);
    return next();
  });

  // Context to hold services
  const context: AppContext = {
    app,
    authService: null,
    sseBroadcaster: null,
    writeQueue: null,
    workerPool: null,
    isReady: false,
  };

  // Health check
  app.get('/health', async (req: Request, res: Response) => {
    const storageMode = process.env.STORAGE_MODE || 'local';
    let dbStatus = 'unknown';

    try {
      if (global.dbClient) {
        if (storageMode === 'local') {
          await global.dbClient.execute('SELECT 1');
          dbStatus = 'connected';
        } else {
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

  // Readiness check
  app.get('/ready', async (req: Request, res: Response) => {
    const checks = {
      server: context.isReady,
      database: false,
      storage: false,
      memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024,
    };

    try {
      if (global.dbClient) {
        const storageMode = process.env.STORAGE_MODE || 'local';
        if (storageMode === 'local') {
          await global.dbClient.execute('SELECT 1');
        } else {
          await global.dbClient.execute('RETURN 1');
        }
        checks.database = true;
      }
    } catch (error) {
      // Database not ready
    }

    checks.storage = true; // Simplified for now

    const ready = Object.values(checks).every((c) => c);
    const statusCode = ready ? 200 : 503;

    res.status(statusCode).json({
      ready,
      checks,
      storageMode: process.env.STORAGE_MODE || 'local',
      timestamp: new Date().toISOString(),
    });
  });

  // API routes
  app.get('/api/v1', (req: Request, res: Response) => {
    res.json({
      message: 'Canvas Memory OS API v1',
      version: '0.1.0',
      endpoints: {
        auth: {
          login: 'POST /api/v1/auth/login',
          registerGoogle: 'POST /api/v1/auth/register/google',
          logout: 'POST /api/v1/auth/logout',
          me: 'GET /api/v1/auth/me',
          verify: 'POST /api/v1/auth/verify',
        },
        // ... (other endpoints omitted for brevity)
      },
    });
  });

  // Route placeholders (will be initialized by initializeRoutes)
  let authRoutes: any = null;
  let accountsRoutes: any = null;
  let usersRoutes: any = null;
  let analyticsRoutes: any = null;
  let groupsNavigationRoutes: any = null;
  let settingsRoutes: any = null;
  let adminRoutes: any = null;
  let importEnhancedRoutes: any = null;
  let importDecisionsRoutes: any = null;
  let dataManagementRoutes: any = null;
  let deduplicationRoutes: any = null;
  let duplicatesRoutes: any = null;
  let jobsRoutes: any = null;
  let streamRoutes: any = null;
  let jobBasedImportRoutes: any = null;
  let testHelperRoutes: any = null;

  // Initialize routes with services
  const initializeRoutes = (
    authService: AuthService,
    sseBroadcaster: SSEBroadcaster,
    workerPool: WorkerPool,
    writeQueue: DatabaseWriteQueue
  ) => {
    const dbClient = global.dbClient as any;

    authRoutes = createAuthRoutes(authService);
    accountsRoutes = createAccountsRoutes(dbClient, authService);
    usersRoutes = createUsersRoutes(dbClient, authService);
    analyticsRoutes = createAnalyticsRoutes(dbClient, authService);
    groupsNavigationRoutes = createGroupsRoutes(dbClient, authService);
    settingsRoutes = createSettingsRoutes(dbClient, authService);
    adminRoutes = createAdminRoutes(dbClient, authService);
    importEnhancedRoutes = createImportEnhancedRoutes(authService);
    importDecisionsRoutes = createImportDecisionsRoutes(dbClient, authService);
    dataManagementRoutes = createDataManagementRoutes(dbClient, authService);
    deduplicationRoutes = createDeduplicationRoutes(dbClient, authService);
    duplicatesRoutes = createDuplicatesRoutes(dbClient, authService);
    jobsRoutes = createJobsRoutes(authService, dbClient.db, sseBroadcaster);
    streamRoutes = createStreamRoutes(authService, sseBroadcaster);
    jobBasedImportRoutes = createJobBasedImportRoutes(authService, dbClient.db, workerPool);
    testHelperRoutes = createTestHelperRoutes(dbClient);

    // Inject auth dependencies
    setNodesAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setEdgesAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setBoardsAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setContentAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setIngestAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);

    // Debug endpoints for write queue
    app.get('/api/v1/debug/queue/status', (req: Request, res: Response) => {
      if (!writeQueue) {
        return res.status(503).json({ error: 'Write queue not initialized' });
      }

      res.json({
        queue: writeQueue.getQueueSizes(),
        stats: writeQueue.getStats(),
        circuitBreaker: {
          isOpen: writeQueue.isCircuitOpen(),
          ...writeQueue.getErrorMetrics(),
        },
        deadLetterQueue: {
          count: writeQueue.getDeadLetterQueue().length,
          items: writeQueue.getDeadLetterQueue().slice(0, 10),
        },
      });
    });

    app.post('/api/v1/debug/queue/reset-circuit', (req: Request, res: Response) => {
      if (!writeQueue) {
        return res.status(503).json({ error: 'Write queue not initialized' });
      }

      try {
        writeQueue.resetCircuitBreaker();
        res.json({
          success: true,
          message: 'Circuit breaker reset successfully',
          isOpen: writeQueue.isCircuitOpen(),
        });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  };

  // Store initializeRoutes for later use
  (context as any).initializeRoutes = initializeRoutes;

  // Dynamic route handlers (deferred until services initialize)
  app.use('/api/v1/auth', (req, res, next) => {
    if (authRoutes) return authRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  app.use('/api/v1/accounts', (req, res, next) => {
    if (accountsRoutes) return accountsRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  app.use('/api/v1/users', (req, res, next) => {
    if (usersRoutes) return usersRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  app.use('/api/v1/analytics', (req, res, next) => {
    if (analyticsRoutes) return analyticsRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  app.use('/api/v1/groups', (req, res, next) => {
    if (groupsNavigationRoutes) return groupsNavigationRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  app.use('/api/v1/settings', (req, res, next) => {
    if (settingsRoutes) return settingsRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  app.use('/api/v1/admin', (req, res, next) => {
    if (adminRoutes) return adminRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  app.use('/api/v1/data', (req, res, next) => {
    if (dataManagementRoutes) return dataManagementRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  app.use('/api/v1/deduplication', (req, res, next) => {
    if (deduplicationRoutes) return deduplicationRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  app.use('/api/v1/stream', (req, res, next) => {
    if (streamRoutes) return streamRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  // Job-based import routes (must come before general /api/v1/jobs)
  app.use('/api/v1/jobs', (req, res, next) => {
    if (jobBasedImportRoutes) return jobBasedImportRoutes(req, res, next);
    return next();
  });

  // General jobs API routes
  app.use('/api/v1/jobs', (req, res, next) => {
    if (jobsRoutes) return jobsRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  // Auth-protected data routes
  app.use('/api/v1/nodes', (req, res, next) => {
    if (!context.authService)
      return res.status(503).json({ error: 'Auth service not initialized' });
    return nodesRoutes(req, res, next);
  });

  app.use('/api/v1/edges', (req, res, next) => {
    if (!context.authService)
      return res.status(503).json({ error: 'Auth service not initialized' });
    return edgesRoutes(req, res, next);
  });

  app.use('/api/v1/boards', (req, res, next) => {
    if (!context.authService)
      return res.status(503).json({ error: 'Auth service not initialized' });
    return boardsRoutes(req, res, next);
  });

  app.use('/api/v1/content', (req, res, next) => {
    if (!context.authService)
      return res.status(503).json({ error: 'Auth service not initialized' });
    return contentRoutes(req, res, next);
  });

  app.use('/api/v1/ingest', (req, res, next) => {
    if (!context.authService)
      return res.status(503).json({ error: 'Auth service not initialized' });
    return ingestRoutes(req, res, next);
  });

  app.use('/api/v1/import', (req, res, next) => {
    if (importEnhancedRoutes) return importEnhancedRoutes(req, res, next);
    return next();
  });

  app.use('/api/v1/import', (req, res, next) => {
    if (importDecisionsRoutes) return importDecisionsRoutes(req, res, next);
    return next();
  });

  app.use('/api/v1/config', (req, res, next) => {
    if (!context.authService)
      return res.status(503).json({ error: 'Auth service not initialized' });
    return configRoutes(req, res, next);
  });

  app.use('/api/v1/duplicates', (req, res, next) => {
    if (duplicatesRoutes) return duplicatesRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  app.use('/api/v1/review-queue', (req, res, next) => {
    if (!context.authService)
      return res.status(503).json({ error: 'Auth service not initialized' });
    return reviewQueueRoutes(req, res, next);
  });

  app.use('/api/v1/cluster', (req, res, next) => {
    if (!context.authService)
      return res.status(503).json({ error: 'Auth service not initialized' });
    return clusterRoutes(req, res, next);
  });

  // Test helper routes (savepoint API, cleanup, etc.)
  // Only enabled when NODE_ENV=test
  app.use('/api/v1/test', (req, res, next) => {
    if (testHelperRoutes) return testHelperRoutes(req, res, next);
    return res.status(503).json({ error: 'Test helpers not initialized or not in test mode' });
  });

  // 404 handler
  app.use(notFoundHandler);

  // Sentry error handler
  addSentryErrorHandler(app);

  // Global error handler
  app.use(errorLogger);

  return { app, context };
}
