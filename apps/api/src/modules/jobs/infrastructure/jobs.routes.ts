/**
 * Jobs API Routes
 *
 * RESTful HTTP endpoints for the unified jobs system.
 *
 * Endpoints:
 * - POST /api/v1/jobs - Enqueue a new job
 * - GET /api/v1/jobs/:id - Get job details
 * - GET /api/v1/jobs - List jobs (with filters)
 * - DELETE /api/v1/jobs/:id - Cancel a job
 *
 * All endpoints require authentication and respect operating context
 * (admin CRM mode vs normal user mode).
 *
 * Related: Product Directive - "Jobs as first-class citizens"
 */

import { Router, Request, Response } from 'express';
import { AuthService } from '../../../services/auth.service';
import { requireAuth } from '../../../middleware/auth.middleware';
import { asyncHandler, ErrorFactory } from '../../../middleware/error-handler.middleware';
import { SQLiteJobRepository } from './JobRepository';
import { EnqueueJob, EnqueueJobCommand } from '../application/EnqueueJob';
import { StartJob } from '../application/StartJob';
import { CancelJob } from '../application/CancelJob';
import { RetryJob } from '../application/RetryJob';
import Database from 'better-sqlite3';
import type { SSEBroadcaster } from './SSEBroadcaster';

/**
 * Factory function to create jobs routes with auth and database
 */
export function createJobsRoutes(
  authService: AuthService,
  db: Database.Database,
  sseBroadcaster?: SSEBroadcaster
): Router {
  const router = Router();

  // Initialize repository and use cases
  const jobRepository = new SQLiteJobRepository(db);
  const enqueueJob = new EnqueueJob(jobRepository, sseBroadcaster);
  const startJob = new StartJob(jobRepository);
  const cancelJob = new CancelJob(jobRepository);
  const retryJob = new RetryJob(jobRepository, sseBroadcaster);

  /**
   * POST /api/v1/jobs
   * Enqueue a new background job
   *
   * Body:
   * {
   *   type: 'import' | 'delete' | 'export' | 'analyze',
   *   config: {...},
   *   idempotencyKey?: string,
   *   concurrencyGroup?: string
   * }
   *
   * Returns:
   * {
   *   success: true,
   *   jobId: string,
   *   status: 'created' | 'existing',
   *   job: Job
   * }
   */
  router.post(
    '/',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;

      if (!userAccountId || !userId) {
        throw ErrorFactory.unauthorized('jobs.enqueue');
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;

      // Build command
      const command: EnqueueJobCommand = {
        type: req.body.type,
        accountId: targetAccountId,
        createdBy: userId,
        config: req.body.config,
        idempotencyKey: req.body.idempotencyKey,
        concurrencyGroup: req.body.concurrencyGroup,
      };

      // Execute use case
      const result = await enqueueJob.execute(command);

      res.status(result.status === 'created' ? 201 : 200).json({
        success: true,
        jobId: result.jobId,
        status: result.status,
        job: result.job.toJSON(),
      });
    })
  );

  /**
   * GET /api/v1/jobs/:id
   * Get specific job details
   *
   * Returns:
   * {
   *   success: true,
   *   job: Job
   * }
   */
  router.get(
    '/:id',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;
      const { id } = req.params;

      if (!userAccountId || !userId) {
        throw ErrorFactory.unauthorized('jobs.get');
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;

      console.log(`[API GET] Fetching job ${id} for account ${targetAccountId}, path: ${(req as any).testDbPath}`);
      // Get job - CRITICAL FIX: Pass request for database routing
      const job = await jobRepository.findById(id, targetAccountId, req);

      if (!job) {
        throw ErrorFactory.notFound('Job', 'jobs.get');
      }

      return res.json({
        success: true,
        job: job.toJSON(),
      });
    })
  );

  /**
   * POST /api/v1/jobs/:id/retry
   * Retry a failed/canceled job
   *
   * Creates a new job with the same configuration as the original job.
   *
   * Returns:
   * {
   *   success: true,
   *   originalJob: Job,
   *   newJob: Job
   * }
   */
  router.post(
    '/:id/retry',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;
      const { id } = req.params;

      if (!userAccountId || !userId) {
        throw ErrorFactory.unauthorized('jobs.retry');
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;

      // Execute retry
      const result = await retryJob.execute({
        jobId: id,
        accountId: targetAccountId,
        retriedBy: userId,
      });

      if (!result.success) {
        throw ErrorFactory.badRequest(result.error || 'Failed to retry job', 'jobs.retry', {
          jobId: id,
        });
      }

      return res.status(201).json({
        success: true,
        originalJob: result.originalJob!.toJSON(),
        newJob: result.newJob!.toJSON(),
      });
    })
  );

  /**
   * GET /api/v1/jobs
   * List jobs with filters
   *
   * Query params:
   * - status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'blocked'
   * - type: 'import' | 'delete' | 'export' | 'analyze'
   * - limit: number (default: 50, max: 100)
   * - offset: number (default: 0)
   *
   * Returns:
   * {
   *   success: true,
   *   jobs: Job[],
   *   total: number
   * }
   */
  router.get(
    '/',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;

      if (!userAccountId || !userId) {
        throw ErrorFactory.unauthorized('jobs.list');
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;

      // Parse query params
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      console.log(`[jobs.routes.ts] Request params: query=${JSON.stringify(req.query)}, body=${JSON.stringify(req.body)}`);
      let status = req.query.status as any;
      if (status === 'all') {
        status = undefined;
      }
      const type = req.query.type as any;

      // Find jobs - CRITICAL FIX: Pass request for database routing
      const jobs = await jobRepository.find(
        {
          accountId: targetAccountId,
          status,
          type,
          limit,
          offset,
        },
        req
      );

      return res.json({
        success: true,
        jobs: jobs.map((job) => job.toJSON()),
        total: jobs.length,
      });
    })
  );

  /**
   * POST /api/v1/jobs/:id/pause
   * Pause a running job
   *
   * Returns:
   * {
   *   success: true,
   *   job: Job
   * }
   */
  router.post(
    '/:id/pause',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;
      const { id } = req.params;

      if (!userAccountId || !userId) {
        throw ErrorFactory.unauthorized('jobs.pause');
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;

      // Get job - CRITICAL FIX: Pass request for database routing
      const job = await jobRepository.findById(id, targetAccountId, req);
      if (!job) {
        throw ErrorFactory.notFound('Job', 'jobs.pause');
      }

      // Pause job
      if (!job.canPause) {
        throw ErrorFactory.badRequest(`Cannot pause job in status: ${job.status}`, 'jobs.pause', {
          jobId: id,
          status: job.status,
        });
      }

      job.pause();
      await jobRepository.save(job);

      console.log(`⏸️  Paused job ${id} (type: ${job.type})`);

      return res.json({
        success: true,
        job: job.toJSON(),
      });
    })
  );

  /**
   * POST /api/v1/jobs/:id/resume
   * Resume a paused job
   *
   * Returns:
   * {
   *   success: true,
   *   job: Job
   * }
   */
  router.post(
    '/:id/resume',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;
      const { id } = req.params;

      if (!userAccountId || !userId) {
        throw ErrorFactory.unauthorized('jobs.resume');
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;

      // Get job - CRITICAL FIX: Pass request for database routing
      const job = await jobRepository.findById(id, targetAccountId, req);
      if (!job) {
        throw ErrorFactory.notFound('Job', 'jobs.resume');
      }

      // Resume job
      if (!job.canResume) {
        throw ErrorFactory.badRequest(`Cannot resume job in status: ${job.status}`, 'jobs.resume', {
          jobId: id,
          status: job.status,
        });
      }

      job.resume();
      await jobRepository.save(job);

      console.log(`▶️  Resumed job ${id} (type: ${job.type})`);

      return res.json({
        success: true,
        job: job.toJSON(),
      });
    })
  );

  /**
   * DELETE /api/v1/jobs/:id
   * Delete a job from the database
   *
   * This permanently removes the job and all related events.
   * Use this to clean up completed/failed jobs.
   *
   * Returns:
   * {
   *   success: true,
   *   message: string
   * }
   */
  router.delete(
    '/:id',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;
      const { id } = req.params;

      if (!userAccountId || !userId) {
        throw ErrorFactory.unauthorized('jobs.delete');
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;

      console.log(`[API DELETE] Deleting job ${id} for account ${targetAccountId}`);
      console.log(`[API DELETE] Request testDbPath: ${(req as any).testDbPath}`);

      // Verify job exists and belongs to account - CRITICAL FIX: Pass request for database routing
      const job = await jobRepository.findById(id, targetAccountId, req);
      if (!job) {
        throw ErrorFactory.notFound('Job', 'jobs.delete');
      }

      // Broadcast deletion event to UI BEFORE deleting from database
      // This allows the UI to remove the job from its state immediately
      if (sseBroadcaster) {
        const deletedJob = {
          id: job.id,
          type: job.type,
          accountId: job.accountId,
          status: 'deleted' as const,
          progress: { current: 0, total: 0, percent: 0 },
          config: job.config,
        };
        sseBroadcaster.broadcastJobUpdate(deletedJob as any);
        console.log(`📡 Broadcasting deletion event for job ${id}`);
      }

      // Delete job from database
      await jobRepository.delete(id, targetAccountId);

      console.log(`✅ Deleted job ${id} (type: ${job.type}, status: ${job.status})`);

      return res.json({
        success: true,
        message: `Job ${id} deleted successfully`,
      });
    })
  );

  /**
   * GET /api/v1/jobs/summary
   * Get jobs summary for account
   *
   * Returns:
   * {
   *   success: true,
   *   summary: {
   *     total: number,
   *     byStatus: {...},
   *     byType: {...}
   *   }
   * }
   */
  router.get(
    '/summary',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;

      if (!userAccountId || !userId) {
        throw ErrorFactory.unauthorized('jobs.summary');
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;

      // Get summary
      const summary = await jobRepository.getSummary(targetAccountId);

      return res.json({
        success: true,
        summary,
      });
    })
  );

  return router;
}
