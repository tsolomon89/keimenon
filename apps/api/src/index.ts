import dotenv from 'dotenv';
import path from 'path';
import { Server } from 'http';
import { DatabaseFactory, seedAdminAccount } from '@keimenon/db';
import { createApp } from './app';
import { validateAndFailFast } from './utils/env-validator';
import { getStorageService } from './services/storage';
import { getLocalDocumentStore } from './services/local-document-store';
import { AuthService } from './services/auth.service';
import { SSEBroadcaster } from './modules/jobs/infrastructure/SSEBroadcaster';
import { DatabaseWriteQueue } from './services/DatabaseWriteQueue';
import { SQLiteJobRepository } from './modules/jobs/infrastructure/JobRepository';
import { ConcurrencyGuard } from './modules/workers/domain/ConcurrencyGuard';
import { StartJob } from './modules/jobs/application/StartJob';
import { WorkerPool } from './modules/workers/domain/WorkerPool';
import { ImportWorker } from './modules/workers/infrastructure/ImportWorker';
import { DeleteWorker } from './modules/workers/infrastructure/DeleteWorker';
import { recoverOrphanedJobs } from './modules/jobs/infrastructure/OrphanedJobRecovery';
import {
  initializeCleanupService,
  shutdownCleanupService,
} from './modules/uploads/application/UploadCleanupService';
import { SQLiteUploadSessionRepository } from './modules/uploads/infrastructure/UploadSessionRepository';
import { ImportArtifactJanitorService } from './services/ImportArtifactJanitorService';
import { ImportOperationalRetentionService } from './services/ImportOperationalRetentionService';
import { runCoreProcessVersionGate } from './services/core-process-version-gate';

dotenv.config({ path: path.join(__dirname, '../.env') });
validateAndFailFast();

const { app, context } = createApp();
const defaultPort = process.env.PORT || 3001;

let server: Server | null = null;
let databaseClient: any = null;
let storageService: any = null;
let authService: AuthService | null = null;
let sseBroadcaster: SSEBroadcaster | null = null;
let writeQueue: DatabaseWriteQueue | null = null;
let workerPool: WorkerPool | null = null;
let uploadCleanupService: any = null;
let importArtifactJanitor: ImportArtifactJanitorService | null = null;
let importRetentionService: ImportOperationalRetentionService | null = null;

export interface ServerConfig {
  port?: number;
  localDocsPath?: string;
  sqlitePath?: string;
  storagePath?: string;
}

async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
    });
  }

  context.isReady = false;

  if (sseBroadcaster) {
    try {
      sseBroadcaster.stop();
      console.log('SSE broadcaster stopped');
    } catch (error) {
      console.error('Error stopping SSE broadcaster:', error);
    }
  }

  if (writeQueue) {
    try {
      await writeQueue.stop();
      console.log('Write queue stopped and flushed');
    } catch (error) {
      console.error('Error stopping write queue:', error);
    }
  }

  if (workerPool) {
    try {
      await workerPool.stop();
      console.log('Worker pool stopped');
    } catch (error) {
      console.error('Error stopping worker pool:', error);
    }
  }

  if (uploadCleanupService) {
    try {
      shutdownCleanupService();
      console.log('Upload cleanup service stopped');
    } catch (error) {
      console.error('Error stopping upload cleanup service:', error);
    }
  }

  if (importArtifactJanitor) {
    try {
      importArtifactJanitor.stop();
      console.log('Import artifact janitor stopped');
    } catch (error) {
      console.error('Error stopping import artifact janitor:', error);
    }
  }

  if (importRetentionService) {
    try {
      importRetentionService.stop();
      console.log('Import retention service stopped');
    } catch (error) {
      console.error('Error stopping import retention service:', error);
    }
  }

  try {
    if (databaseClient) {
      await databaseClient.close();
      console.log('Database connections closed');
    }
  } catch (error) {
    console.error('Error closing database connection:', error);
  }

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, start };

async function start(config?: ServerConfig) {
  try {
    if (config?.localDocsPath) process.env.LOCAL_DOCS_PATH = config.localDocsPath;
    if (config?.sqlitePath) process.env.SQLITE_PATH = config.sqlitePath;
    if (config?.storagePath) process.env.STORAGE_PATH = config.storagePath;

    const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
    const localDocsPath =
      process.env.LOCAL_DOCS_PATH?.replace('~', homeDir) || path.join(homeDir, '.keimenon');
    const sqlitePath =
      process.env.SQLITE_PATH?.replace('~', homeDir) || path.join(localDocsPath, 'keimenon.db');

    console.log('Initializing database (local mode)...');
    const dbClient = await DatabaseFactory.getClient({
      mode: 'local',
      local: {
        databasePath: sqlitePath,
        verbose: process.env.NODE_ENV === 'development',
      },
    });

    global.dbClient = dbClient;
    databaseClient = dbClient as any;

    if ((dbClient as any).assertImportSchemaCompatibility) {
      (dbClient as any).assertImportSchemaCompatibility();
      console.log('Import schema compatibility verified');
    }

    const coreProcessGateResult = await runCoreProcessVersionGate((dbClient as any).db);
    if (coreProcessGateResult.applied) {
      console.log(
        `[CoreProcessGate] ${coreProcessGateResult.reason} (requiresReimport=${coreProcessGateResult.requiresReimport})`
      );
      if (coreProcessGateResult.backupPath) {
        console.log(`[CoreProcessGate] Backup created at ${coreProcessGateResult.backupPath}`);
      }
    }

    await seedAdminAccount(dbClient as any);

    authService = new AuthService(dbClient as any);
    (global as any).authService = authService;

    storageService = getStorageService({
      basePath: process.env.STORAGE_PATH || './storage',
      maxSizeBytes: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10) * 1024 * 1024,
    });
    await storageService.init();
    (global as any).storageService = storageService;

    const localStore = getLocalDocumentStore({
      basePath: process.env.LOCAL_DOCS_PATH || undefined,
      enableDeduplication: true,
    });
    await localStore.initialize();

    sseBroadcaster = new SSEBroadcaster(
      parseInt(process.env.SSE_BROADCAST_INTERVAL_MS || '500', 10),
      parseInt(process.env.SSE_HEARTBEAT_INTERVAL_MS || '15000', 10)
    );
    sseBroadcaster.start();

    writeQueue = new DatabaseWriteQueue(dbClient, sseBroadcaster);
    writeQueue.start();

    const jobRepository = new SQLiteJobRepository((dbClient as any).db);
    (global as any).jobRepository = jobRepository;
    await recoverOrphanedJobs(jobRepository);

    if (sseBroadcaster) {
      sseBroadcaster.setJobRepository(jobRepository);
    }

    workerPool = new WorkerPool(
      jobRepository,
      new ConcurrencyGuard(jobRepository),
      new StartJob(jobRepository),
      {
        maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '3', 10),
        pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000', 10),
      },
      sseBroadcaster
    );
    workerPool.registerWorker(new ImportWorker(dbClient, writeQueue));
    workerPool.registerWorker(new DeleteWorker(dbClient));
    await workerPool.start();
    (global as any).workerPool = workerPool;

    const uploadRepo = new SQLiteUploadSessionRepository((dbClient as any).db);
    const cleanupIntervalMs = parseInt(process.env.UPLOAD_CLEANUP_INTERVAL_MS || '3600000', 10);
    uploadCleanupService = initializeCleanupService(uploadRepo, cleanupIntervalMs);

    importArtifactJanitor = new ImportArtifactJanitorService((dbClient as any).db);
    importArtifactJanitor.start();
    (global as any).importArtifactJanitor = importArtifactJanitor;

    importRetentionService = new ImportOperationalRetentionService((dbClient as any).db);
    importRetentionService.start();
    (global as any).importRetentionService = importRetentionService;

    const initializeRoutes = (context as any).initializeRoutes as
      | ((
          authService: AuthService,
          sseBroadcaster: SSEBroadcaster,
          workerPool: WorkerPool,
          writeQueue: DatabaseWriteQueue
        ) => void)
      | undefined;

    if (!initializeRoutes || !authService || !sseBroadcaster || !workerPool || !writeQueue) {
      throw new Error('App route initialization dependencies are not ready');
    }

    initializeRoutes(authService, sseBroadcaster, workerPool, writeQueue);

    const portToUse = Number(config?.port || defaultPort);
    const hostToUse = process.env.HOST || '0.0.0.0';

    server = app.listen(portToUse, hostToUse, () => {
      context.isReady = true;
      console.log(`Keimenon API running on ${hostToUse}:${portToUse}`);
      console.log(`Health check: http://${hostToUse}:${portToUse}/health`);
      console.log(`Readiness: http://${hostToUse}:${portToUse}/ready`);
      console.log(`API docs: http://${hostToUse}:${portToUse}/api/v1`);
    });

    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${portToUse} is already in use`);
      } else {
        console.error('Server error:', error);
      }
      process.exit(1);
    });

    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (
  (typeof require !== 'undefined' && require.main === module) ||
  (process.argv[1] && process.argv[1].endsWith('index.ts') && !process.env.ELECTRON_RUN_AS_NODE)
) {
  start();
}

export default app;
