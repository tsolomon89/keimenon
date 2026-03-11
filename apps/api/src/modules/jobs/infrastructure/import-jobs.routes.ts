/**
 * Import Jobs Routes
 *
 * File upload endpoint that creates background import jobs.
 * Replaces the synchronous /import/enhanced endpoint with async job-based processing.
 *
 * Flow:
 * 1. Accept multipart/form-data file upload
 * 2. Save files to temp storage
 * 3. Create import job with file paths
 * 4. Return job ID immediately
 * 5. Client monitors progress via SSE (/api/v1/stream/jobs)
 */

import { Router, Request, Response } from 'express';
import { AuthService } from '../../../services/auth.service';
import { requireAuth } from '../../../middleware/auth.middleware';
import { streamingUploadService } from '../../../services/streaming-upload';
import { SQLiteJobRepository } from './JobRepository';
import { EnqueueJob, EnqueueJobCommand } from '../application/EnqueueJob';
import { enqueueImportJob as enqueueImportJobWithConfig } from '../application/enqueue-import-job';
import { SSEBroadcaster } from './SSEBroadcaster';
import Database from 'better-sqlite3';
import { ulid } from 'ulid';
import { featureManifestForAccountClass } from '@keimenon/types';
import { normalizeImportOptions } from '../domain/import-config-contract';
import { appLogger } from '../../../utils/logger';

/**
 * Factory function to create import jobs routes
 */
export function createImportJobsRoutes(
  authService: AuthService,
  db: Database.Database,
  _workerPool?: any, // Reserved for signature compatibility during route cutover
  broadcaster?: SSEBroadcaster // For broadcasting new jobs to UI
): Router {
  const router = Router();

  // Initialize repository and use case
  const jobRepository = new SQLiteJobRepository(db);
  const enqueueJob = new EnqueueJob(jobRepository, broadcaster);

  /**
   * POST /api/v1/jobs/import
   * Upload files and create import job
   */
  router.post('/import', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // TENANCY SECURITY: Extract all tenancy fields from server-side validated token only
      // NEVER trust client-sent account_id, user_type, or membership fields
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const userEmail = (req as any).user?.email;
      const userType = (req as any).user?.user_type || 'user';
      const accountMembership = (req as any).user?.account_membership || 'member';
      const accountClass = ((req as any).user?.accountClass || 'free') as
        | 'free'
        | 'professional'
        | 'business';
      const operating = (req as any).operating;

      appLogger.info('jobs.import.request', {
        userId,
        userEmail,
        accountId: userAccountId,
        userType,
        accountMembership,
        contentType: req.headers['content-type'],
        testDbPath: (req as any).testDbPath || req.headers['x-test-db-path'],
      });

      if (!userAccountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;
      const actorId = ulid();

      // Handle streaming file upload
      const uploadResult = await streamingUploadService.handleUploadWithFields(req);
      const files = uploadResult.files;
      const fields = uploadResult.fields;

      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded',
        });
      }

      appLogger.info('jobs.import.uploaded', {
        accountId: targetAccountId,
        fileCount: files.length,
        files: files.map((f) => ({ fileName: f.fileName, sizeBytes: f.size })),
      });

      // Parse import configuration from form fields
      let importOptions = normalizeImportOptions();
      if (fields.config) {
        let parsedConfig: unknown;
        try {
          parsedConfig = JSON.parse(fields.config);
        } catch (error: any) {
          return res.status(400).json({
            success: false,
            error: `Invalid import config JSON: ${error.message}`,
          });
        }

        try {
          importOptions = normalizeImportOptions(parsedConfig);
        } catch (error: any) {
          return res.status(400).json({
            success: false,
            error: `Invalid import config: ${error.message}`,
          });
        }
      }

      const features = featureManifestForAccountClass(accountClass);
      if (!features.auto_graph) {
        return res.status(403).json({
          success: false,
          error: 'Current account tier does not permit automatic graph import.',
        });
      }

      const testContext =
        (req as any).testDbPath || req.headers['x-test-db-path']
          ? {
              dbPath: (req as any).testDbPath || (req.headers['x-test-db-path'] as string),
              testId: (req as any).testId,
            }
          : undefined;

      const result = await enqueueImportJobWithConfig(enqueueJob, {
        accountId: targetAccountId,
        createdBy: userId,
        files: files.map((f) => ({
          fileName: f.fileName,
          fileSize: f.size,
          mimeType: f.mimeType,
          filePath: f.filePath,
        })),
        importOptions,
        processingRail: 'multipart',
        source: 'jobs-import-route',
        tenancy: {
          actorId,
          userId,
          accountId: targetAccountId,
          userType,
          accountMembership,
          userEmail,
          accountClass,
          features,
        },
        testContext,
      });

      appLogger.info('jobs.import.created', {
        jobId: result.jobId,
        status: result.status,
        accountId: targetAccountId,
        actorId,
      });

      return res.status(201).json({
        success: true,
        jobId: result.jobId,
        uploadIds: files.map((f) => f.uploadId),
        message: 'Import job created. Monitor progress via SSE at /api/v1/stream/jobs',
        job: result.job.toJSON(),
      });
    } catch (error: any) {
      appLogger.error('jobs.import.failed', {
        message: error?.message || 'Failed to create import job',
      });
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to create import job',
      });
    }
  });

  /**
   * POST /api/v1/jobs/delete
   * Create delete job
   */
  router.post('/delete', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // TENANCY SECURITY: Extract from server-side validated token only
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const userEmail = (req as any).user?.email;
      const userType = (req as any).user?.user_type || 'user';
      const accountMembership = (req as any).user?.account_membership || 'member';
      const operating = (req as any).operating;

      if (!userAccountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;
      const testContext =
        (req as any).testDbPath || req.headers['x-test-db-path']
          ? {
              dbPath: (req as any).testDbPath || (req.headers['x-test-db-path'] as string),
              testId: (req as any).testId,
            }
          : undefined;

      // Generate stable actor_id for audit
      const actorId = ulid();

      const { scope } = req.body;

      if (!scope || !['keimenon', 'all-clients'].includes(scope)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid scope. Must be "keimenon" or "all-clients"',
        });
      }

      // CONCURRENT DELETION PREVENTION: Check for active delete jobs
      // Prevents data corruption and race conditions from simultaneous deletions
      const activeDeleteJobs = await jobRepository.find({
        accountId: targetAccountId,
        type: 'delete',
        status: ['queued', 'running'],
        limit: 1,
      });

      if (activeDeleteJobs.length > 0) {
        const activeJob = activeDeleteJobs[0];

        // Record concurrent deletion attempt for metrics
        const { getDeleteMetrics } = await import('../../../services/metrics/DeleteMetrics');
        const deleteMetrics = getDeleteMetrics();
        deleteMetrics.recordConcurrentAttempt(targetAccountId, scope);

        return res.status(409).json({
          success: false,
          error: 'A delete operation is already in progress for this account',
          activeJobId: activeJob.id,
          activeJobStatus: activeJob.status,
          message: 'Please wait for the current deletion to complete before starting a new one',
        });
      }

      // Create delete job with exclusive lock and tenancy metadata
      const accountType = (req as any).user?.accountType;
      const command: EnqueueJobCommand = {
        type: 'delete',
        accountId: targetAccountId,
        createdBy: userId,
        config: {
          deleteScope: scope,
          // Admin flag: allows DeleteWorker to skip account filtering
          // so admins can delete ALL keimenon data (matching graph view behavior)
          isAdmin: accountType === 'admin',
          // Include tenancy for audit purposes
          tenancy: {
            actorId,
            userId,
            accountId: targetAccountId,
            userType,
            accountMembership,
            userEmail,
          },
          testContext,
        },
        idempotencyKey: undefined,
        concurrencyGroup: `delete:${targetAccountId}`, // Exclusive lock for deletes
      };

      const result = await enqueueJob.execute(command);

      appLogger.info('jobs.delete.created', {
        jobId: result.jobId,
        scope,
        accountId: targetAccountId,
        actorId,
      });

      return res.status(201).json({
        success: true,
        jobId: result.jobId,
        message: 'Delete job created. Monitor progress via SSE at /api/v1/stream/jobs',
        job: result.job.toJSON(),
      });
    } catch (error: any) {
      appLogger.error('jobs.delete.failed', {
        message: error?.message || 'Failed to create delete job',
      });
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to create delete job',
      });
    }
  });

  return router;
}
