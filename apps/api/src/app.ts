/**
 * Express App Configuration
 *
 * Separates app creation from server lifecycle for testability.
 * This module creates and configures the Express app without starting the server.
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
import { createUploadRoutes } from './routes/uploads.routes';
import { createSpineRoutes } from './routes/spine.routes';
import { createVerificationRoutes } from './routes/verification.routes';
import agentRoutesModule from './routes/agent.routes';
// World Model V5: Principal, Workspace, Conversation routes
import { createPrincipalsRoutes } from './routes/principals.routes';
import { createWorkspaceRoutes } from './routes/workspace.routes';
import { createConversationsRoutes } from './routes/conversations.routes';
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

  // Test isolation (only active in test environment) - MUST come before body parsing!
  if (process.env.NODE_ENV === 'test') {
    app.use(testIsolationMiddleware);
    app.use(dbContextMiddleware);
    console.log('🧪 Test isolation middleware enabled - using per-worker databases');
  }

  // Request logging (before body parsing so we can see ALL requests)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`${req.method} ${req.path}`);
    return next();
  });

  // Body parsing - Applied selectively to avoid consuming multipart streams
  // IMPORTANT: Jobs routes and upload routes use busboy and must NOT have body-parser applied
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Check if this is a jobs route or upload route that handles multipart/binary uploads
    // CRITICAL FIX: Do NOT skip body-parser for /initiate (it sends JSON)
    // Only skip for the actual chunk upload endpoints which receive binary streams
    if (
      req.path.startsWith('/api/v1/jobs') || 
      (req.path.startsWith('/api/v1/uploads') && !req.path.endsWith('/initiate'))
    ) {
      console.log(`[Body-Parser] ⏭️  Skipping body-parser for: ${req.method} ${req.path}`);
      return next(); // Skip body-parser for jobs and upload routes
    }

    // Apply body-parser for all other routes
    express.json({ limit: '10mb' })(req, res, (err) => {
      if (err) return next(err);
      express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
    });
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
  app.get('/health', async (_req: Request, res: Response) => {
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

    return res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'keimenon-api',
      version: '0.1.0',
      storageMode,
      dependencies: {
        database: dbStatus,
      },
    });
  });

  // Readiness check
  app.get('/ready', async (_req: Request, res: Response) => {
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

    return res.status(statusCode).json({
      ready,
      checks,
      storageMode: process.env.STORAGE_MODE || 'local',
      timestamp: new Date().toISOString(),
    });
  });

  // API routes
  app.get('/api/v1', (_req: Request, res: Response) => {
    return res.json({
      message: 'Keimenon API v1',
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
  let nodesRoutes: any = null;
  let uploadRoutes: any = null;
  let spineRoutes: any = null;
  let verificationRoutes: any = null;
  // World Model V5 routes
  let principalsRoutes: any = null;
  let workspaceRoutes: any = null;
  let conversationsRoutes: any = null;

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
    jobBasedImportRoutes = createJobBasedImportRoutes(authService, dbClient.db, workerPool, sseBroadcaster);
    testHelperRoutes = createTestHelperRoutes(dbClient);
    nodesRoutes = createNodesRoutes(authService);
    uploadRoutes = createUploadRoutes(authService);
    spineRoutes = createSpineRoutes(authService);
    verificationRoutes = createVerificationRoutes(authService);
    // World Model V5: Initialize principal, workspace, conversation routes
    principalsRoutes = createPrincipalsRoutes(dbClient, authService);
    workspaceRoutes = createWorkspaceRoutes(dbClient, authService);
    conversationsRoutes = createConversationsRoutes(dbClient, authService);

    // Inject auth dependencies for legacy routes
    setEdgesAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setBoardsAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setContentAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setIngestAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);

    // Debug endpoints for write queue
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

  // Upload routes (body-parser automatically skips /api/v1/uploads/* paths to preserve binary streams)
  app.use('/api/v1/uploads', (req, res, next) => {
    if (uploadRoutes) return uploadRoutes(req, res, next);
    return res.status(503).json({ error: 'Upload service not initialized' });
  });

  // Jobs routes (body-parser automatically skips /api/v1/jobs/* paths to preserve multipart streams)
  app.use('/api/v1/jobs', (req, res, next) => {
    // Try import routes first (they handle /import, /delete with multipart)
    if (jobBasedImportRoutes) return jobBasedImportRoutes(req, res, next);
    // Fall back to general jobs routes
    if (jobsRoutes) return jobsRoutes(req, res, next);
    return res.status(503).json({ error: 'Jobs service not initialized' });
  });

  // Auth-protected data routes
  app.use('/api/v1/nodes', (req, res, next) => {
    if (nodesRoutes) return nodesRoutes(req, res, next);
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

  // Vision V2: Spine routes (Lexeme, Phrase, Topic extraction)
  app.use('/api/v1/spine', (req, res, next) => {
    if (spineRoutes) return spineRoutes(req, res, next);
    return res.status(503).json({ error: 'Spine service not initialized' });
  });

  // Vision V2: Verification routes (VerifiedSource, VerifiedClaim)
  app.use('/api/v1/verification', (req, res, next) => {
    if (verificationRoutes) return verificationRoutes(req, res, next);
    return res.status(503).json({ error: 'Verification service not initialized' });
  });

  // World Model V5: Principal routes (unified human/agent/contact)
  app.use('/api/v1/principals', (req, res, next) => {
    if (principalsRoutes) return principalsRoutes(req, res, next);
    return res.status(503).json({ error: 'Principals service not initialized' });
  });

  // World Model V5: Workspace routes (working contexts with agents)
  app.use('/api/v1/workspaces', (req, res, next) => {
    if (workspaceRoutes) return workspaceRoutes(req, res, next);
    return res.status(503).json({ error: 'Workspace service not initialized' });
  });

  // World Model V5: Conversation routes (formal joins)
  app.use('/api/v1/conversations', (req, res, next) => {
    if (conversationsRoutes) return conversationsRoutes(req, res, next);
    return res.status(503).json({ error: 'Conversations service not initialized' });
  });

  // Agent services routes (task execution, BYOK)
  app.use('/api/v1/agent', agentRoutesModule);

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
