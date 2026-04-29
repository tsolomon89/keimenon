/**
 * Express App Configuration
 *
 * Canonical route composition layer.
 * Server startup/shutdown wiring belongs in src/index.ts.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission, isolateByAccount } from './middleware/auth.middleware';
import {
  configureCors,
  configureHelmet,
  addCustomSecurityHeaders,
} from './middleware/security.middleware';
import { errorLogger, notFoundHandler } from './middleware/error-handler.middleware';
import { initSentry, addSentryErrorHandler } from './services/sentry.service';
import ingestRoutes, { setAuthDependencies as setIngestAuthDeps } from './routes/ingest';
import { createNodesRoutes } from './routes/nodes';
import boardsRoutes, { setAuthDependencies as setBoardsAuthDeps } from './routes/boards';
import edgesRoutes, { setAuthDependencies as setEdgesAuthDeps } from './routes/edges';
import contentRoutes, { setAuthDependencies as setContentAuthDeps } from './routes/content';
import configRoutes from './routes/config';
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
import { createMetricsRoutes } from './routes/metrics.routes';
import { createUploadRoutes } from './routes/uploads.routes';
import { createSpineRoutes } from './routes/spine.routes';
import { createSearchRoutes } from './routes/search.routes';
import { createAgentRoutes } from './routes/agent.routes';
import { createDevAuthRoutes } from './routes/dev-auth.routes';
import { createSystemRoutes } from './routes/system.routes';
import { createMeRoutes } from './routes/me.routes';
import { createImportRoutes } from './routes/import.routes';
import testJobsRouter from './routes/test-jobs.routes';
import healthRoutes from './routes/health.routes';
import { createPrincipalsRoutes } from './routes/principals.routes';
import { createWorkspaceRoutes } from './routes/workspace.routes';
import { createConversationsRoutes } from './routes/conversations.routes';
import { createGraphRoutes } from './routes/graph.routes';
import { SSEBroadcaster } from './modules/jobs/infrastructure/SSEBroadcaster';
import { WorkerPool } from './modules/workers/domain/WorkerPool';
import { DatabaseWriteQueue } from './services/DatabaseWriteQueue';
import { AuthService } from './services/auth.service';
import { testIsolationMiddleware } from './middleware/test-isolation.middleware';
import { dbContextMiddleware } from './middleware/db-context.middleware';
import { testCorrelationMiddleware } from './middleware/test-correlation.middleware';
import { appLogger } from './utils/logger';

export interface AppContext {
  app: Express;
  authService: AuthService | null;
  sseBroadcaster: SSEBroadcaster | null;
  writeQueue: DatabaseWriteQueue | null;
  workerPool: WorkerPool | null;
  isReady: boolean;
}

type InitializeRoutes = (
  authService: AuthService,
  sseBroadcaster: SSEBroadcaster,
  workerPool: WorkerPool,
  writeQueue: DatabaseWriteQueue
) => void;

export function createApp(): { app: Express; context: AppContext } {
  const app: Express = express();

  initSentry(app);
  app.use(configureHelmet());
  app.use(configureCors());
  app.use(addCustomSecurityHeaders());

  if (process.env.API_LOG_REQUESTS === '1') {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      appLogger.debug('http.request', { method: req.method, path: req.path });
      next();
    });
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    const isChunkUpload = /^\/api\/v1\/uploads\/[^/]+\/chunks\/\d+$/.test(req.path);
    if (isChunkUpload) {
      return express.raw({ type: '*/*', limit: '15mb' })(req, res, next);
    }
    return next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const isChunkUpload = /^\/api\/v1\/uploads\/[^/]+\/chunks\/\d+$/.test(req.path);
    if (isChunkUpload) {
      return next();
    }

    return express.json({ limit: '10mb' })(req, res, next);
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const isChunkUpload = /^\/api\/v1\/uploads\/[^/]+\/chunks\/\d+$/.test(req.path);
    if (isChunkUpload) {
      return next();
    }

    return express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
  });

  app.use(testCorrelationMiddleware);

  if (process.env.NODE_ENV === 'test') {
    app.use(testIsolationMiddleware);
    app.use(dbContextMiddleware);
    appLogger.info('test.isolation.enabled');
  }

  const context: AppContext = {
    app,
    authService: null,
    sseBroadcaster: null,
    writeQueue: null,
    workerPool: null,
    isReady: false,
  };

  app.use('/health', healthRoutes);

  app.get('/ready', async (_req: Request, res: Response) => {
    const checks = {
      server: context.isReady,
      database: false,
      storage: false,
      memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024,
    };

    try {
      if (global.dbClient) {
        await global.dbClient.execute('SELECT 1');
        checks.database = true;
      }
    } catch {
      // Database not ready
    }

    checks.storage = true;

    const ready = Object.values(checks).every((c) => c);
    const statusCode = ready ? 200 : 503;

    return res.status(statusCode).json({
      ready,
      checks,
      storageMode: 'local',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1', (_req: Request, res: Response) => {
    return res.json({
      message: 'Keimenon API v1',
      version: '0.1.0',
      endpoints: {
        jobs: {
          importMultipartCompatibility: 'POST /api/v1/jobs/import (410 Gone)',
          delete: 'POST /api/v1/jobs/delete',
          list: 'GET /api/v1/jobs',
          get: 'GET /api/v1/jobs/:id',
          control: 'POST /api/v1/jobs/:id/cancel|pause|resume|retry',
          stream: 'GET /api/v1/stream/jobs',
          duplicateReviewApply: 'POST /api/v1/jobs/:id/duplicate-review/apply',
          duplicateReviewStatus: 'GET /api/v1/jobs/:id/duplicate-review/status',
        },
        uploads: {
          initiate: 'POST /api/v1/uploads/initiate',
          chunk: 'POST /api/v1/uploads/:sessionId/chunks/:chunkIndex',
          status: 'GET /api/v1/uploads/:sessionId',
          cancel: 'DELETE /api/v1/uploads/:sessionId',
        },
        system: {
          reimportStatus: 'GET /api/v1/system/reimport-status',
          reimportComplete: 'POST /api/v1/system/reimport-complete',
        },
        me: {
          features: 'GET /api/v1/me/features',
        },
        import: {
          similarityPreview: 'POST /api/v1/import/similarity-preview',
          listPresets: 'GET /api/v1/import/presets',
          createPreset: 'POST /api/v1/import/presets',
          updatePreset: 'PUT /api/v1/import/presets/:id',
          deletePreset: 'DELETE /api/v1/import/presets/:id',
          statsSeries: 'GET /api/v1/import/stats/series',
        },
        graph: {
          snapshot: 'GET /api/v1/graph/snapshot',
        },
      },
    });
  });

  app.get('/api/v1/debug-info', (_req: Request, res: Response) => {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
    const localDocsPath =
      process.env.LOCAL_DOCS_PATH?.replace('~', homeDir) || `${homeDir}/.keimenon`;
    const sqlitePath =
      process.env.SQLITE_PATH?.replace('~', homeDir) || `${localDocsPath}/keimenon.db`;

    return res.json({
      cwd: process.cwd(),
      env_sqlite_path: process.env.SQLITE_PATH,
      resolved_sqlite_path: sqlitePath,
      user_profile: process.env.USERPROFILE,
      home: process.env.HOME,
      node_env: process.env.NODE_ENV,
    });
  });

  let authRoutes: any = null;
  let accountsRoutes: any = null;
  let usersRoutes: any = null;
  let analyticsRoutes: any = null;
  let groupsNavigationRoutes: any = null;
  let settingsRoutes: any = null;
  let adminRoutes: any = null;
  let dataManagementRoutes: any = null;
  let deduplicationRoutes: any = null;
  let jobsRoutes: any = null;
  let streamRoutes: any = null;
  let jobBasedImportRoutes: any = null;
  let testHelperRoutes: any = null;
  let testJobsRoutes: any = null;
  let nodesRoutes: any = null;
  let metricsRoutes: any = null;
  let uploadRoutes: any = null;
  let spineRoutes: any = null;
  let searchRoutes: any = null;
  let principalsRoutes: any = null;
  let workspaceRoutes: any = null;
  let conversationsRoutes: any = null;
  let graphRoutes: any = null;
  let agentRoutes: any = null;
  let devAuthRoutes: any = null;
  let systemRoutes: any = null;
  let meRoutes: any = null;
  let importRoutes: any = null;

  const initializeRoutes: InitializeRoutes = (
    authService: AuthService,
    sseBroadcaster: SSEBroadcaster,
    workerPool: WorkerPool,
    writeQueue: DatabaseWriteQueue
  ) => {
    const dbClient = global.dbClient as any;

    context.authService = authService;
    context.sseBroadcaster = sseBroadcaster;
    context.workerPool = workerPool;
    context.writeQueue = writeQueue;

    authRoutes = createAuthRoutes(authService);
    accountsRoutes = createAccountsRoutes(dbClient, authService);
    usersRoutes = createUsersRoutes(dbClient, authService);
    analyticsRoutes = createAnalyticsRoutes(dbClient, authService);
    groupsNavigationRoutes = createGroupsRoutes(dbClient, authService);
    settingsRoutes = createSettingsRoutes(dbClient, authService);
    adminRoutes = createAdminRoutes(dbClient, authService);
    dataManagementRoutes = createDataManagementRoutes(dbClient, authService);
    deduplicationRoutes = createDeduplicationRoutes(dbClient, authService);
    jobsRoutes = createJobsRoutes(authService, dbClient.db, sseBroadcaster, workerPool);
    streamRoutes = createStreamRoutes(authService, sseBroadcaster);
    jobBasedImportRoutes = createJobBasedImportRoutes(
      authService,
      dbClient.db,
      workerPool,
      sseBroadcaster
    );
    testHelperRoutes = createTestHelperRoutes(dbClient);
    nodesRoutes = createNodesRoutes(authService);
    metricsRoutes = createMetricsRoutes(authService);
    uploadRoutes = createUploadRoutes(authService);
    spineRoutes = createSpineRoutes(authService);
    searchRoutes = createSearchRoutes(authService);
    principalsRoutes = createPrincipalsRoutes(dbClient, authService);
    workspaceRoutes = createWorkspaceRoutes(dbClient, authService);
    conversationsRoutes = createConversationsRoutes(dbClient, authService);
    graphRoutes = createGraphRoutes(authService);
    agentRoutes = createAgentRoutes(authService as any);
    systemRoutes = createSystemRoutes(authService as any);
    meRoutes = createMeRoutes(authService as any);
    importRoutes = createImportRoutes(authService as any);

    if (process.env.NODE_ENV === 'development' || process.env.ENABLE_DEV_AUTH === 'true') {
      devAuthRoutes = createDevAuthRoutes(authService as any);
      appLogger.info('auth.dev_routes.enabled');
    }

    if (process.env.NODE_ENV === 'test') {
      const authRouter = express.Router();
      authRouter.use(requireAuth(authService));
      authRouter.use(testJobsRouter);
      testJobsRoutes = authRouter;
    }

    setEdgesAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setBoardsAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setContentAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setIngestAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);

    app.get('/api/v1/debug/queue/status', (_req: Request, res: Response) => {
      if (!writeQueue) {
        return res.status(503).json({ error: 'Write queue not initialized' });
      }

      return res.json({
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

    app.post('/api/v1/debug/queue/reset-circuit', (_req: Request, res: Response) => {
      if (!writeQueue) {
        return res.status(503).json({ error: 'Write queue not initialized' });
      }

      try {
        writeQueue.resetCircuitBreaker();
        return res.json({
          success: true,
          message: 'Circuit breaker reset successfully',
          isOpen: writeQueue.isCircuitOpen(),
        });
      } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
      }
    });
  };

  (context as any).initializeRoutes = initializeRoutes;

  app.use('/api/v1/auth/dev', (req, res, next) => {
    if (devAuthRoutes) return devAuthRoutes(req, res, next);
    return res.status(404).json({ error: 'Dev auth routes not enabled' });
  });

  app.use('/api/dev-auth', (req, res, next) => {
    if (devAuthRoutes) return devAuthRoutes(req, res, next);
    return res.status(404).json({ error: 'Dev auth routes not enabled' });
  });

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

  app.use('/api/v1/metrics', (req, res, next) => {
    if (metricsRoutes) return metricsRoutes(req, res, next);
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

  app.use('/api/v1/uploads', (req, res, next) => {
    if (uploadRoutes) return uploadRoutes(req, res, next);
    return res.status(503).json({ error: 'Upload service not initialized' });
  });

  app.use('/api/v1/jobs', (req, res, next) => {
    if (jobBasedImportRoutes) return jobBasedImportRoutes(req, res, next);
    return next();
  });

  app.use('/api/v1/jobs', (req, res, next) => {
    if (jobsRoutes) return jobsRoutes(req, res, next);
    return res.status(503).json({ error: 'Jobs service not initialized' });
  });

  app.use('/api/v1/nodes', (req, res, next) => {
    if (nodesRoutes) return nodesRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  app.use('/api/v1/graph', (req, res, next) => {
    if (graphRoutes) return graphRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
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

  app.use('/api/v1/config', (req, res, next) => {
    if (!context.authService)
      return res.status(503).json({ error: 'Auth service not initialized' });
    return configRoutes(req, res, next);
  });

  app.use('/api/v1/search', (req, res, next) => {
    if (searchRoutes) return searchRoutes(req, res, next);
    return res.status(503).json({ error: 'Search service not initialized' });
  });

  app.use('/api/v1/spine', (req, res, next) => {
    if (spineRoutes) return spineRoutes(req, res, next);
    return res.status(503).json({ error: 'Spine service not initialized' });
  });

  app.use('/api/v1/principals', (req, res, next) => {
    if (principalsRoutes) return principalsRoutes(req, res, next);
    return res.status(503).json({ error: 'Principals service not initialized' });
  });

  app.use('/api/v1/workspaces', (req, res, next) => {
    if (workspaceRoutes) return workspaceRoutes(req, res, next);
    return res.status(503).json({ error: 'Workspace service not initialized' });
  });

  app.use('/api/v1/system', (req, res, next) => {
    if (systemRoutes) return systemRoutes(req, res, next);
    return res.status(503).json({ error: 'System service not initialized' });
  });

  app.use('/api/v1/me', (req, res, next) => {
    if (meRoutes) return meRoutes(req, res, next);
    return res.status(503).json({ error: 'Auth service not initialized' });
  });

  app.use('/api/v1/import', (req, res, next) => {
    if (importRoutes) return importRoutes(req, res, next);
    return res.status(503).json({ error: 'Import preview service not initialized' });
  });

  app.use('/api/v1/conversations', (req, res, next) => {
    if (conversationsRoutes) return conversationsRoutes(req, res, next);
    return res.status(503).json({ error: 'Conversations service not initialized' });
  });

  app.use('/api/v1/agent', (req, res, next) => {
    if (agentRoutes) return agentRoutes(req, res, next);
    return res.status(503).json({ error: 'Agent service not initialized' });
  });

  app.use('/api/v1/test', (req, res, next) => {
    if (testHelperRoutes) return testHelperRoutes(req, res, next);
    return res.status(503).json({ error: 'Test helpers not initialized or not in test mode' });
  });

  app.use('/api/v1/test/jobs', (req, res, next) => {
    if (testJobsRoutes) return testJobsRoutes(req, res, next);
    return res.status(404).json({ error: 'Test jobs endpoint not available' });
  });

  app.use(notFoundHandler);
  addSentryErrorHandler(app);
  app.use(errorLogger);

  return { app, context };
}
