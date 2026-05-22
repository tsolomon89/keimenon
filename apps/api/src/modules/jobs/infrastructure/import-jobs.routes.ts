/**
 * Import Jobs Routes
 *
 * Provides jobs-related endpoints under /api/v1/jobs.
 * Note: Multipart import creation has been retired in favor of chunked upload
 * through /api/v1/uploads/*.
 */

import { Router, Request, Response } from 'express';
import { AuthService } from '../../../services/auth.service';
import { requireAuth } from '../../../middleware/auth.middleware';
import { SQLiteJobRepository } from './JobRepository';
import { EnqueueJob, EnqueueJobCommand } from '../application/EnqueueJob';
import { SSEBroadcaster } from './SSEBroadcaster';
import Database from 'better-sqlite3';
import { ulid } from 'ulid';
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
      const testContext = (req as any).testDbPath
        ? {
            dbPath: (req as any).testDbPath,
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
          details: {
            activeJobId: activeJob.id,
            activeJobStatus: activeJob.status,
            message: 'Please wait for the current deletion to complete before starting a new one',
          },
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
        data: {
          jobId: result.jobId,
          message: 'Delete job created. Monitor progress via SSE at /api/v1/stream/jobs',
          job: result.job.toJSON(),
        },
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
