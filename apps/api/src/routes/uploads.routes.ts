/**
 * Chunked Upload Routes
 *
 * RESTful API for resumable chunked file uploads.
 * Supports large files (up to 2GB) with pause/resume capability.
 *
 * Endpoints:
 * - POST /initiate - Create upload session and job
 * - POST /:sessionId/chunks/:chunkIndex - Upload chunk data
 * - GET /:sessionId - Get upload status and missing chunks
 * - DELETE /:sessionId - Cancel upload session
 *
 * Related: Chunked Upload System - Phase 2
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { AuthService } from '../services/auth.service';
import { getDbClient } from '../utils/get-db-client';
import { ErrorFactory } from '../middleware/error-handler.middleware';
import {
  SQLiteUploadSessionRepository,
  UploadSessionRepository,
} from '../modules/uploads/infrastructure/UploadSessionRepository';
import { UploadSession, UploadSessionSpec } from '../modules/uploads/domain/UploadSession';
import { EnqueueJob } from '../modules/jobs/application/EnqueueJob';
import { enqueueImportJob as enqueueImportJobWithConfig } from '../modules/jobs/application/enqueue-import-job';
import { SQLiteJobRepository } from '../modules/jobs/infrastructure/JobRepository';
import {
  ImportConfigSchema,
  normalizeImportOptions,
} from '../modules/jobs/domain/import-config-contract';
import { featureManifestForAccountClass } from '@keimenon/types';
import { ChunkAssemblyService } from '../modules/uploads/application/ChunkAssemblyService';
import Database from 'better-sqlite3';
import busboy from 'busboy';
import { createWriteStream } from 'fs';
import { mkdir, statfs, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { ulid } from 'ulid';
import { sanitizeUploadFilename } from '../utils/upload-filename';
import { appLogger } from '../utils/logger';

// ============================================================================
// Request/Response Schemas
// ============================================================================

/**
 * POST /initiate request body
 */
const InitiateUploadSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z.number().int().positive('File size must be positive'),
  mimeType: z.string().optional(),
  chunkSize: z.number().int().positive().optional(), // Optional, defaults to 10MB
  jobId: z.string().optional(), // Optional: Associate with existing job
  importConfig: ImportConfigSchema, // Required + schema-validated for rail parity
  uploadHash: z.string().optional(),
});

type InitiateUploadRequest = z.infer<typeof InitiateUploadSchema>;

/**
 * POST /initiate response
 */
interface InitiateUploadResponse {
  success: true;
  data: {
    session: {
      id: string;
      fileName: string;
      fileSize: number;
      chunkSize: number;
      totalChunks: number;
      expiresAt: number;
      status: string;
    };
    jobId: string | null; // Job ID (set after assembly completes)
  };
}

/**
 * GET /:sessionId response
 */
interface SessionStatusResponse {
  success: true;
  data: {
    session: {
      id: string;
      fileName: string;
      fileSize: number;
      chunkSize: number;
      totalChunks: number;
      chunksReceived: number;
      missingChunks: number[];
      progress: number; // 0-100 percentage
      status: string;
      expiresAt: number;
      errorMessage: string | null;
    };
  };
}

/**
 * POST /:sessionId/chunks/:chunkIndex response
 */
interface ChunkUploadResponse {
  success: true;
  data: {
    chunkIndex: number;
    chunksReceived: number;
    totalChunks: number;
    progress: number; // 0-100 percentage
    status: string;
    isComplete: boolean;
    jobId?: string; // Set when isComplete=true and job is created
  };
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create upload routes with auth service
 */
export function createUploadRoutes(authService: AuthService): Router {
  const router = Router();

  // ============================================================================
  // Endpoint 1: POST /initiate - Create Upload Session
  // ============================================================================

  /**
   * POST /api/v1/uploads/initiate
   *
   * Creates a new upload session and associated import job.
   * Returns session details including chunk size and expiry.
   *
   * Request Body:
   * {
   *   fileName: string,
   *   fileSize: number,
   *   mimeType?: string,
   *   chunkSize?: number (default: 10MB)
   * }
   *
   * Response:
   * {
   *   success: true,
   *   session: { id, fileName, chunkSize, totalChunks, expiresAt, status },
   *   jobId: string
   * }
   */
  router.post('/initiate', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // Extract auth context
      const accountId = (req as any).user?.accountId;
      const userId = (req as any).user?.userId;
      const userEmail = (req as any).user?.email;
      const accountClass = ((req as any).user?.accountClass || 'free') as
        | 'free'
        | 'professional'
        | 'business';

      if (!accountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Validate request body
      const body = InitiateUploadSchema.parse(req.body);
      const importOptions = normalizeImportOptions(body.importConfig);
      const features = featureManifestForAccountClass(accountClass);
      if (!features.auto_graph) {
        return res.status(403).json({
          success: false,
          error: 'Current account tier does not permit automatic graph import.',
        });
      }
      const sanitized = sanitizeUploadFilename(body.fileName);

      appLogger.info('upload.initiate', {
        accountId,
        userId,
        userEmail,
        fileName: sanitized.sanitized,
        originalFileName: sanitized.original,
        sizeBytes: body.fileSize,
      });

      // Get database client
      const db = await getDbClient(req);
      const sqliteDb = (db as any).db as Database.Database; // Access underlying SQLite database

      // CONCURRENT DELETION / DUPLICATE IMPORT DETECT GATE
      if (body.uploadHash) {
        const duplicateJob = sqliteDb
          .prepare(
            `
          SELECT id, status FROM jobs 
          WHERE account_id = ? 
            AND type = 'import' 
            AND status IN ('queued', 'running', 'succeeded') 
            AND json_extract(config, '$.metadata.uploadHash') = ?
          LIMIT 1
        `
          )
          .get(accountId, body.uploadHash) as { id: string; status: string } | undefined;

        if (duplicateJob) {
          appLogger.warn('upload.initiate.collision_prevented', {
            accountId,
            uploadHash: body.uploadHash,
            existingJobId: duplicateJob.id,
            existingJobStatus: duplicateJob.status,
          });

          return res.status(409).json({
            success: false,
            error: 'This exact file has already been imported.',
            code: 'IMPORT_COLLISION',
            details: {
              activeJobId: duplicateJob.id,
              activeJobStatus: duplicateJob.status,
            },
          });
        }
      }

      // Create repository
      const uploadRepo: UploadSessionRepository = new SQLiteUploadSessionRepository(sqliteDb);

      // Create upload session spec
      const sessionSpec: UploadSessionSpec = {
        accountId,
        userId,
        jobId: body.jobId, // Optional: Will be set after assembly completes
        fileName: sanitized.sanitized,
        fileSize: body.fileSize,
        mimeType: body.mimeType || 'application/json',
        chunkSize: body.chunkSize,
        metadata: {
          importConfig: importOptions,
          accountClass,
          features,
          originalFileName: sanitized.original || undefined,
          uploadHash: body.uploadHash, // Store the hash in session metadata if provided at initiate
        },
      };

      // Create session in database
      const session = await uploadRepo.create(sessionSpec);

      appLogger.info('upload.initiate.created', {
        sessionId: session.id,
        accountId,
        jobId: session.jobId || null,
        totalChunks: session.totalChunks,
        chunkSize: session.chunkSize,
        expiresAt: session.expiresAt,
      });

      // Prepare chunk storage directory
      await mkdir(session.chunksPath, { recursive: true });

      // Return session details (use toJSON() to include computed fields)
      const response: InitiateUploadResponse = {
        success: true,
        data: {
          session: session.toJSON(), // Use toJSON() to include progress, chunksPath, chunksUploaded, missingChunks
          jobId: session.jobId, // Will be null initially, set after assembly
        },
      };

      return res.status(201).json(response);
    } catch (error: any) {
      // Handle Zod validation errors (quiet in test by default)
      if (error.name === 'ZodError') {
        if (process.env.NODE_ENV !== 'test' || process.env.UPLOAD_LOG_VALIDATION_ERRORS === '1') {
          appLogger.warn('upload.initiate.validation_failed', {
            error: error.message,
          });
        }
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }

      appLogger.error('upload.initiate.error', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to initiate upload',
        message: error.message,
      });
    }
  });

  // ============================================================================
  // Endpoint 2: POST /:sessionId/chunks/:chunkIndex - Upload Chunk
  // ============================================================================

  /**
   * POST /api/v1/uploads/:sessionId/chunks/:chunkIndex
   *
   * Uploads a single chunk of data to the session.
   * Accepts raw binary data (application/octet-stream).
   *
   * Request:
   * - Content-Type: application/octet-stream
   * - Body: Binary chunk data
   *
   * Response:
   * {
   *   success: true,
   *   chunkIndex: number,
   *   chunksReceived: number,
   *   totalChunks: number,
   *   progress: number,
   *   status: string,
   *   isComplete: boolean
   * }
   */
  router.post(
    '/:sessionId/chunks/:chunkIndex',
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const { sessionId, chunkIndex } = req.params;
        const accountId = (req as any).user?.accountId;
        const userId = (req as any).user?.userId;

        if (!accountId || !userId) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
          });
        }

        // Parse chunk index
        const chunkIdx = parseInt(chunkIndex, 10);
        if (isNaN(chunkIdx) || chunkIdx < 0) {
          return res.status(400).json({
            success: false,
            error: 'Invalid chunk index',
          });
        }

        appLogger.debug('upload.chunk.request', {
          sessionId,
          chunkIndex: chunkIdx,
          contentType: req.headers['content-type'],
          contentLength: req.headers['content-length'],
        });

        // Get database client
        const db = await getDbClient(req);
        const sqliteDb = (db as any).db as Database.Database;
        const uploadRepo: UploadSessionRepository = new SQLiteUploadSessionRepository(sqliteDb);

        // Load session with account isolation
        let session = await uploadRepo.findById(sessionId, accountId);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Upload session not found or access denied',
          });
        }

        // Check session expiry
        if (session.isExpired()) {
          session.expire();
          await uploadRepo.save(session);

          return res.status(410).json({
            success: false,
            error: 'Upload session has expired',
          });
        }

        // Check session status
        if (session.status === 'failed' || session.status === 'expired') {
          return res.status(400).json({
            success: false,
            error: `Cannot upload chunk: session status is ${session.status}`,
          });
        }

        // Validate chunk index
        if (chunkIdx >= session.totalChunks) {
          return res.status(400).json({
            success: false,
            error: `Invalid chunk index: ${chunkIdx}. Must be between 0 and ${session.totalChunks - 1}`,
          });
        }

        // Check disk space before writing chunk
        try {
          const stats = await statfs(session.chunksPath);
          const availableBytes = stats.bavail * stats.bsize;
          const remainingFileSize = session.fileSize - chunkIdx * session.chunkSize;

          if (availableBytes < remainingFileSize * 1.1) {
            const availableMB = Math.round(availableBytes / 1024 / 1024);
            const neededMB = Math.round(remainingFileSize / 1024 / 1024);
            throw new Error(
              `Insufficient disk space: ${availableMB}MB available, need ~${neededMB}MB`
            );
          }
        } catch (err: any) {
          if (err.message.includes('Insufficient disk space')) throw err;
          // statfs may fail on some systems (e.g., Windows), continue anyway
          appLogger.warn('upload.chunk.disk_space_check_unavailable', {
            sessionId,
            chunkIndex: chunkIdx,
            error: err.message,
          });
        }

        // Write chunk to disk
        const chunkPath = join(session.chunksPath, `chunk_${chunkIdx}`);
        // In test and JSON-body middleware contexts, binary payload may already be buffered on req.body.
        if (Buffer.isBuffer(req.body) || req.body instanceof Uint8Array) {
          await writeFile(chunkPath, Buffer.from(req.body));
        } else {
          const writeStream = createWriteStream(chunkPath);

          // Fallback for true streaming uploads
          await new Promise<void>((resolve, reject) => {
            req.pipe(writeStream);
            writeStream.on('finish', () => resolve());
            writeStream.on('error', (error: NodeJS.ErrnoException) => {
              appLogger.error('upload.chunk.stream_write_failed', {
                code: error.code,
                syscall: error.syscall,
                message: error.message,
                sessionId,
                chunkIndex: chunkIdx,
                chunkPath,
              });
              reject(error);
            });
          });
        }

        // Record chunk atomically (race-condition safe for concurrent uploads)
        // This uses SQLite json_set() to merge the chunk into chunks_received
        const updatedSession = await uploadRepo.recordChunkAtomic(sessionId, accountId, chunkIdx);
        if (!updatedSession) {
          return res.status(404).json({
            success: false,
            error: 'Session not found or no longer accepting uploads',
          });
        }

        // Use the updated session from the atomic operation
        session = updatedSession;

        appLogger.debug('upload.chunk.saved', {
          sessionId,
          chunkIndex: chunkIdx,
          progress: session.getProgress(),
        });

        // Check if upload is complete
        const isComplete = session.isComplete();
        appLogger.debug('upload.chunk.completion_check', {
          sessionId,
          chunkIndex: chunkIdx,
          isComplete,
        });

        if (isComplete) {
          appLogger.info('upload.chunk.complete', {
            sessionId,
            totalChunks: session.totalChunks,
          });
          const assemblyService = new ChunkAssemblyService(uploadRepo);
          try {
            const result = await assemblyService.triggerAssembly(sessionId, accountId);

            if (result.success) {
              appLogger.info('upload.assembly.complete', {
                sessionId,
                filePath: result.filePath,
                fileSize: result.fileSize,
              });

              try {
                await triggerImportJobFromAssembledFile(
                  session,
                  result.filePath!,
                  result.fileSize!,
                  accountId,
                  sqliteDb,
                  uploadRepo,
                  req
                );

                const updatedSession = await uploadRepo.findById(sessionId, accountId);
                if (updatedSession) {
                  session = updatedSession;
                  appLogger.info('upload.session.job_linked', {
                    sessionId,
                    jobId: session.jobId,
                  });
                }
              } catch (importError: any) {
                appLogger.error('upload.import_trigger_failed', {
                  sessionId,
                  error: importError.message,
                });
                session.markFailed(
                  `Assembly succeeded but import job creation failed: ${importError.message}`
                );
                await uploadRepo.save(session);
              }
            } else {
              appLogger.error('upload.assembly.failed', {
                sessionId,
                error: result.errorMessage,
              });
              session.markFailed(`Assembly failed: ${result.errorMessage}`);
              await uploadRepo.save(session);
            }
          } catch (error: any) {
            appLogger.error('upload.assembly.error', {
              sessionId,
              error: error.message,
            });
            session.markFailed(`Assembly error: ${error.message}`);
            await uploadRepo.save(session);
          }
        }

        // Return progress (including jobId when assembly is complete)
        const response: ChunkUploadResponse = {
          success: true,
          data: {
            chunkIndex: chunkIdx,
            chunksReceived: session.toJSON().chunksReceived
              ? Object.keys(session.toJSON().chunksReceived).length
              : 0,
            totalChunks: session.totalChunks,
            progress: session.getProgress(),
            status: session.status,
            isComplete,
            // ✅ FIX: Include jobId when assembly is complete
            ...(isComplete && session.jobId ? { jobId: session.jobId } : {}),
          },
        };

        return res.status(200).json(response);
      } catch (error: any) {
        appLogger.error('upload.chunk.error', {
          sessionId: req.params.sessionId,
          chunkIndex: req.params.chunkIndex,
          error: error.message,
        });

        return res.status(500).json({
          success: false,
          error: 'Failed to upload chunk',
          message: error.message,
        });
      }
    }
  );
  // ============================================================================
  // Endpoint 3: GET /:sessionId - Get Upload Status
  // ============================================================================

  /**
   * GET /api/v1/uploads/:sessionId
   *
   * Retrieves the current status of an upload session.
   * Returns session details, progress, and list of missing chunks for resume.
   *
   * Response:
   * {
   *   success: true,
   *   session: {
   *     id, fileName, fileSize, chunkSize, totalChunks,
   *     chunksReceived, missingChunks[], progress, status, expiresAt
   *   }
   * }
   */
  router.get('/:sessionId', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const accountId = (req as any).user?.accountId;
      const userId = (req as any).user?.userId;

      if (!accountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Get database client
      const db = await getDbClient(req);
      const sqliteDb = (db as any).db as Database.Database;
      const uploadRepo: UploadSessionRepository = new SQLiteUploadSessionRepository(sqliteDb);

      // Load session with account isolation
      const session = await uploadRepo.findById(sessionId, accountId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Upload session not found or access denied',
        });
      }

      // Get session data with all computed fields
      const sessionData = session.toJSON();

      // Return session status (use toJSON() to include all computed fields)
      const response: SessionStatusResponse = {
        success: true,
        data: {
          session: {
            ...sessionData,
            chunksReceived: Object.keys(sessionData.chunksReceived).length,
            progress: sessionData.progress || 0,
            missingChunks: sessionData.missingChunks || [],
          },
        },
      };

      return res.status(200).json(response);
    } catch (error: any) {
      appLogger.error('upload.status.error', {
        sessionId: req.params.sessionId,
        message: error?.message || 'Failed to get upload status',
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get upload status',
        message: error.message,
      });
    }
  });

  // ============================================================================
  // Endpoint 4: DELETE /:sessionId - Cancel Upload
  // ============================================================================

  /**
   * DELETE /api/v1/uploads/:sessionId
   *
   * Cancels an upload session and cleans up chunk files.
   *
   * Response:
   * {
   *   success: true,
   *   message: 'Upload session cancelled'
   * }
   */
  router.delete('/:sessionId', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const accountId = (req as any).user?.accountId;
      const userId = (req as any).user?.userId;

      if (!accountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Get database client
      const db = await getDbClient(req);
      const sqliteDb = (db as any).db as Database.Database;
      const uploadRepo: UploadSessionRepository = new SQLiteUploadSessionRepository(sqliteDb);

      // Load session to get chunks path
      const session = await uploadRepo.findById(sessionId, accountId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Upload session not found or access denied',
        });
      }

      // Delete chunk files (best effort - don't fail if files missing)
      const fs = require('fs').promises;
      try {
        await fs.rm(session.chunksPath, { recursive: true, force: true });
      } catch (cleanupError) {
        appLogger.warn('upload.cancel.cleanup_warn', {
          sessionId,
          message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }

      // Delete session from database
      await uploadRepo.delete(sessionId, accountId);

      return res.status(200).json({
        success: true,
        data: {
          message: 'Upload session cancelled',
        },
      });
    } catch (error: any) {
      appLogger.error('upload.cancel.error', {
        sessionId: req.params.sessionId,
        message: error?.message || 'Failed to cancel upload',
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to cancel upload',
        message: error.message,
      });
    }
  });

  return router;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Trigger import job processing from assembled file
 *
 * Called after chunk assembly completes successfully.
 * Creates an import job with the assembled file path for processing by ImportWorker.
 *
 * Related:
 * - apps/api/src/modules/workers/infrastructure/ImportWorker.ts (processes the file)
 * - apps/api/src/modules/jobs/infrastructure/JobRepository.ts (stores job)
 * - apps/api/src/modules/workers/domain/WorkerPool.ts (dispatches job to worker)
 */
async function triggerImportJobFromAssembledFile(
  session: UploadSession,
  assembledFilePath: string,
  fileSize: number,
  accountId: string,
  db: Database.Database,
  uploadRepo: UploadSessionRepository,
  req: Request // ✅ For test isolation context (testDbPath)
): Promise<void> {
  appLogger.info('upload.import.trigger', {
    sessionId: session.id,
    fileName: session.fileName,
    sizeBytes: fileSize,
    assembledFilePath,
  });

  // ✅ FIX: Reload session from database to get latest state after assembly
  // The session object passed in is stale (from chunk upload handler)
  // Assembly service has updated the session status to "completed"
  const freshSession = await uploadRepo.findById(session.id, accountId);
  if (!freshSession) {
    throw new Error(`Session not found: ${session.id}`);
  }

  // Create job repository / enqueue use case
  const jobRepo = new SQLiteJobRepository(db);
  const enqueueJob = new EnqueueJob(jobRepo, (global as any).workerPool?.broadcaster);

  const importOptions = normalizeImportOptions(freshSession.metadata?.importConfig);

  const testDbPath = (req as any).testDbPath;
  const testContext = testDbPath ? { dbPath: testDbPath, testId: (req as any).testId } : undefined;
  const userType = (req as any).user?.user_type || 'user';
  const accountMembership = (req as any).user?.account_membership || 'member';
  const userEmail = (req as any).user?.email || 'unknown';
  const accountClass = ((req as any).user?.accountClass || 'free') as
    | 'free'
    | 'professional'
    | 'business';
  const features = featureManifestForAccountClass(accountClass);
  if (!features.auto_graph) {
    throw new Error('Current account tier does not permit automatic graph import.');
  }
  const actorId = ulid();

  const result = await enqueueImportJobWithConfig(enqueueJob, {
    accountId,
    createdBy: freshSession.userId,
    files: [
      {
        fileName: freshSession.fileName,
        fileSize: fileSize,
        mimeType: freshSession.mimeType ?? 'application/octet-stream',
        filePath: assembledFilePath,
      },
    ],
    importOptions,
    processingRail: 'chunked',
    source: 'chunked-upload',
    tenancy: {
      actorId,
      userId: freshSession.userId,
      accountId,
      userType,
      accountMembership,
      userEmail,
      accountClass,
      features,
    },
    testContext,
    metadata: {
      uploadSessionId: freshSession.id,
      chunkCount: freshSession.totalChunks,
      uploadedAt: new Date().toISOString(),
      uploadHash: freshSession.metadata?.uploadHash,
    },
  });

  // Update upload session with job ID
  freshSession.setJobId(result.jobId);
  await uploadRepo.save(freshSession);
  appLogger.info('upload.import.session_linked', {
    sessionId: freshSession.id,
    jobId: result.jobId,
  });
}
