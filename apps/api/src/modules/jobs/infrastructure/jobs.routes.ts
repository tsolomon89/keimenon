/**
 * Jobs API Routes
 *
 * Canonical jobs control and history routes.
 *
 * Endpoints:
 * - GET /api/v1/jobs/:id - Get job details
 * - GET /api/v1/jobs - List jobs (with filters)
 * - DELETE /api/v1/jobs/:id - Delete job history item
 * - POST /api/v1/jobs/:id/cancel|pause|resume|retry
 * - POST /api/v1/jobs/:id/duplicate-review/apply
 * - GET /api/v1/jobs/:id/duplicate-review/status
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
import { RetryJob } from '../application/RetryJob';
import Database from 'better-sqlite3';
import type { SSEBroadcaster } from './SSEBroadcaster';
import type { WorkerPool } from '../../workers/domain/WorkerPool';
import { z } from 'zod';
import { appLogger } from '../../../utils/logger';
import type {
  SimilarityReviewApplyReasonCode,
  SimilarityReviewApplyState,
  SimilarityReviewApplySummary,
} from '@keimenon/types';

/**
 * Factory function to create jobs routes with auth and database
 */
export function createJobsRoutes(
  authService: AuthService,
  db: Database.Database,
  sseBroadcaster?: SSEBroadcaster,
  workerPool?: WorkerPool
): Router {
  const router = Router();

  // Initialize repository and use cases
  const jobRepository = new SQLiteJobRepository(db);
  const retryJob = new RetryJob(jobRepository, sseBroadcaster);

  const ReviewDecisionSchema = z.object({
    duplicateId: z.string(),
    action: z.enum(['keep-primary', 'keep-duplicate', 'keep-both', 'merge', 'sequester']),
    timestamp: z.number(),
    userId: z.string().optional(),
    primaryNodeId: z.string().optional(),
    duplicateNodeId: z.string().optional(),
  });

  const ApplyDuplicateReviewRequestSchema = z.object({
    decisions: z.array(ReviewDecisionSchema),
  });
  const REVIEW_APPLY_TIMEOUT_MS = Number.parseInt(
    process.env.DUPLICATE_REVIEW_APPLY_TIMEOUT_MS || '60000',
    10
  );
  const duplicateReviewApplyLocks = new Set<string>();

  function ensureDuplicateReviewTable(database: Database.Database): void {
    database.exec(`
      CREATE TABLE IF NOT EXISTS job_duplicate_candidates (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        primary_node_id TEXT NOT NULL,
        duplicate_node_id TEXT NOT NULL,
        similarity REAL NOT NULL,
        metrics_json TEXT NOT NULL,
        primary_json TEXT NOT NULL,
        duplicate_json TEXT NOT NULL,
        decision TEXT CHECK(decision IN ('keep-primary', 'keep-duplicate', 'keep-both', 'merge', 'sequester')),
        decision_meta TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(job_id, account_id, candidate_id),
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_job_duplicate_candidates_job
      ON job_duplicate_candidates(job_id, account_id);
      CREATE INDEX IF NOT EXISTS idx_job_duplicate_candidates_group
      ON job_duplicate_candidates(job_id, account_id, group_id);
    `);
  }

  function parseJsonObject(value: unknown): Record<string, unknown> {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return {};
    }
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore malformed JSON and fallback to empty object.
    }
    return {};
  }

  function parseRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return parseJsonObject(value);
  }

  function parseBooleanFlag(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
    if (typeof value === 'number') {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
    }
    return fallback;
  }

  type DuplicateReviewAction =
    | 'keep-primary'
    | 'keep-duplicate'
    | 'keep-both'
    | 'merge'
    | 'sequester';

  function parseReviewApplyReasonCode(value: unknown): SimilarityReviewApplyReasonCode | undefined {
    if (
      value === 'REVIEW_APPLY_TIMEOUT' ||
      value === 'REVIEW_APPLY_CONFLICT' ||
      value === 'REVIEW_APPLY_FAILED'
    ) {
      return value;
    }
    return undefined;
  }

  function readDuplicateReviewState(job: { state: { metadata?: Record<string, unknown> } }): {
    metadata: Record<string, unknown>;
    applyState: SimilarityReviewApplyState;
    applySummary?: SimilarityReviewApplySummary;
  } {
    const duplicateReviewMeta = parseRecord(job.state.metadata?.duplicateReview);
    const applyStateRaw = parseRecord(duplicateReviewMeta.applyState);
    const phaseValue = String(applyStateRaw.phase || '').toLowerCase();
    const phase: SimilarityReviewApplyState['phase'] =
      phaseValue === 'ready' ||
      phaseValue === 'applying' ||
      phaseValue === 'completed' ||
      phaseValue === 'failed'
        ? (phaseValue as SimilarityReviewApplyState['phase'])
        : 'pending';

    const applyState: SimilarityReviewApplyState = {
      phase,
      startedAt: typeof applyStateRaw.startedAt === 'number' ? applyStateRaw.startedAt : undefined,
      completedAt:
        typeof applyStateRaw.completedAt === 'number' ? applyStateRaw.completedAt : undefined,
      failedAt: typeof applyStateRaw.failedAt === 'number' ? applyStateRaw.failedAt : undefined,
      reasonCode: parseReviewApplyReasonCode(applyStateRaw.reasonCode),
    };

    const applySummaryRaw = parseRecord(duplicateReviewMeta.applySummary);
    let applySummary: SimilarityReviewApplySummary | undefined;
    if (Object.keys(applySummaryRaw).length > 0) {
      const actionCountsRaw = parseRecord(applySummaryRaw.actionCounts);
      applySummary = {
        appliedDecisions: Number(applySummaryRaw.appliedDecisions ?? 0),
        actionCounts: {
          'keep-primary': Number(actionCountsRaw['keep-primary'] ?? 0),
          'keep-duplicate': Number(actionCountsRaw['keep-duplicate'] ?? 0),
          'keep-both': Number(actionCountsRaw['keep-both'] ?? 0),
          merge: Number(actionCountsRaw.merge ?? 0),
          sequester: Number(actionCountsRaw.sequester ?? 0),
        },
        nodesSequestered: Number(applySummaryRaw.nodesSequestered ?? 0),
        nodesMerged: Number(applySummaryRaw.nodesMerged ?? 0),
        edgesCreated: Number(applySummaryRaw.edgesCreated ?? 0),
        pendingCandidates: Number(applySummaryRaw.pendingCandidates ?? 0),
      };
    }

    return {
      metadata: duplicateReviewMeta,
      applyState,
      applySummary,
    };
  }

  function writeDuplicateReviewState(
    job: { updateStateMetadata: (metadata: Record<string, unknown>) => void },
    patch: {
      status?: 'pending' | 'in_progress' | 'completed' | 'failed';
      decisionsApplied?: number;
      pendingCandidates?: number;
      applyState?: SimilarityReviewApplyState;
      applySummary?: SimilarityReviewApplySummary;
      reasonCode?: SimilarityReviewApplyReasonCode;
    }
  ): void {
    const currentMetadata = parseRecord((job as any).state?.metadata?.duplicateReview);
    const nextMetadata: Record<string, unknown> = {
      ...currentMetadata,
      updatedAt: Date.now(),
    };

    if (typeof patch.status === 'string') {
      nextMetadata.status = patch.status;
    }
    if (typeof patch.decisionsApplied === 'number') {
      nextMetadata.decisionsApplied = patch.decisionsApplied;
    }
    if (typeof patch.pendingCandidates === 'number') {
      nextMetadata.pendingCandidates = patch.pendingCandidates;
    }
    if (patch.applyState) {
      nextMetadata.applyState = patch.applyState;
    }
    if (patch.applySummary) {
      nextMetadata.applySummary = patch.applySummary;
    }
    if (patch.reasonCode) {
      nextMetadata.reasonCode = patch.reasonCode;
    }

    job.updateStateMetadata({
      duplicateReview: nextMetadata,
    });
  }

  function setModelScopeExcluded(
    database: Database.Database,
    params: {
      nodeId: string;
      accountId: string;
      reason: string;
      actorUserId: string;
      relatedNodeId?: string;
    }
  ): number {
    const node = database
      .prepare('SELECT properties FROM nodes WHERE id = ? AND account_id = ?')
      .get(params.nodeId, params.accountId) as { properties?: string } | undefined;

    if (!node) {
      return 0;
    }

    const now = Date.now();
    const properties = parseJsonObject(node.properties);
    const existingExclusionsRaw = properties.model_scope_exclusions;
    const existingExclusions = Array.isArray(existingExclusionsRaw)
      ? [...existingExclusionsRaw]
      : [];

    existingExclusions.push({
      reason: params.reason,
      actorUserId: params.actorUserId,
      relatedNodeId: params.relatedNodeId || null,
      ts: now,
    });

    const nextProperties = {
      ...properties,
      model_scope_excluded: true,
      model_scope_exclusions: existingExclusions,
      duplicate_review_status: params.reason,
      duplicate_review_updated_at: now,
    };

    const result = database
      .prepare('UPDATE nodes SET properties = ?, updated_at = ? WHERE id = ? AND account_id = ?')
      .run(JSON.stringify(nextProperties), now, params.nodeId, params.accountId);

    return result.changes ?? 0;
  }

  function ensureEdge(
    database: Database.Database,
    params: {
      accountId: string;
      createdBy: string;
      kind: 'EQUIVALENT_TO' | 'DUP_OF';
      fromId: string;
      toId: string;
      properties: Record<string, unknown>;
    }
  ): boolean {
    const existing = database
      .prepare(
        `
        SELECT id FROM edges
        WHERE account_id = ? AND kind = ? AND from_id = ? AND to_id = ?
        LIMIT 1
      `
      )
      .get(params.accountId, params.kind, params.fromId, params.toId) as { id: string } | undefined;

    if (existing?.id) {
      return false;
    }

    const edgeId = `edge_dup_review_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    database
      .prepare(
        `
        INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        edgeId,
        params.kind,
        params.fromId,
        params.toId,
        JSON.stringify(params.properties || {}),
        params.accountId,
        params.createdBy,
        Date.now()
      );

    return true;
  }

  /**
   * Legacy endpoint hard-cut:
   * POST /api/v1/jobs (generic enqueue) has been removed.
   */
  router.post('/', (_req: Request, res: Response) => {
    return res.status(404).json({
      success: false,
      error:
        'Endpoint removed. Use chunked upload via POST /api/v1/uploads/initiate (then chunk upload) or POST /api/v1/jobs/delete.',
    });
  });

  /**
   * Legacy endpoint hard-cut:
   * GET /api/v1/jobs/summary has been removed.
   *
   * Keep this explicit so it does not get captured by GET /:id.
   */
  router.get('/summary', (_req: Request, res: Response) => {
    return res.status(404).json({
      success: false,
      error: 'Endpoint removed. Use GET /api/v1/jobs with filters instead.',
    });
  });

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

      appLogger.debug('jobs.get.request', {
        jobId: id,
        accountId: targetAccountId,
        testDbPath: (req as any).testDbPath,
      });
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
   * POST /api/v1/jobs/:id/cancel
   * Cancel a queued/running/blocked job.
   */
  router.post(
    '/:id/cancel',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;
      const { id } = req.params;

      if (!userAccountId || !userId) {
        throw ErrorFactory.unauthorized('jobs.cancel');
      }

      const targetAccountId = operating?.accountId || userAccountId;
      const job = await jobRepository.findById(id, targetAccountId, req);
      if (!job) {
        throw ErrorFactory.notFound('Job', 'jobs.cancel');
      }

      if (!job.canCancel) {
        throw ErrorFactory.badRequest(`Cannot cancel job in status: ${job.status}`, 'jobs.cancel', {
          jobId: id,
          status: job.status,
        });
      }

      job.cancel();
      await jobRepository.save(job);

      if (sseBroadcaster) {
        sseBroadcaster.broadcastJobUpdate(job);
      }

      if (workerPool) {
        await workerPool.cancelJob(id, targetAccountId, 'User canceled job');
      }

      return res.json({
        success: true,
        job: job.toJSON(),
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
      appLogger.debug('jobs.list.request', {
        query: req.query as Record<string, unknown>,
      });
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

      if (workerPool) {
        const paused = await workerPool.pauseJob(id, targetAccountId, 'User paused job');
        if (!paused) {
          throw ErrorFactory.conflict(
            'Pause request could not acquire active worker ownership',
            'jobs.pause',
            {
              jobId: id,
              accountId: targetAccountId,
            }
          );
        }

        const refreshedJob = await jobRepository.findById(id, targetAccountId, req);
        if (!refreshedJob) {
          throw ErrorFactory.notFound('Job', 'jobs.pause');
        }

        return res.json({
          success: true,
          job: refreshedJob.toJSON(),
        });
      }

      // Fallback path for environments without worker orchestration
      job.pause();
      await jobRepository.save(job);
      if (sseBroadcaster) {
        sseBroadcaster.broadcastJobUpdate(job);
      }

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

      if (sseBroadcaster) {
        sseBroadcaster.broadcastJobUpdate(job);
      }

      return res.json({
        success: true,
        job: job.toJSON(),
      });
    })
  );

  /**
   * GET /api/v1/jobs/:id/duplicate-review/groups
   * Fetch duplicate candidate groups for manual review.
   */
  router.get(
    '/:id/duplicate-review/groups',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;
      const { id: jobId } = req.params;

      if (!userAccountId || !userId) {
        throw ErrorFactory.unauthorized('jobs.duplicateReviewGroups');
      }

      const targetAccountId = operating?.accountId || userAccountId;
      const job = await jobRepository.findById(jobId, targetAccountId, req);
      if (!job) {
        throw ErrorFactory.notFound('Job', 'jobs.duplicateReviewGroups');
      }

      const { getDbClient } = await import('../../../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      ensureDuplicateReviewTable(database);

      const rows = database
        .prepare(
          `
          SELECT
            group_id,
            candidate_id,
            primary_json,
            duplicate_json,
            similarity,
            metrics_json,
            decision
          FROM job_duplicate_candidates
          WHERE job_id = ? AND account_id = ?
          ORDER BY group_id ASC, similarity DESC, candidate_id ASC
        `
        )
        .all(jobId, targetAccountId) as Array<{
        group_id: string;
        candidate_id: string;
        primary_json: string;
        duplicate_json: string;
        similarity: number;
        metrics_json: string;
        decision: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge' | 'sequester' | null;
      }>;

      const groupsById = new Map<
        string,
        {
          id: string;
          candidates: Array<{
            id: string;
            primary: Record<string, unknown>;
            duplicate: Record<string, unknown>;
            similarity: number;
            metrics: Record<string, unknown>;
            decision?: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge' | 'sequester';
          }>;
        }
      >();

      for (const row of rows) {
        if (!groupsById.has(row.group_id)) {
          groupsById.set(row.group_id, { id: row.group_id, candidates: [] });
        }

        groupsById.get(row.group_id)!.candidates.push({
          id: row.candidate_id,
          primary: parseJsonObject(row.primary_json),
          duplicate: parseJsonObject(row.duplicate_json),
          similarity: Number(row.similarity || 0),
          metrics: parseJsonObject(row.metrics_json),
          ...(row.decision ? { decision: row.decision } : {}),
        });
      }

      const groups = Array.from(groupsById.values()).map((group) => {
        const autoResolved = group.candidates.filter((candidate) => !!candidate.decision).length;
        return {
          id: group.id,
          candidates: group.candidates,
          totalDuplicates: group.candidates.length,
          reviewed: autoResolved,
          autoResolved,
        };
      });

      return res.json({
        success: true,
        groups,
        total_groups: groups.length,
        total_candidates: rows.length,
      });
    })
  );

  /**
   * POST /api/v1/jobs/:id/duplicate-review/apply
   * Apply duplicate review decisions for a job.
   */
  router.post(
    '/:id/duplicate-review/apply',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;
      const { id: jobId } = req.params;

      if (!userAccountId || !userId) {
        throw ErrorFactory.unauthorized('jobs.duplicateReviewApply');
      }

      const targetAccountId = operating?.accountId || userAccountId;
      const job = await jobRepository.findById(jobId, targetAccountId, req);

      if (!job) {
        throw ErrorFactory.notFound('Job', 'jobs.duplicateReviewApply');
      }

      const { getDbClient } = await import('../../../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      ensureDuplicateReviewTable(database);

      const lockKey = `${targetAccountId}:${jobId}`;
      const currentReviewState = readDuplicateReviewState(job);
      if (currentReviewState.applyState.phase === 'completed') {
        const completedSummary = currentReviewState.applySummary;
        return res.json({
          success: true,
          idempotent: true,
          apply_state: currentReviewState.applyState,
          result: completedSummary
            ? {
                jobId,
                applied_decisions: completedSummary.appliedDecisions,
                action_counts: completedSummary.actionCounts,
                nodes_sequestered: completedSummary.nodesSequestered,
                nodes_merged: completedSummary.nodesMerged,
                edges_created: completedSummary.edgesCreated,
                pending_candidates: completedSummary.pendingCandidates,
                message: 'Duplicate review already completed for this job.',
              }
            : {
                jobId,
                applied_decisions: 0,
                action_counts: {
                  'keep-primary': 0,
                  'keep-duplicate': 0,
                  'keep-both': 0,
                  merge: 0,
                  sequester: 0,
                },
                nodes_sequestered: 0,
                nodes_merged: 0,
                edges_created: 0,
                pending_candidates: 0,
                message: 'Duplicate review already completed for this job.',
              },
        });
      }

      if (
        duplicateReviewApplyLocks.has(lockKey) ||
        currentReviewState.applyState.phase === 'applying'
      ) {
        const conflictState: SimilarityReviewApplyState = {
          phase: 'failed',
          failedAt: Date.now(),
          reasonCode: 'REVIEW_APPLY_CONFLICT',
        };
        writeDuplicateReviewState(job, {
          status: 'failed',
          applyState: conflictState,
          reasonCode: 'REVIEW_APPLY_CONFLICT',
        });
        await jobRepository.save(job);
        if (sseBroadcaster) {
          sseBroadcaster.broadcastJobUpdate(job);
        }
        return res.status(409).json({
          success: false,
          error: 'review_apply_conflict',
          reason_code: 'REVIEW_APPLY_CONFLICT',
          message: 'Duplicate review apply is already in progress for this job.',
        });
      }

      const { decisions } = ApplyDuplicateReviewRequestSchema.parse(req.body);
      duplicateReviewApplyLocks.add(lockKey);

      try {
        const pendingRows = database
          .prepare(
            `
            SELECT candidate_id
            FROM job_duplicate_candidates
            WHERE job_id = ? AND account_id = ? AND decision IS NULL
            ORDER BY candidate_id ASC
          `
          )
          .all(jobId, targetAccountId) as Array<{ candidate_id: string }>;
        const pendingCandidateIds = pendingRows.map((row) => row.candidate_id);
        const pendingCandidateSet = new Set(pendingCandidateIds);

        const submittedDecisionsById = new Map<string, (typeof decisions)[number]>();
        for (const decision of decisions) {
          if (submittedDecisionsById.has(decision.duplicateId)) {
            throw ErrorFactory.badRequest(
              `Duplicate decision submission for candidate "${decision.duplicateId}"`,
              'jobs.duplicateReviewApply'
            );
          }
          submittedDecisionsById.set(decision.duplicateId, decision);
        }

        const missingCandidateIds = pendingCandidateIds.filter(
          (candidateId) => !submittedDecisionsById.has(candidateId)
        );
        const unexpectedCandidateIds = Array.from(submittedDecisionsById.keys()).filter(
          (candidateId) => !pendingCandidateSet.has(candidateId)
        );

        if (missingCandidateIds.length > 0 || unexpectedCandidateIds.length > 0) {
          writeDuplicateReviewState(job, {
            status: 'pending',
            pendingCandidates: pendingCandidateIds.length,
            decisionsApplied: 0,
            applyState: { phase: 'pending' },
          });
          await jobRepository.save(job);
          if (sseBroadcaster) {
            sseBroadcaster.broadcastJobUpdate(job);
          }
          return res.status(400).json({
            success: false,
            error: 'incomplete_duplicate_review_decisions',
            message:
              'Duplicate review completion requires one explicit decision for each pending candidate in this job.',
            pending_candidates: pendingCandidateIds.length,
            submitted_candidates: submittedDecisionsById.size,
            missing_candidate_ids: missingCandidateIds,
            unexpected_candidate_ids: unexpectedCandidateIds,
          });
        }

        const orderedDecisions = pendingCandidateIds
          .map((candidateId) => submittedDecisionsById.get(candidateId))
          .filter((decision): decision is (typeof decisions)[number] => Boolean(decision));

        const actionCounts: Record<DuplicateReviewAction, number> = {
          'keep-primary': 0,
          'keep-duplicate': 0,
          'keep-both': 0,
          merge: 0,
          sequester: 0,
        };

        const lookupCandidateStmt = database.prepare(
          `
          SELECT primary_node_id, duplicate_node_id
          FROM job_duplicate_candidates
          WHERE job_id = ? AND account_id = ? AND candidate_id = ?
        `
        );
        const updateDecisionStmt = database.prepare(
          `
          UPDATE job_duplicate_candidates
          SET decision = ?, decision_meta = ?, updated_at = ?
          WHERE job_id = ? AND account_id = ? AND candidate_id = ?
        `
        );

        let nodesSequestered = 0;
        let mergesRegistered = 0;
        let edgesCreated = 0;
        let decisionsApplied = 0;

        writeDuplicateReviewState(job, {
          status: 'in_progress',
          pendingCandidates: pendingCandidateIds.length,
          decisionsApplied: 0,
          applyState: { phase: 'ready' },
        });
        await jobRepository.save(job);
        if (sseBroadcaster) {
          sseBroadcaster.broadcastJobUpdate(job);
        }

        const applyStartedAt = Date.now();
        writeDuplicateReviewState(job, {
          status: 'in_progress',
          pendingCandidates: pendingCandidateIds.length,
          decisionsApplied: 0,
          applyState: {
            phase: 'applying',
            startedAt: applyStartedAt,
          },
        });
        await jobRepository.save(job);
        if (sseBroadcaster) {
          sseBroadcaster.broadcastJobUpdate(job);
        }

        try {
          const transaction = database.transaction(
            (submittedDecisions: Array<(typeof decisions)[number]>) => {
              for (const decision of submittedDecisions) {
                if (Date.now() - applyStartedAt > REVIEW_APPLY_TIMEOUT_MS) {
                  const timeoutError = new Error(
                    `Duplicate review apply exceeded ${REVIEW_APPLY_TIMEOUT_MS}ms timeout`
                  ) as Error & { code?: string };
                  timeoutError.code = 'REVIEW_APPLY_TIMEOUT';
                  throw timeoutError;
                }

                actionCounts[decision.action] += 1;

                const persistedCandidate = lookupCandidateStmt.get(
                  jobId,
                  targetAccountId,
                  decision.duplicateId
                ) as { primary_node_id?: string; duplicate_node_id?: string } | undefined;

                const primaryNodeId = decision.primaryNodeId || persistedCandidate?.primary_node_id;
                const duplicateNodeId =
                  decision.duplicateNodeId || persistedCandidate?.duplicate_node_id;

                if (!primaryNodeId || !duplicateNodeId) {
                  continue;
                }

                const now = Date.now();
                switch (decision.action) {
                  case 'keep-primary':
                    nodesSequestered += setModelScopeExcluded(database, {
                      nodeId: duplicateNodeId,
                      accountId: targetAccountId,
                      reason: 'keep-primary',
                      actorUserId: userId,
                      relatedNodeId: primaryNodeId,
                    });
                    edgesCreated += ensureEdge(database, {
                      accountId: targetAccountId,
                      createdBy: userId,
                      kind: 'DUP_OF',
                      fromId: duplicateNodeId,
                      toId: primaryNodeId,
                      properties: { source: 'duplicate_review' },
                    })
                      ? 1
                      : 0;
                    break;
                  case 'keep-duplicate':
                    nodesSequestered += setModelScopeExcluded(database, {
                      nodeId: primaryNodeId,
                      accountId: targetAccountId,
                      reason: 'keep-duplicate',
                      actorUserId: userId,
                      relatedNodeId: duplicateNodeId,
                    });
                    edgesCreated += ensureEdge(database, {
                      accountId: targetAccountId,
                      createdBy: userId,
                      kind: 'DUP_OF',
                      fromId: primaryNodeId,
                      toId: duplicateNodeId,
                      properties: { source: 'duplicate_review' },
                    })
                      ? 1
                      : 0;
                    break;
                  case 'keep-both':
                    break;
                  case 'merge':
                    nodesSequestered += setModelScopeExcluded(database, {
                      nodeId: duplicateNodeId,
                      accountId: targetAccountId,
                      reason: 'merge',
                      actorUserId: userId,
                      relatedNodeId: primaryNodeId,
                    });
                    edgesCreated += ensureEdge(database, {
                      accountId: targetAccountId,
                      createdBy: userId,
                      kind: 'EQUIVALENT_TO',
                      fromId: duplicateNodeId,
                      toId: primaryNodeId,
                      properties: { source: 'duplicate_review', merged: true },
                    })
                      ? 1
                      : 0;
                    mergesRegistered += 1;
                    break;
                  case 'sequester':
                    nodesSequestered += setModelScopeExcluded(database, {
                      nodeId: duplicateNodeId,
                      accountId: targetAccountId,
                      reason: 'sequester',
                      actorUserId: userId,
                      relatedNodeId: primaryNodeId,
                    });
                    break;
                }

                const decisionMeta = JSON.stringify({
                  appliedBy: userId,
                  appliedAt: now,
                  action: decision.action,
                  primaryNodeId,
                  duplicateNodeId,
                });

                updateDecisionStmt.run(
                  decision.action,
                  decisionMeta,
                  now,
                  jobId,
                  targetAccountId,
                  decision.duplicateId
                );
                decisionsApplied += 1;
              }
            }
          );

          transaction(orderedDecisions);
        } catch (error: any) {
          const reasonCode: SimilarityReviewApplyReasonCode =
            error?.code === 'REVIEW_APPLY_TIMEOUT' ? 'REVIEW_APPLY_TIMEOUT' : 'REVIEW_APPLY_FAILED';
          writeDuplicateReviewState(job, {
            status: 'failed',
            pendingCandidates: pendingCandidateIds.length,
            applyState: {
              phase: 'failed',
              failedAt: Date.now(),
              reasonCode,
            },
            reasonCode,
          });
          await jobRepository.save(job);
          if (sseBroadcaster) {
            sseBroadcaster.broadcastJobUpdate(job);
          }
          if (reasonCode === 'REVIEW_APPLY_TIMEOUT') {
            return res.status(408).json({
              success: false,
              error: 'review_apply_timeout',
              reason_code: 'REVIEW_APPLY_TIMEOUT',
              message: `Duplicate review apply exceeded timeout of ${REVIEW_APPLY_TIMEOUT_MS}ms and was rolled back.`,
            });
          }
          throw ErrorFactory.database(
            `Failed to apply duplicate review decisions: ${error.message}`,
            'jobs.duplicateReviewApply',
            { jobId, accountId: targetAccountId }
          );
        }

        const pendingCandidatesRow = database
          .prepare(
            `
            SELECT COUNT(*) as count
            FROM job_duplicate_candidates
            WHERE job_id = ? AND account_id = ? AND decision IS NULL
          `
          )
          .get(jobId, targetAccountId) as { count?: number } | undefined;
        const pendingCandidates = Number(pendingCandidatesRow?.count ?? 0);

        const applySummary: SimilarityReviewApplySummary = {
          appliedDecisions: decisionsApplied,
          actionCounts,
          nodesSequestered,
          nodesMerged: mergesRegistered,
          edgesCreated,
          pendingCandidates,
        };

        writeDuplicateReviewState(job, {
          status: pendingCandidates === 0 ? 'completed' : 'in_progress',
          decisionsApplied,
          pendingCandidates,
          applyState:
            pendingCandidates === 0
              ? {
                  phase: 'completed',
                  startedAt: applyStartedAt,
                  completedAt: Date.now(),
                }
              : {
                  phase: 'applying',
                  startedAt: applyStartedAt,
                },
          applySummary,
        });
        await jobRepository.save(job);
        if (sseBroadcaster) {
          sseBroadcaster.broadcastJobUpdate(job);
        }

        return res.json({
          success: true,
          apply_state:
            pendingCandidates === 0
              ? { phase: 'completed', startedAt: applyStartedAt, completedAt: Date.now() }
              : { phase: 'applying', startedAt: applyStartedAt },
          result: {
            jobId,
            applied_decisions: decisionsApplied,
            action_counts: actionCounts,
            nodes_sequestered: nodesSequestered,
            nodes_merged: mergesRegistered,
            edges_created: edgesCreated,
            pending_candidates: pendingCandidates,
            message:
              pendingCandidates === 0
                ? `Applied ${decisionsApplied} decisions and completed duplicate review`
                : `Applied ${decisionsApplied} decisions; duplicate review still has pending candidates`,
          },
        });
      } finally {
        duplicateReviewApplyLocks.delete(lockKey);
      }
    })
  );

  /**
   * GET /api/v1/jobs/:id/duplicate-review/status
   * Get duplicate review status for a job.
   */
  router.get(
    '/:id/duplicate-review/status',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;
      const { id: jobId } = req.params;

      if (!userAccountId || !userId) {
        throw ErrorFactory.unauthorized('jobs.duplicateReviewStatus');
      }

      const targetAccountId = operating?.accountId || userAccountId;
      const job = await jobRepository.findById(jobId, targetAccountId, req);
      if (!job) {
        throw ErrorFactory.notFound('Job', 'jobs.duplicateReviewStatus');
      }

      const { getDbClient } = await import('../../../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();
      ensureDuplicateReviewTable(database);

      const reviewCounts = database
        .prepare(
          `
          SELECT
            COUNT(*) as total_candidates,
            COUNT(DISTINCT group_id) as total_groups,
            SUM(CASE WHEN decision IS NULL THEN 1 ELSE 0 END) as pending_candidates,
            SUM(CASE WHEN decision IS NOT NULL THEN 1 ELSE 0 END) as decided_candidates
          FROM job_duplicate_candidates
          WHERE job_id = ? AND account_id = ?
        `
        )
        .get(jobId, targetAccountId) as
        | {
            total_candidates?: number;
            total_groups?: number;
            pending_candidates?: number;
            decided_candidates?: number;
          }
        | undefined;

      const importOptions = parseRecord(job.config?.importOptions || {});
      const duplicateDetection = parseRecord(importOptions.duplicateDetection);
      const duplicatesEnabled = parseBooleanFlag(duplicateDetection.enabled, true);
      const requireReviewConfigured = duplicatesEnabled
        ? parseBooleanFlag(duplicateDetection.requireReview, true)
        : false;

      const totalCandidates = Number(reviewCounts?.total_candidates ?? 0);
      const totalGroups = Number(reviewCounts?.total_groups ?? 0);
      const pendingCandidates = Number(reviewCounts?.pending_candidates ?? 0);
      const decidedCandidates = Number(reviewCounts?.decided_candidates ?? 0);
      const reviewRequired =
        requireReviewConfigured && totalCandidates > 0 && pendingCandidates > 0;

      const reviewState = readDuplicateReviewState(job);
      let stage: 'not_required' | 'pending' | 'in_progress' | 'completed' | 'failed' =
        'not_required';
      if (requireReviewConfigured) {
        if (totalCandidates === 0) {
          stage = 'completed';
        } else if (pendingCandidates === totalCandidates) {
          stage = 'pending';
        } else if (pendingCandidates > 0) {
          stage = 'in_progress';
        } else {
          stage = 'completed';
        }
      }
      if (reviewState.applyState.phase === 'failed') {
        stage = 'failed';
      }

      return res.json({
        success: true,
        status: {
          jobId,
          duplicate_detection_enabled: duplicatesEnabled,
          require_review: requireReviewConfigured,
          review_required: reviewRequired,
          stage,
          total_groups: totalGroups,
          total_candidates: totalCandidates,
          decided_candidates: decidedCandidates,
          pending_candidates: pendingCandidates,
          completed: requireReviewConfigured ? pendingCandidates === 0 : true,
          apply_state: reviewState.applyState,
          apply_summary: reviewState.applySummary || null,
          last_updated: Date.now(),
        },
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

      appLogger.debug('jobs.delete.request', {
        jobId: id,
        accountId: targetAccountId,
        testDbPath: (req as any).testDbPath,
      });

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
        appLogger.debug('jobs.delete.broadcasted', { jobId: id });
      }

      // Delete job from database
      await jobRepository.delete(id, targetAccountId, req);

      appLogger.info('jobs.delete.completed', {
        jobId: id,
        type: job.type,
        status: job.status,
      });

      return res.json({
        success: true,
        message: `Job ${id} deleted successfully`,
      });
    })
  );

  return router;
}
