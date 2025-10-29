import express, { Express, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { Server } from 'http';
import { getNeo4jClient, DatabaseFactory, StorageMode } from '@canvas-memory/db';
import { getStorageService } from './services/storage';
import { getLocalDocumentStore } from './services/local-document-store';
import ingestRoutes, { setAuthDependencies as setIngestAuthDeps } from './routes/ingest';
import nodesRoutes, { setAuthDependencies as setNodesAuthDeps } from './routes/nodes';
import boardsRoutes, { setAuthDependencies as setBoardsAuthDeps } from './routes/boards';
import edgesRoutes, { setAuthDependencies as setEdgesAuthDeps } from './routes/edges';
// LEGACY IMPORTS (quarantined - renamed to .old.ts)
// import importRoutes from './routes/import.old';
// import importStreamRoutes from './routes/import-stream.old';
// import { createImportProgressStreamRoutes } from './routes/import-progress-stream.old';
// import { createImportJobsRoutes } from './routes/import-jobs.old';
import { createImportDecisionsRoutes } from './routes/import-decisions';
import { createImportEnhancedRoutes } from './routes/import-enhanced';
import contentRoutes, { setAuthDependencies as setContentAuthDeps } from './routes/content';
// import groupsRoutes from './routes/groups'; // OLD: auto-grouping routes (deprecated)
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
import { SSEBroadcaster } from './modules/jobs/infrastructure/SSEBroadcaster';
import { WorkerPool } from './modules/workers/domain/WorkerPool';
import { ConcurrencyGuard } from './modules/workers/domain/ConcurrencyGuard';
import { SQLiteJobRepository } from './modules/jobs/infrastructure/JobRepository';
import { StartJob } from './modules/jobs/application/StartJob';
import { ImportWorker } from './modules/workers/infrastructure/ImportWorker';
import { DeleteWorker } from './modules/workers/infrastructure/DeleteWorker';
import { DatabaseWriteQueue } from './services/DatabaseWriteQueue';
import { AuthService } from './services/auth.service';
import { requireAuth, requirePermission, isolateByAccount } from './middleware/auth.middleware';
import {
  configureCors,
  configureHelmet,
  addCustomSecurityHeaders,
} from './middleware/security.middleware';
import { validateAndFailFast } from './utils/env-validator';
import { errorLogger, notFoundHandler } from './middleware/error-handler.middleware';
import { testCorrelationMiddleware } from './middleware/test-correlation.middleware';
import { initSentry, addSentryErrorHandler } from './services/sentry.service';
// DISABLED: Using clean embedded schema instead of migrations
// import { MigrationRunner } from '@canvas-memory/db/src/sqlite/MigrationRunner';

// Load environment variables - override ensures we get the right .env
dotenv.config({ path: path.join(__dirname, '../.env'), override: true });

// Validate environment variables - fail fast if critical config is missing
validateAndFailFast();

const app: Express = express();
const port = process.env.PORT || 3001;

// Initialize Sentry (MUST be before all other middleware)
// Only initializes if SENTRY_DSN environment variable is set (opt-in)
initSentry(app);

// Global state
let server: Server | null = null;
let neo4jClient: any = null;
let storageService: any = null;
let authService: AuthService | null = null;
let sseBroadcaster: SSEBroadcaster | null = null;
let writeQueue: DatabaseWriteQueue | null = null;
let workerPool: WorkerPool | null = null;
let isReady = false;

// Security Middleware - MUST be applied before routes
app.use(configureHelmet()); // Security headers (CSP, XSS, HSTS, etc.)
app.use(configureCors()); // CORS with environment-based origin restrictions
app.use(addCustomSecurityHeaders()); // Additional custom security headers

// Body parsing - skip for file upload routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.path}`);
  return next();
});

// Test correlation for E2E testing (adds x-test-id header tracking)
app.use(testCorrelationMiddleware);

// Health check
app.get('/health', async (req: Request, res: Response) => {
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

// Readiness check
app.get('/ready', async (req: Request, res: Response) => {
  const checks = {
    server: isReady,
    database: false,
    storage: false,
    memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024, // < 500MB
  };

  // Check Database
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

  // Check Storage
  try {
    if (storageService) {
      checks.storage = true;
    }
  } catch (error) {
    // Storage not ready
  }

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
      accounts: {
        list: 'GET /api/v1/accounts',
        get: 'GET /api/v1/accounts/:id',
        update: 'PATCH /api/v1/accounts/:id',
        listUsers: 'GET /api/v1/accounts/:id/users',
        createUser: 'POST /api/v1/accounts/:id/users',
        stats: 'GET /api/v1/accounts/:id/stats',
      },
      users: {
        get: 'GET /api/v1/users/:id',
        update: 'PATCH /api/v1/users/:id',
        delete: 'DELETE /api/v1/users/:id',
      },
      ingest: {
        uploadFiles: 'POST /api/v1/ingest/files',
        ingestUrl: 'POST /api/v1/ingest/url',
        status: 'GET /api/v1/ingest/status',
      },
      nodes: {
        list: 'GET /api/v1/nodes',
        get: 'GET /api/v1/nodes/:id',
        createSource: 'POST /api/v1/nodes/source',
        createGroup: 'POST /api/v1/nodes/group',
        delete: 'DELETE /api/v1/nodes/:id',
      },
      boards: {
        list: 'GET /api/v1/boards',
        get: 'GET /api/v1/boards/:id',
        getGraph: 'GET /api/v1/boards/:id/graph',
        create: 'POST /api/v1/boards',
        update: 'PUT /api/v1/boards/:id',
        delete: 'DELETE /api/v1/boards/:id',
      },
      edges: {
        list: 'GET /api/v1/edges',
        create: 'POST /api/v1/edges',
        delete: 'DELETE /api/v1/edges',
        getNodeEdges: 'GET /api/v1/edges/node/:nodeId',
      },
      import: {
        chat: 'POST /api/v1/import/chat',
        chatBatch: 'POST /api/v1/import/chat/batch',
        configDefaults: 'GET /api/v1/import/config/defaults',
        applyDecisions: 'POST /api/v1/import/chat/apply-decisions',
        decisionsStatus: 'GET /api/v1/import/chat/decisions/status/:import_id',
        streamUpload: 'POST /api/v1/import/stream',
        streamProgress: 'GET /api/v1/import/stream/progress/:uploadId',
        streamCancel: 'DELETE /api/v1/import/stream/cancel/:uploadId',
        enhanced: 'POST /api/v1/import/enhanced',
      },
      content: {
        getMessage: 'GET /api/v1/content/message/:id',
        getSource: 'GET /api/v1/content/source/:id',
        getCode: 'GET /api/v1/content/code/:id',
        getConversation: 'GET /api/v1/content/conversation/:id',
        getStats: 'GET /api/v1/content/stats',
      },
      deduplication: {
        stats: 'GET /api/v1/deduplication/stats',
        merge: 'POST /api/v1/deduplication/merge',
        analyze: 'POST /api/v1/deduplication/analyze',
        duplicates: 'GET /api/v1/deduplication/duplicates',
      },
    },
  });
});

// Auth routes (initialized in start function with authService)
let authRoutes: any = null;
let accountsRoutes: any = null;
let usersRoutes: any = null;
let analyticsRoutes: any = null;
let groupsNavigationRoutes: any = null;
let settingsRoutes: any = null;
let adminRoutes: any = null;
let importEnhancedRoutes: any = null;
// LEGACY (quarantined): let importProgressStreamRoutes: any = null;
// LEGACY (quarantined): let importJobsRoutes: any = null;
let importDecisionsRoutes: any = null;
let dataManagementRoutes: any = null;
let deduplicationRoutes: any = null;
let duplicatesRoutes: any = null;
let jobsRoutes: any = null;
let streamRoutes: any = null;
let jobBasedImportRoutes: any = null;

// Auth-protected routes (deferred until auth service initializes)
// These routes require authentication and are registered after authService is ready

// Dynamic auth routes (registered after auth service is initialized)
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

// ==================== Import Routes ====================
// IMPORTANT: More specific paths MUST be registered BEFORE less specific ones
// Express matches routes in registration order and stops at first match

// LEGACY ROUTES (quarantined):
// /api/v1/import/progress/* - Old per-upload SSE (replaced by /api/v1/stream/jobs)
// /api/v1/import/jobs/* - Old job tracking (replaced by /api/v1/jobs/*)
// app.use('/api/v1/import/progress', (req, res, next) => {
//   if (importProgressStreamRoutes) return importProgressStreamRoutes(req, res, next);
//   return res.status(503).json({ error: 'Auth service not initialized' });
// });
// app.use('/api/v1/import/jobs', (req, res, next) => {
//   if (importJobsRoutes) return importJobsRoutes(req, res, next);
//   return res.status(503).json({ error: 'Auth service not initialized' });
// });
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
// Job-based import/delete routes (must come before general /api/v1/jobs to match specific paths first)
app.use('/api/v1/jobs', (req, res, next) => {
  console.log(`[Route Debug] Incoming request to /api/v1/jobs: ${req.method} ${req.path}`);
  if (jobBasedImportRoutes) return jobBasedImportRoutes(req, res, next);
  // Fall through to next handler if route not matched
  console.log(`[Route Debug] No match in jobBasedImportRoutes, calling next()`);
  return next();
});
// General jobs API routes
app.use('/api/v1/jobs', (req, res, next) => {
  if (jobsRoutes) return jobsRoutes(req, res, next);
  return res.status(503).json({ error: 'Auth service not initialized' });
});

// Auth-protected data routes (deferred)
app.use('/api/v1/nodes', (req, res, next) => {
  if (!authService) return res.status(503).json({ error: 'Auth service not initialized' });
  return nodesRoutes(req, res, next);
});
app.use('/api/v1/edges', (req, res, next) => {
  if (!authService) return res.status(503).json({ error: 'Auth service not initialized' });
  return edgesRoutes(req, res, next);
});
app.use('/api/v1/boards', (req, res, next) => {
  if (!authService) return res.status(503).json({ error: 'Auth service not initialized' });
  return boardsRoutes(req, res, next);
});
app.use('/api/v1/content', (req, res, next) => {
  if (!authService) return res.status(503).json({ error: 'Auth service not initialized' });
  return contentRoutes(req, res, next);
});
app.use('/api/v1/ingest', (req, res, next) => {
  if (!authService) return res.status(503).json({ error: 'Auth service not initialized' });
  return ingestRoutes(req, res, next);
});

// Less specific: /api/v1/import/enhanced, /api/v1/import/chat/*, /api/v1/import/stream, etc.
// This consolidates all /api/v1/import/* routes into proper registration order
app.use('/api/v1/import', (req, res, next) => {
  if (importEnhancedRoutes) return importEnhancedRoutes(req, res, next);
  return next(); // Fall through to next /api/v1/import handler
});
// LEGACY ROUTES (quarantined):
// These routes have been quarantined to .old.ts files
// Kept here for reference if ENABLE_LEGACY_IMPORTS flag is ever added
// app.use('/api/v1/import', (req, res, next) => {
//   if (!authService) return res.status(503).json({ error: 'Auth service not initialized' });
//   return importRoutes(req, res, next); // Handles /chat, /chat/batch, /config/defaults
// });
// app.use('/api/v1/import', (req, res, next) => {
//   if (!authService) return res.status(503).json({ error: 'Auth service not initialized' });
//   return importStreamRoutes(req, res, next); // Handles /stream, /progress/:uploadId, /cancel/:uploadId
// });

// Import decisions routes (still active - used by duplicate review workflow)
app.use('/api/v1/import', (req, res, next) => {
  if (importDecisionsRoutes) return importDecisionsRoutes(req, res, next); // Handles /chat/apply-decisions, /chat/decisions/status/:import_id
  return next(); // Fall through if no match
});

// Config routes (may not need auth - but deferring for consistency)
app.use('/api/v1/config', (req, res, next) => {
  if (!authService) return res.status(503).json({ error: 'Auth service not initialized' });
  return configRoutes(req, res, next);
});
app.use('/api/v1/duplicates', (req, res, next) => {
  if (duplicatesRoutes) return duplicatesRoutes(req, res, next);
  return res.status(503).json({ error: 'Auth service not initialized' });
});
app.use('/api/v1/review-queue', (req, res, next) => {
  if (!authService) return res.status(503).json({ error: 'Auth service not initialized' });
  return reviewQueueRoutes(req, res, next);
});
app.use('/api/v1/cluster', (req, res, next) => {
  if (!authService) return res.status(503).json({ error: 'Auth service not initialized' });
  return clusterRoutes(req, res, next);
});

// 404 Not Found Handler - Must be after all routes
app.use(notFoundHandler);

// Sentry Error Handler - Must be before other error handlers
addSentryErrorHandler(app);

// Global Error Handler - Must be the LAST middleware
app.use(errorLogger);

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      console.log('✅ HTTP server closed');
    });
  }

  // Mark as not ready
  isReady = false;

  // Stop SSE broadcaster
  if (sseBroadcaster) {
    try {
      sseBroadcaster.stop();
      console.log('✅ SSE broadcaster stopped');
    } catch (error) {
      console.error('⚠️  Error stopping SSE broadcaster:', error);
    }
  }

  // Stop write queue (flush pending writes before worker pool stops)
  if (writeQueue) {
    try {
      await writeQueue.stop();
      console.log('✅ Write queue stopped and flushed');
    } catch (error) {
      console.error('⚠️  Error stopping write queue:', error);
    }
  }

  // Stop worker pool
  if (workerPool) {
    try {
      await workerPool.stop();
      console.log('✅ Worker pool stopped');
    } catch (error) {
      console.error('⚠️  Error stopping worker pool:', error);
    }
  }

  // Close database connections
  try {
    if (neo4jClient) {
      await neo4jClient.close();
      console.log('✅ Neo4j connections closed');
    }
  } catch (error) {
    console.error('⚠️  Error closing Neo4j:', error);
  }

  // Cleanup temp files (if needed)
  try {
    // Add any cleanup logic here
  } catch (error) {
    console.error('⚠️  Error during cleanup:', error);
  }

  console.log('✅ Graceful shutdown complete');
  process.exit(0);
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Initialize services and start server
async function start() {
  try {
    // Initialize Database (SQLite by default, Neo4j optional)
    const storageMode = (process.env.STORAGE_MODE || 'local') as StorageMode;
    console.log(`🔌 Initializing database (mode: ${storageMode})...`);

    // Resolve home directory path
    const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
    const localDocsPath =
      process.env.LOCAL_DOCS_PATH?.replace('~', homeDir) || path.join(homeDir, '.canvas-memory');
    const sqlitePath =
      process.env.SQLITE_PATH?.replace('~', homeDir) || path.join(localDocsPath, 'canvas.db');

    const dbClient = await DatabaseFactory.getClient({
      mode: storageMode,
      local: {
        databasePath: sqlitePath,
        verbose: process.env.NODE_ENV === 'development',
      },
      canvas:
        storageMode !== 'local'
          ? {
              uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
              user: process.env.NEO4J_USER || 'neo4j',
              password: process.env.NEO4J_PASSWORD || 'password',
            }
          : undefined,
    });

    // Store globally for routes to use
    global.dbClient = dbClient;

    // For backward compatibility, also store as neo4jClient
    neo4jClient = dbClient as any;

    console.log(`✅ Database initialized (${storageMode} mode)`);
    console.log(`📂 Storage location: ${storageMode === 'local' ? sqlitePath : 'Neo4j'}`);

    // Initialize schema if available
    if ((dbClient as any).initializeSchema) {
      await (dbClient as any).initializeSchema();
    }

    // DISABLED: Using clean embedded schema in client.ts instead of migrations
    // Run pending migrations (automatic migration system)
    // console.log('📦 Running database migrations...');
    // const migrationRunner = new MigrationRunner((dbClient as any).db);
    // await migrationRunner.runPendingMigrations();
    // console.log('✅ Database migrations complete');

    // Initialize Auth Service
    console.log('🔐 Initializing auth service...');
    authService = new AuthService(dbClient as any);
    authRoutes = createAuthRoutes(authService);
    accountsRoutes = createAccountsRoutes(dbClient as any, authService);
    usersRoutes = createUsersRoutes(dbClient as any, authService);
    analyticsRoutes = createAnalyticsRoutes(dbClient as any, authService);
    groupsNavigationRoutes = createGroupsRoutes(dbClient as any, authService);
    settingsRoutes = createSettingsRoutes(dbClient as any, authService);
    adminRoutes = createAdminRoutes(dbClient as any, authService);
    importEnhancedRoutes = createImportEnhancedRoutes(authService);
    // LEGACY (quarantined): importProgressStreamRoutes = createImportProgressStreamRoutes(authService);
    // LEGACY (quarantined): importJobsRoutes = createImportJobsRoutes(authService);
    importDecisionsRoutes = createImportDecisionsRoutes(dbClient as any, authService);
    dataManagementRoutes = createDataManagementRoutes(dbClient as any, authService);
    deduplicationRoutes = createDeduplicationRoutes(dbClient as any, authService);
    duplicatesRoutes = createDuplicatesRoutes(dbClient as any, authService);
    jobsRoutes = createJobsRoutes(authService, (dbClient as any).db); // Pass SQLite database instance
    // NOTE: jobBasedImportRoutes will be initialized after workerPool is ready (see line ~676)

    // Inject auth dependencies into data routes
    setNodesAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setEdgesAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setBoardsAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setContentAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);
    setIngestAuthDeps(authService, requireAuth, requirePermission, isolateByAccount);

    console.log('✅ Auth service initialized');

    // Initialize Storage
    console.log('💾 Initializing storage...');
    storageService = getStorageService({
      basePath: process.env.STORAGE_PATH || './storage',
      maxSizeBytes: parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024,
    });
    await storageService.init();
    console.log('✅ Storage initialized');

    // Initialize Local Document Store
    console.log('📁 Initializing local document store...');
    const localStore = getLocalDocumentStore({
      basePath: process.env.LOCAL_DOCS_PATH || undefined, // Defaults to ~/.canvas-memory
      enableDeduplication: true,
    });
    await localStore.initialize();
    console.log('✅ Local document store initialized');

    // Initialize SSE Broadcaster
    console.log('📡 Initializing SSE broadcaster...');
    sseBroadcaster = new SSEBroadcaster(
      parseInt(process.env.SSE_BROADCAST_INTERVAL_MS || '500'), // 2Hz
      parseInt(process.env.SSE_HEARTBEAT_INTERVAL_MS || '15000') // 15s (reduced from 30s for faster disconnect detection)
    );
    sseBroadcaster.start();
    console.log('✅ SSE broadcaster initialized and started');

    // Register stream routes
    streamRoutes = createStreamRoutes(authService, sseBroadcaster);

    // Initialize Database Write Queue (non-blocking writes for imports)
    console.log('💾 Initializing database write queue...');
    writeQueue = new DatabaseWriteQueue(dbClient, sseBroadcaster);
    writeQueue.start();
    console.log('✅ Database write queue initialized and started');

    // Debug/Diagnostic endpoints for write queue
    app.get('/api/v1/debug/queue/status', (req: Request, res: Response) => {
      if (!writeQueue) {
        return res.status(503).json({ error: 'Write queue not initialized' });
      }

      const stats = writeQueue.getStats();
      const queueSizes = writeQueue.getQueueSizes();
      const isCircuitOpen = writeQueue.isCircuitOpen();
      const errorMetrics = writeQueue.getErrorMetrics();
      const deadLetterQueue = writeQueue.getDeadLetterQueue();

      res.json({
        queue: {
          nodes: queueSizes.nodes,
          edges: queueSizes.edges,
        },
        stats,
        circuitBreaker: {
          isOpen: isCircuitOpen,
          ...errorMetrics,
        },
        deadLetterQueue: {
          count: deadLetterQueue.length,
          items: deadLetterQueue.slice(0, 10), // First 10 items
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
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Initialize Worker Pool
    console.log('⚙️ Initializing worker pool...');
    const jobRepository = new SQLiteJobRepository((dbClient as any).db);
    const concurrencyGuard = new ConcurrencyGuard(jobRepository);
    const startJobUseCase = new StartJob(jobRepository);

    // Recover orphaned jobs from previous server instance
    // This marks any jobs left in 'queued' or 'running' state as 'failed'
    // Must run BEFORE worker pool starts to prevent race conditions
    const { recoverOrphanedJobs } = await import(
      './modules/jobs/infrastructure/OrphanedJobRecovery'
    );
    await recoverOrphanedJobs(jobRepository);

    // Connect SSE broadcaster to job repository for initial state sync
    if (sseBroadcaster) {
      sseBroadcaster.setJobRepository(jobRepository);
      console.log('✅ SSE broadcaster connected to job repository');
    }

    workerPool = new WorkerPool(
      jobRepository,
      concurrencyGuard,
      startJobUseCase,
      {
        maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '3'),
        pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000'),
      },
      sseBroadcaster // Pass broadcaster to worker pool
    );

    // Register workers (pass write queue to import worker)
    workerPool.registerWorker(new ImportWorker(dbClient, writeQueue));
    workerPool.registerWorker(new DeleteWorker(dbClient));

    // Start worker pool (recovers orphaned jobs from previous instance)
    await workerPool.start();
    console.log('✅ Worker pool initialized and started');

    // Initialize job-based import routes NOW that workerPool is ready
    jobBasedImportRoutes = createJobBasedImportRoutes(
      authService,
      (dbClient as any).db,
      workerPool
    );
    console.log('✅ Job-based import routes initialized');

    // Start server
    server = app.listen(port, () => {
      isReady = true;
      console.log(`⚡️ Canvas Memory API running on port ${port}`);
      console.log(`🔗 Health check: http://localhost:${port}/health`);
      console.log(`✅ Readiness: http://localhost:${port}/ready`);
      console.log(`📚 API docs: http://localhost:${port}/api/v1`);
    });

    // Handle server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
