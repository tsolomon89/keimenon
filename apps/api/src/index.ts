import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import importRoutes from './routes/import';
import importDecisionsRoutes from './routes/import-decisions';
import importStreamRoutes from './routes/import-stream';
import { createImportEnhancedRoutes } from './routes/import-enhanced';
import contentRoutes, { setAuthDependencies as setContentAuthDeps } from './routes/content';
// import groupsRoutes from './routes/groups'; // OLD: auto-grouping routes (deprecated)
import configRoutes from './routes/config';
import duplicatesRoutes from './routes/duplicates';
import reviewQueueRoutes from './routes/review-queue.routes';
import clusterRoutes from './routes/cluster.routes';
import { createAuthRoutes } from './routes/auth.routes';
import { createAccountsRoutes } from './routes/accounts.routes';
import { createUsersRoutes } from './routes/users.routes';
import { createAnalyticsRoutes } from './routes/analytics.routes';
import { createGroupsRoutes } from './routes/groups.routes';
import { createSettingsRoutes } from './routes/settings.routes';
import { createAdminRoutes } from './routes/admin.routes';
import { AuthService } from './services/auth.service';
import { requireAuth, requirePermission, isolateByAccount } from './middleware/auth.middleware';

// Load environment variables - override ensures we get the right .env
dotenv.config({ path: path.join(__dirname, '../.env'), override: true });

const app: Express = express();
const port = process.env.PORT || 3001;

// Global state
let server: Server | null = null;
let neo4jClient: any = null;
let storageService: any = null;
let authService: AuthService | null = null;
let isReady = false;

// Middleware
app.use(helmet());
app.use(cors());

// Skip body parsing for streaming upload routes
app.use((req, res, next) => {
  // Skip body parsing for file upload endpoints
  if (req.path.includes('/import/enhanced') || req.path.includes('/import/stream')) {
    return next();
  }
  // Apply body parsing for all other routes
  express.json({ limit: '10mb' })(req, res, next);
});

app.use((req, res, next) => {
  // Skip body parsing for file upload endpoints
  if (req.path.includes('/import/enhanced') || req.path.includes('/import/stream')) {
    return next();
  }
  // Apply URL encoding for all other routes
  express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
});

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

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

  const ready = Object.values(checks).every(c => c);
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

app.use('/api/v1/ingest', ingestRoutes);
app.use('/api/v1/nodes', nodesRoutes);
app.use('/api/v1/boards', boardsRoutes);
app.use('/api/v1/edges', edgesRoutes);
app.use('/api/v1/import', importRoutes);
app.use('/api/v1/import', importDecisionsRoutes);
app.use('/api/v1/import', importStreamRoutes);
app.use('/api/v1/content', contentRoutes);
// app.use('/api/v1/groups', groupsRoutes); // OLD: Removed - replaced by authenticated groups.routes.ts
app.use('/api/v1/config', configRoutes);
app.use('/api/v1/duplicates', duplicatesRoutes);
app.use('/api/v1/review-queue', reviewQueueRoutes);
app.use('/api/v1/cluster', clusterRoutes);

// Dynamic auth routes (registered after auth service is initialized)
app.use('/api/v1/auth', (req, res, next) => {
  if (authRoutes) return authRoutes(req, res, next);
  res.status(503).json({ error: 'Auth service not initialized' });
});
app.use('/api/v1/accounts', (req, res, next) => {
  if (accountsRoutes) return accountsRoutes(req, res, next);
  res.status(503).json({ error: 'Auth service not initialized' });
});
app.use('/api/v1/users', (req, res, next) => {
  if (usersRoutes) return usersRoutes(req, res, next);
  res.status(503).json({ error: 'Auth service not initialized' });
});
app.use('/api/v1/analytics', (req, res, next) => {
  if (analyticsRoutes) return analyticsRoutes(req, res, next);
  res.status(503).json({ error: 'Auth service not initialized' });
});
app.use('/api/v1/groups', (req, res, next) => {
  if (groupsNavigationRoutes) return groupsNavigationRoutes(req, res, next);
  res.status(503).json({ error: 'Auth service not initialized' });
});
app.use('/api/v1/settings', (req, res, next) => {
  if (settingsRoutes) return settingsRoutes(req, res, next);
  res.status(503).json({ error: 'Auth service not initialized' });
});
app.use('/api/v1/admin', (req, res, next) => {
  if (adminRoutes) return adminRoutes(req, res, next);
  res.status(503).json({ error: 'Auth service not initialized' });
});
app.use('/api/v1/import', (req, res, next) => {
  if (importEnhancedRoutes) return importEnhancedRoutes(req, res, next);
  res.status(503).json({ error: 'Auth service not initialized' });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

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
    const localDocsPath = process.env.LOCAL_DOCS_PATH?.replace('~', homeDir) || path.join(homeDir, '.canvas-memory');
    const sqlitePath = process.env.SQLITE_PATH?.replace('~', homeDir) || path.join(localDocsPath, 'canvas.db');

    const dbClient = await DatabaseFactory.getClient({
      mode: storageMode,
      local: {
        databasePath: sqlitePath,
        verbose: process.env.NODE_ENV === 'development',
      },
      canvas: storageMode !== 'local' ? {
        uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
        user: process.env.NEO4J_USER || 'neo4j',
        password: process.env.NEO4J_PASSWORD || 'password',
      } : undefined,
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

