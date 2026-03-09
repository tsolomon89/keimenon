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
 *
 * Related:
 * - apps/api/src/routes/import-enhanced.ts (legacy synchronous endpoint)
 * - apps/api/src/modules/workers/infrastructure/ImportWorker.ts
 */

import express, { Router, Request, Response } from 'express';
import { AuthService } from '../../../services/auth.service';
import { requireAuth } from '../../../middleware/auth.middleware';
import { streamingUploadService } from '../../../services/streaming-upload';
import { SQLiteJobRepository } from './JobRepository';
import { EnqueueJob, EnqueueJobCommand } from '../application/EnqueueJob';
import { enqueueImportJob as enqueueImportJobWithConfig } from '../application/enqueue-import-job';
import { RetryJob } from '../application/RetryJob';
import { SSEBroadcaster } from './SSEBroadcaster';
import Database from 'better-sqlite3';
import { ulid } from 'ulid';
import { normalizeImportOptions } from '../domain/import-config-contract';

/**
 * Factory function to create import jobs routes
 */
export function createImportJobsRoutes(
  authService: AuthService,
  db: Database.Database,
  workerPool?: any, // WorkerPool instance for signaling active workers
  broadcaster?: SSEBroadcaster // For broadcasting new jobs to UI
): Router {
  const router = Router();

  // CRITICAL: Add JSON body parser middleware for POST /delete endpoint
  // The /delete endpoint expects { scope: 'keimenon' | 'all-clients' } in request body
  router.use(express.json());

  // Initialize repository and use case
  const jobRepository = new SQLiteJobRepository(db);
  const enqueueJob = new EnqueueJob(jobRepository, broadcaster);
  const retryJob = new RetryJob(jobRepository, broadcaster);

  /**
   * POST /api/v1/jobs/import
   * Upload files and create import job
   *
   * Content-Type: multipart/form-data
   *
   * Form fields:
   * - files: File[] (one or more files)
   * - config: JSON string (optional import configuration)
   *
   * Returns:
   * {
   *   success: true,
   *   jobId: string,
   *   uploadIds: string[],
   *   message: string
   * }
   */
  router.post('/import', requireAuth(authService), async (req: Request, res: Response) => {
    console.log(`[Import Route] 📨 Received import request`);
    console.log(`  - Content-Type: ${req.headers['content-type']}`);
    console.log(`  - Files: ${(req as any).files?.length || 0}`);
    console.log(`  - Body keys: ${Object.keys(req.body).join(', ')}`);
    console.log(`  - Test DB Path: ${(req as any).testDbPath || req.headers['x-test-db-path']}`);

    try {
      // TENANCY SECURITY: Extract all tenancy fields from server-side validated token only
      // NEVER trust client-sent account_id, user_type, or membership fields
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const userEmail = (req as any).user?.email;
      const userType = (req as any).user?.user_type || 'user'; // Extract from token
      const accountMembership = (req as any).user?.account_membership || 'member'; // Extract from token
      const operating = (req as any).operating;

      console.log('📦 IMPORT JOB START ============================================');
      console.log(`  User: ${userEmail} (${userId})`);
      console.log(`  Account: ${userAccountId}`);
      console.log(`  User Type: ${userType}`);
      console.log(`  Membership: ${accountMembership}`);
      console.log(`  Timestamp: ${new Date().toISOString()}`);
      console.log(`  [IMPORT JOB DEBUG] req.testDbPath: ${(req as any).testDbPath}`);
      console.log(`  [IMPORT JOB DEBUG] Headers:`, JSON.stringify(req.headers));

      if (!userAccountId || !userId) {
        console.log('  ❌ IMPORT JOB FAILED: Missing authentication');
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;
      // Generate stable actor_id (ULID) for this operation
      // This identifies the (user, account, action) tuple for audit purposes
      const actorId = ulid();
      console.log(`  Actor ID: ${actorId}`);

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

      console.log(`  📁 Uploaded ${files.length} file(s):`);
      files.forEach((f) => {
        console.log(`     - ${f.fileName} (${(f.size / 1024).toFixed(2)} KB)`);
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

      const testContext =
        (req as any).testDbPath || req.headers['x-test-db-path']
          ? {
              dbPath: (req as any).testDbPath || (req.headers['x-test-db-path'] as string),
              testId: (req as any).testId,
            }
          : undefined;

      // DEBUG: Verify testContext is set correctly
      if (testContext?.dbPath) {
        console.log('[IMPORT JOB CREATE] Test context set in job config:', testContext.dbPath);
      } else {
        console.log('[IMPORT JOB CREATE] No test context (production mode)');
      }

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
        },
        testContext,
      });

      console.log(`  ✅ Import job created: ${result.jobId}`);
      console.log(`  Status: ${result.status}`);
      console.log('================================================================');

      return res.status(201).json({
        success: true,
        jobId: result.jobId,
        uploadIds: files.map((f) => f.uploadId),
        message: `Import job created. Monitor progress via SSE at /api/v1/stream/jobs`,
        job: result.job.toJSON(),
      });
    } catch (error: any) {
      console.error('❌ Error creating import job:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to create import job',
      });
    }
  });

  /**
   * POST /api/v1/jobs/delete
   * Create delete job
   *
   * Body:
   * {
   *   scope: 'keimenon' | 'all-clients'
   * }
   *
   * Returns:
   * {
   *   success: true,
   *   jobId: string
   * }
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

        // ⏱️ Record concurrent deletion attempt for metrics
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

      console.log(`🗑️  Delete job created: ${result.jobId} (scope: ${scope})`);

      return res.status(201).json({
        success: true,
        jobId: result.jobId,
        message: `Delete job created. Monitor progress via SSE at /api/v1/stream/jobs`,
        job: result.job.toJSON(),
      });
    } catch (error: any) {
      console.error('Error creating delete job:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to create delete job',
      });
    }
  });

  /**
   * DELETE /api/v1/jobs/:jobId
   * Delete a specific job (hard delete from database)
   *
   * Use case: Remove failed/completed jobs from history
   */
  router.delete('/:jobId', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;

      // ==================== ENHANCED DELETE REQUEST DIAGNOSTICS ====================
      const { jobId } = req.params;
      console.log('='.repeat(80));
      console.log(`[API DELETE] Incoming DELETE request for job: ${jobId}`);
      console.log(`[API DELETE] User ID: ${userId}`);
      console.log(`[API DELETE] User Account ID: ${userAccountId}`);
      console.log(`[API DELETE] Operating context:`, operating);
      console.log(`[API DELETE] Request headers:`, {
        'x-operating-account': req.headers['x-operating-account'],
        'x-operating-mode': req.headers['x-operating-mode'],
        authorization: req.headers.authorization ? 'Bearer [token]' : 'missing',
      });
      // ==================== END REQUEST DIAGNOSTICS ====================

      if (!userAccountId || !userId) {
        console.error(`[API DELETE] ❌ Authentication failed for job ${jobId}`);
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      const targetAccountId = operating?.accountId || userAccountId;
      console.log(`[API DELETE] Target account ID: ${targetAccountId}`);

      // Verify job exists and belongs to this account
      console.log(`[API DELETE] Looking up job ${jobId} in account ${targetAccountId}...`);
      const job = await jobRepository.findById(jobId, targetAccountId, req);

      if (!job) {
        console.error(`[API DELETE] ❌ Job ${jobId} NOT FOUND in account ${targetAccountId}`);
        console.error(`[API DELETE] 💡 Possible reasons:`);
        console.error(`   - Job doesn't exist in database`);
        console.error(`   - Job belongs to a different account`);
        console.error(`   - Job was already deleted`);
        console.log('='.repeat(80));
        return res.status(404).json({
          success: false,
          error: 'Job not found or access denied',
        });
      }

      console.log(`[API DELETE] ✅ Job found:`, {
        jobId: job.id,
        type: job.type,
        status: job.status,
        accountId: job.accountId,
      });

      // Broadcast deletion event to UI BEFORE deleting from database
      // This allows the UI to remove the job from its state immediately
      if (workerPool?.broadcaster) {
        // Broadcast a minimal payload instead of spreading the class instance.
        // This avoids leaking internals and keeps SSE payload shape predictable.
        const deletedJob = {
          id: job.id,
          accountId: job.accountId,
          type: job.type,
          status: 'deleted' as const,
          progress: { current: 0, total: 0, percent: 0 },
          config: job.config,
        };
        console.log(`[API DELETE] 📡 Broadcasting deletion event via SSE for job ${jobId}`);
        workerPool.broadcaster.broadcastJobUpdate(deletedJob);
      } else {
        console.warn(`[API DELETE] ⚠️  No broadcaster available - SSE update will NOT be sent`);
      }

      // Delete job from database
      console.log(`[API DELETE] Deleting job ${jobId} from database...`);
      await jobRepository.delete(jobId, targetAccountId, req);

      console.log(`[API DELETE] ✅ SUCCESS: Job deleted from database`);
      console.log(
        `[API DELETE] 🗑️  Job details: ${jobId} (type: ${job.type}, status: ${job.status})`
      );
      console.log('='.repeat(80));

      return res.status(200).json({
        success: true,
        message: 'Job deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting job:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete job',
      });
    }
  });

  /**
   * POST /api/v1/jobs/:jobId/retry
   * Retry a failed job
   *
   * Creates a new job with the same configuration
   */
  router.post('/:jobId/retry', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;

      if (!userAccountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      const targetAccountId = operating?.accountId || userAccountId;
      const { jobId } = req.params;

      // Find original job
      const originalJob = await jobRepository.findById(jobId, targetAccountId, req);

      if (!originalJob) {
        return res.status(404).json({
          success: false,
          error: 'Job not found or access denied',
        });
      }

      // Only allow retry for failed or canceled jobs
      if (originalJob.status !== 'failed' && originalJob.status !== 'canceled') {
        return res.status(400).json({
          success: false,
          error: `Cannot retry job with status: ${originalJob.status}. Only failed or canceled jobs can be retried.`,
        });
      }

      const retryResult = await retryJob.execute({
        jobId,
        accountId: targetAccountId,
        retriedBy: userId,
      });

      if (!retryResult.success || !retryResult.newJob) {
        return res.status(400).json({
          success: false,
          error: retryResult.error || 'Failed to retry job',
        });
      }

      console.log(
        `🔄 Job retried: ${jobId} -> ${retryResult.newJob.id} (type: ${originalJob.type})`
      );

      return res.status(201).json({
        success: true,
        jobId: retryResult.newJob.id,
        originalJobId: jobId,
        message: 'Job retried successfully',
        job: retryResult.newJob.toJSON(),
      });
    } catch (error: any) {
      console.error('Error retrying job:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to retry job',
      });
    }
  });

  /**
   * POST /api/v1/jobs/:jobId/cancel
   * Cancel a running or pending job
   *
   * Marks job as canceled (worker will check status and stop)
   */
  router.post('/:jobId/cancel', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;

      if (!userAccountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      const targetAccountId = operating?.accountId || userAccountId;
      const { jobId } = req.params;

      // Find job
      const job = await jobRepository.findById(jobId, targetAccountId, req);

      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found or access denied',
        });
      }

      // Only allow cancel for queued or running jobs
      if (job.status !== 'queued' && job.status !== 'running') {
        return res.status(400).json({
          success: false,
          error: `Cannot cancel job with status: ${job.status}. Only queued or running jobs can be canceled.`,
        });
      }

      // Mark job as canceled in database
      job.cancel();
      await jobRepository.save(job);

      console.log(`⛔ Job canceled in DB: ${jobId} (type: ${job.type})`);

      // If WorkerPool is available, signal the worker to stop
      // Note: job.cancel() was already called above, so status is now 'canceled'
      if (workerPool) {
        const signaled = await workerPool.cancelJob(jobId, targetAccountId);
        if (signaled) {
          console.log(`📡 Sent abort signal to worker for job ${jobId}`);
        } else {
          console.log(`ℹ️ Job ${jobId} not actively running in worker pool (may be queued)`);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Job canceled successfully',
        job: job.toJSON(),
      });
    } catch (error: any) {
      console.error('Error canceling job:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to cancel job',
      });
    }
  });

  /**
   * POST /api/v1/jobs/:jobId/pause
   * Pause a running job at the next checkpoint
   *
   * Transitions job to 'blocked' status. Worker will detect this and stop cooperatively.
   * Job can be resumed later from persisted checkpoint state.
   */
  router.post('/:jobId/pause', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;

      if (!userAccountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      const targetAccountId = operating?.accountId || userAccountId;
      const { jobId } = req.params;

      // Find job
      const job = await jobRepository.findById(jobId, targetAccountId, req);

      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found or access denied',
        });
      }

      // Only allow pause for running jobs
      if (job.status !== 'running') {
        return res.status(400).json({
          success: false,
          error: `Cannot pause job with status: ${job.status}. Only running jobs can be paused.`,
        });
      }

      // Pause job (transitions to blocked status)
      job.pause();
      await jobRepository.save(job);

      console.log(`⏸️  Job paused: ${jobId} (type: ${job.type})`);

      // If WorkerPool is available, signal the worker to stop cooperatively
      if (workerPool) {
        const signaled = await workerPool.pauseJob(jobId, targetAccountId, 'User paused job');
        if (signaled) {
          console.log(`📡 Sent pause signal to worker for job ${jobId}`);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Job paused successfully. Resume to continue from the latest checkpoint.',
        job: job.toJSON(),
      });
    } catch (error: any) {
      console.error('Error pausing job:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to pause job',
      });
    }
  });

  /**
   * POST /api/v1/jobs/:jobId/resume
   * Resume a paused job
   *
   * Transitions job from 'blocked' back to 'queued'. WorkerPool will pick it up
   * and continue from the latest persisted checkpoint.
   */
  router.post('/:jobId/resume', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;

      if (!userAccountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      const targetAccountId = operating?.accountId || userAccountId;
      const { jobId } = req.params;

      // Find job
      const job = await jobRepository.findById(jobId, targetAccountId, req);

      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found or access denied',
        });
      }

      // Only allow resume for blocked (paused) jobs
      if (job.status !== 'blocked') {
        return res.status(400).json({
          success: false,
          error: `Cannot resume job with status: ${job.status}. Only paused (blocked) jobs can be resumed.`,
        });
      }

      // Resume job (transitions blocked → queued)
      job.resume();
      await jobRepository.save(job);

      console.log(`▶️  Job resumed: ${jobId} (type: ${job.type})`);

      return res.status(200).json({
        success: true,
        message: 'Job resumed successfully. Continuing from the latest checkpoint.',
        job: job.toJSON(),
      });
    } catch (error: any) {
      console.error('Error resuming job:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to resume job',
      });
    }
  });

  return router;
}
