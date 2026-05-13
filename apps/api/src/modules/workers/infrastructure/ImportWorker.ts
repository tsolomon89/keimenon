/**
 * Import Worker
 *
 * Processes import jobs through ImportPipelineRunner.
 * Wraps pipeline execution in a background job with checkpoint recovery.
 *
 * Responsibilities:
 * - Parse uploaded files
 * - Run import pipeline
 * - Report progress
 * - Handle errors
 *
 * Related: Product Directive - "Single file, many files, container-with-many"
 */

import { BaseWorker, WorkerContext, WorkerResult } from '../domain/Worker';
import { Job } from '../../jobs/domain/Job';
import { DatabaseClient } from '@keimenon/db';
import { ImportConversation, ImportResult } from '../../../services/import-enhanced-v2';
import { DatabaseWriteQueue } from '../../../services/DatabaseWriteQueue';
import {
  ImportJobStage,
  IMPORT_STAGE_LABELS,
  featureManifestForAccountClass,
  type GraphMaterializationSummary,
  type ImportGraphBirthMetadata,
  type NormalizedImportOptions,
} from '@keimenon/types';
import { normalizeImportOptions } from '../../jobs/domain/import-config-contract';
import { ParserRegistry, NormalizedConversation, NormalizedMessage } from '@keimenon/parsers';
import * as fs from 'fs/promises';
import { nanoid } from 'nanoid';
import { ImportPipelineRunner } from '../../import-pipeline/ImportPipelineRunner';
import {
  ChangeTracker,
  createChangeTracker,
  trackNodesCreated,
  trackEdgesCreated,
  serializeChangeTracker,
} from '../../jobs/domain/ChangeTracker';
import { JobRepository } from '../../jobs/infrastructure/JobRepository';
import { WORKER_CONFIG } from '../../jobs/jobs.config';
import { appLogger } from '../../../utils/logger';
import type { SqlVariableSplitDiagnostics } from '../../../services/WriteQueueErrorHandler';

/**
 * Import Checkpoint State
 *
 * Saved periodically during import to enable pause/resume.
 * Stored in job's state_data.checkpoint
 */
export interface ImportCheckpoint {
  phase: 'parse' | 'materialize' | 'dedupe' | 'group' | 'complete';
  fileIndex: number; // Which file we're on (0-indexed)
  conversationsProcessed: number; // Total conversations processed so far
  messagesProcessed: number; // Total messages processed so far
  lastBatchIndex: number; // Last batch processed within current file
  lastSaveTime: number; // Unix timestamp of last checkpoint save
  uploadHash: string; // Upload hash for this import job
}

// Checkpoint save interval: every 100 conversations or 30 seconds
const CHECKPOINT_INTERVAL_CONVERSATIONS = 100;
const CHECKPOINT_INTERVAL_MS = 30000;
const MAX_PARSE_ERROR_SAMPLES = 10;
const MAX_PARSE_ERROR_LOG_SAMPLES = 3;
const PARSE_ERROR_RATE_THRESHOLD = 0.3;
const PARSE_ERROR_RATE_MIN_ATTEMPTS = 100;
const BATCH_HEARTBEAT_INTERVAL_MS = parseInt(
  process.env.IMPORT_BATCH_HEARTBEAT_INTERVAL_MS || '10000',
  10
);
const WORKER_PROGRESS_REPORT_INTERVAL_MS = parseInt(
  process.env.IMPORT_WORKER_PROGRESS_REPORT_INTERVAL_MS || '1500',
  10
);
const LAYER_LINK_HEARTBEAT_STEP_MS = parseInt(
  process.env.IMPORT_LAYER_LINK_HEARTBEAT_STEP_MS || String(45 * 60 * 1000),
  10
);
const CANONICALIZE_HEARTBEAT_STEP_MS = parseInt(
  process.env.IMPORT_CANONICALIZE_HEARTBEAT_STEP_MS || String(10 * 60 * 1000),
  10
);
const STAGE_PROGRESS_FLOORS: Partial<Record<ImportJobStage, number>> = {
  [ImportJobStage.PARSE]: 10,
  [ImportJobStage.CANONICALIZE]: 14,
  [ImportJobStage.SPAN_EXTRACT]: 88,
  [ImportJobStage.ATOMIC_EXTRACT]: 90,
  [ImportJobStage.PACKET_DERIVE]: 92,
  [ImportJobStage.MASS_SCORE]: 94,
  [ImportJobStage.LAYER_LINK]: 96,
  [ImportJobStage.DEDUPE]: 97,
  [ImportJobStage.AWAIT_DECISIONS]: 97,
  [ImportJobStage.APPLY_DECISIONS]: 98,
  [ImportJobStage.MATERIALIZE]: 98,
  [ImportJobStage.INDEXING]: 99,
  [ImportJobStage.OBJECTIVE_QUEUE]: 99,
  [ImportJobStage.OBJECTIVE_EXTRACT]: 99,
  [ImportJobStage.OBJECTIVE_VERIFY]: 99,
  [ImportJobStage.OBJECTIVE_PUBLISH]: 99,
  [ImportJobStage.OBJECTIVE_DONE]: 99,
  [ImportJobStage.SUCCEEDED]: 100,
};

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return Math.max(0, Math.min(100, percent));
}

function asNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export type ParseErrorSample = { index: number; message: string };

export interface ParseQualityGateInput {
  parseAttemptCount: number;
  parseErrorCount: number;
  conversationsProcessed: number;
  parseErrorSamples: ParseErrorSample[];
}

export interface ParseQualityGateResult {
  code: 'PARSE_FAILED' | 'PARSE_ERROR_RATE_EXCEEDED';
  message: string;
  details: {
    parseErrorCount: number;
    attemptedItems: number;
    errorRate: number;
    threshold?: number;
    minimumAttempts?: number;
    samples: ParseErrorSample[];
  };
}

export interface GraphMaterializationInvariantResult {
  passed: boolean;
  missing: string[];
  message: string;
}

export interface ObjectiveQueueDecisionInput {
  objectiveLayerEnabled: boolean;
  agentRuntimeEnabled: boolean;
  agentBootstrapMode: 'manual' | 'auto';
  objectiveEnqueueKillSwitchEnabled: boolean;
}

export interface ObjectiveQueueDecision {
  shouldEnqueue: boolean;
  reason: 'enabled' | 'entitlement_missing' | 'kill_switch_enabled' | 'manual_activation_required';
}

export function evaluateObjectiveQueueDecision(
  input: ObjectiveQueueDecisionInput
): ObjectiveQueueDecision {
  if (!input.objectiveLayerEnabled || !input.agentRuntimeEnabled) {
    return {
      shouldEnqueue: false,
      reason: 'entitlement_missing',
    };
  }

  if (input.objectiveEnqueueKillSwitchEnabled) {
    return {
      shouldEnqueue: false,
      reason: 'kill_switch_enabled',
    };
  }

  if (input.agentBootstrapMode !== 'auto') {
    return {
      shouldEnqueue: false,
      reason: 'manual_activation_required',
    };
  }

  return {
    shouldEnqueue: true,
    reason: 'enabled',
  };
}

export function evaluateParseQualityGate(
  input: ParseQualityGateInput
): ParseQualityGateResult | null {
  const { parseAttemptCount, parseErrorCount, conversationsProcessed, parseErrorSamples } = input;
  const parseErrorRate = parseAttemptCount > 0 ? parseErrorCount / parseAttemptCount : 0;

  if (parseErrorCount > 0 && conversationsProcessed === 0) {
    return {
      code: 'PARSE_FAILED',
      message: 'Import parsing failed for all attempted items.',
      details: {
        parseErrorCount,
        attemptedItems: parseAttemptCount,
        errorRate: parseErrorRate,
        samples: parseErrorSamples,
      },
    };
  }

  if (
    parseAttemptCount >= PARSE_ERROR_RATE_MIN_ATTEMPTS &&
    parseErrorRate >= PARSE_ERROR_RATE_THRESHOLD
  ) {
    return {
      code: 'PARSE_ERROR_RATE_EXCEEDED',
      message: `Import parse error rate exceeded threshold (${(parseErrorRate * 100).toFixed(1)}% >= ${(PARSE_ERROR_RATE_THRESHOLD * 100).toFixed(0)}%).`,
      details: {
        parseErrorCount,
        attemptedItems: parseAttemptCount,
        errorRate: parseErrorRate,
        threshold: PARSE_ERROR_RATE_THRESHOLD,
        minimumAttempts: PARSE_ERROR_RATE_MIN_ATTEMPTS,
        samples: parseErrorSamples,
      },
    };
  }

  return null;
}

export function evaluateGraphMaterializationInvariant(
  summary: GraphMaterializationSummary
): GraphMaterializationInvariantResult {
  const missing: string[] = [];

  if (summary.createdInJob.sources <= 0) {
    missing.push('sources_created_in_job');
  }
  if (summary.createdInJob.groups <= 0) {
    missing.push('groups_created_in_job');
  }
  if (summary.counts.accountNodes <= 0) {
    missing.push('account_nodes');
  }
  if (summary.counts.principals <= 0) {
    missing.push('principal_nodes');
  }
  if (summary.counts.sources <= 0) {
    missing.push('source_nodes');
  }
  if (summary.counts.groups <= 0) {
    missing.push('group_nodes');
  }
  if (summary.links.accountPrincipal <= 0) {
    missing.push('account_principal_links');
  }
  if (summary.links.sourcePrincipal <= 0) {
    missing.push('source_principal_links');
  }
  if (summary.links.sourceGroup <= 0) {
    missing.push('source_group_links');
  }

  return {
    passed: missing.length === 0,
    missing,
    message:
      missing.length === 0
        ? 'Graph materialization invariant satisfied.'
        : `Graph materialization invariant failed: missing ${missing.join(', ')}`,
  };
}

function normalizeErrorMessage(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Error && typeof value.message === 'string') {
    return value.message;
  }
  if (value == null) {
    return 'Unknown import error';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function isMalformedInputMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('invalid json') ||
    normalized.includes('unexpected end of json input') ||
    normalized.includes('unexpected token') ||
    normalized.includes('unexpected "') ||
    normalized.includes('state stop')
  );
}

function toImportInvalidInputError(message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = 'IMPORT_INVALID_INPUT';
  return error;
}

function shouldLogInvalidInputRejection(): boolean {
  const override = process.env.IMPORT_WORKER_LOG_INVALID_INPUT;
  if (override === '1') {
    return true;
  }
  if (override === '0') {
    return false;
  }
  return process.env.NODE_ENV !== 'test';
}

function shouldLogParseItemErrors(): boolean {
  const override = process.env.IMPORT_WORKER_LOG_PARSE_ERRORS;
  if (override === '1') {
    return true;
  }
  if (override === '0') {
    return false;
  }
  return process.env.NODE_ENV !== 'test';
}

// Shared parser registry instance
const parserRegistry = new ParserRegistry();

function computeWeightedImportProgress(
  fileIndex: number,
  fileProgressPercent: number,
  totalFileCount: number
): number {
  if (totalFileCount <= 0) {
    return 10;
  }

  const boundedFileProgress = Math.max(0, Math.min(100, fileProgressPercent));
  const weighted = 10 + Math.floor(((fileIndex + boundedFileProgress / 100) / totalFileCount) * 80);
  return Math.max(10, Math.min(90, weighted));
}

/**
 * Convert NormalizedConversation (from @keimenon/parsers) to ImportConversation
 * Handles the type mapping between parser output and import service input
 */
function normalizedToImportConversation(
  normalized: NormalizedConversation,
  sourceFile: string
): ImportConversation {
  return {
    id: normalized.conversation_id,
    title: normalized.title,
    platform: normalized.platform,
    created_at: normalized.created_at,
    messages: normalized.messages.map((msg: NormalizedMessage) => ({
      id: msg.metadata?.id || `msg_${nanoid()}`,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      conversationId: normalized.conversation_id,
      index: msg.index,
      hash: msg.hash,
    })),
  };
}

export class ImportWorker extends BaseWorker {
  readonly type = 'import' as const;
  private timeoutMs: number;
  private activityByJobId: Map<string, number> = new Map();

  constructor(
    private db: DatabaseClient,
    private writeQueue?: DatabaseWriteQueue,
    timeoutMs?: number
  ) {
    super();
    this.timeoutMs = timeoutMs ?? WORKER_CONFIG.import.timeoutMs;
  }

  /**
   * Get database client for job (test DB if testContext, otherwise production DB)
   *
   * Test isolation: E2E tests set testContext in job config with path to test database.
   * This ensures background workers write to the correct test database instead of production.
   */
  private async getDbClientForJob(job: Job): Promise<DatabaseClient> {
    const testDbPath = job.config.testContext?.dbPath;

    if (testDbPath) {
      const path = await import('path');
      console.log(`[ImportWorker] Using test database: ${path.basename(testDbPath)}`);
      const { getDbClient } = await import('../../../utils/get-db-client');
      const mockReq = { testDbPath } as any;
      return await getDbClient(mockReq);
    }

    return this.db; // Production database
  }

  validate(job: Job): boolean {
    // Check required config
    if (!job.config.files || job.config.files.length === 0) {
      return false;
    }

    return true;
  }

  protected async execute(job: Job, context: WorkerContext): Promise<WorkerResult> {
    // Calculate adaptive timeout based on import size
    const adaptiveTimeout = this.calculateAdaptiveTimeout(job);
    console.log(`⏱️  Adaptive timeout: ${Math.round(adaptiveTimeout / 1000)}s`);

    const stallTimeout = this.calculateStallTimeout(job);
    this.markJobActivity(job.id);
    console.log(`⏱️  Stall timeout: ${Math.round(stallTimeout / 1000)}s`);

    try {
      return await this.executeWithExecutionGuards(job, context, adaptiveTimeout, stallTimeout);
    } finally {
      this.activityByJobId.delete(job.id);
    }
  }

  /**
   * Calculate timeout based on import size
   *
   * Formula:
   * - Base: 2 minutes
   * - Per 100 messages (estimated from file size): +1 minute
   * - Spine extraction and automatic-v2 processing increase multiplier
   * - Max: configurable (default 6 hours)
   */
  private calculateAdaptiveTimeout(job: Job): number {
    const files = job.config.files || [];

    // Estimate message count from file size (~1KB per message average)
    const estimatedMessages = files.reduce((sum, f) => {
      return sum + Math.ceil((f.fileSize || 0) / 1024);
    }, 0);

    const { baseMs, perHundredMsgsMs, spineMultiplier, proImportMultiplier, maxMs } =
      WORKER_CONFIG.import.adaptiveTimeout;

    const importOptions = job.config.importOptions as Record<string, unknown> | undefined;
    const metadata = job.config.metadata as Record<string, unknown> | undefined;
    const spineEnabled =
      metadata?.spineEnabled === true ||
      ((importOptions?.spine as Record<string, unknown> | undefined)?.enabled ?? false) === true;
    const processingMode = String(importOptions?.processingMode || 'automatic').toLowerCase();
    const contractVersion = String(metadata?.importContractVersion || '').toLowerCase();
    const proImportEnabled =
      processingMode === 'automatic' || processingMode === 'hybrid' || contractVersion === 'v2';

    const calculated =
      (baseMs + Math.ceil(estimatedMessages / 100) * perHundredMsgsMs) *
      (spineEnabled ? spineMultiplier : 1) *
      (proImportEnabled ? proImportMultiplier : 1);

    return Math.min(Math.max(this.timeoutMs, calculated), maxMs);
  }

  /**
   * Calculate inactivity timeout before import is considered stalled.
   */
  private calculateStallTimeout(job: Job): number {
    const importOptions = job.config.importOptions as Record<string, unknown> | undefined;
    const processingMode = String(importOptions?.processingMode || 'automatic').toLowerCase();
    const modeMultiplier = processingMode === 'automatic' || processingMode === 'hybrid' ? 1.5 : 1;
    const calculated = Math.round(WORKER_CONFIG.import.stallTimeoutMs * modeMultiplier);
    return Math.max(60_000, calculated);
  }

  private markJobActivity(jobId: string): void {
    this.activityByJobId.set(jobId, Date.now());
  }

  private async resolveImportWorkerPath(): Promise<string> {
    const path = await import('path');

    const configuredWorkerPath = process.env.IMPORT_WORKER_PATH;
    const candidates: string[] = [];

    if (configuredWorkerPath) {
      candidates.push(path.resolve(configuredWorkerPath));
    }

    if (__filename.endsWith('.ts')) {
      // In tsx/dev/test runtime we prefer source worker entry first so behavior
      // stays in sync with local source changes (instead of stale dist artifacts).
      candidates.push(path.join(__dirname, 'import.worker.ts'));
      candidates.push(path.join(__dirname, 'import.worker.js'));
      candidates.push(
        path.join(
          process.cwd(),
          'apps',
          'api',
          'dist',
          'modules',
          'workers',
          'infrastructure',
          'import.worker.js'
        )
      );
      candidates.push(
        path.join(process.cwd(), 'dist', 'modules', 'workers', 'infrastructure', 'import.worker.js')
      );
    } else {
      candidates.push(path.join(__dirname, 'import.worker.js'));
      candidates.push(path.join(__dirname, 'import.worker.ts'));
    }

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Continue candidate resolution
      }
    }

    throw new Error('Import worker runtime script not found');
  }

  private getIdleDurationMs(jobId: string): number {
    const lastActivity = this.activityByJobId.get(jobId) ?? Date.now();
    return Math.max(0, Date.now() - lastActivity);
  }

  private createWallClockTimeoutError(job: Job, timeoutMs: number): Error & { code: string } {
    const error = new Error(
      `Import job ${job.id} exceeded timeout of ${timeoutMs}ms (${Math.round(timeoutMs / 1000)}s). ` +
        'This import was actively processing but exceeded the configured wall-clock envelope.'
    ) as Error & { code: string };
    error.code = 'IMPORT_TIMEOUT';
    return error;
  }

  private createStallTimeoutError(
    job: Job,
    idleMs: number,
    stallTimeoutMs: number
  ): Error & {
    code: string;
  } {
    const error = new Error(
      `Import job ${job.id} stalled for ${idleMs}ms without progress/activity (stall timeout ${stallTimeoutMs}ms).`
    ) as Error & { code: string };
    error.code = 'IMPORT_STALLED';
    return error;
  }

  private async executeWithExecutionGuards(
    job: Job,
    context: WorkerContext,
    hardTimeoutMs: number,
    stallTimeoutMs: number
  ): Promise<WorkerResult> {
    return new Promise<WorkerResult>((resolve, reject) => {
      let settled = false;
      const stallCheckIntervalMs = Math.max(5000, Math.min(30000, Math.floor(stallTimeoutMs / 8)));
      let hardTimeoutHandle: NodeJS.Timeout | null = null;
      let stallIntervalHandle: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (hardTimeoutHandle) {
          clearTimeout(hardTimeoutHandle);
          hardTimeoutHandle = null;
        }
        if (stallIntervalHandle) {
          clearInterval(stallIntervalHandle);
          stallIntervalHandle = null;
        }
        context.signal.removeEventListener('abort', abortHandler);
      };

      const settleResolve = (result: WorkerResult) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(result);
      };

      const settleReject = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const abortHandler = () => {
        if (settled) {
          return;
        }
        // executeWithCheckpoints handles cancellation; only stop guard timers here.
        cleanup();
      };

      hardTimeoutHandle = setTimeout(() => {
        settleReject(this.createWallClockTimeoutError(job, hardTimeoutMs));
      }, hardTimeoutMs);

      stallIntervalHandle = setInterval(() => {
        if (settled) {
          return;
        }
        const idleMs = this.getIdleDurationMs(job.id);
        if (idleMs >= stallTimeoutMs) {
          settleReject(this.createStallTimeoutError(job, idleMs, stallTimeoutMs));
        }
      }, stallCheckIntervalMs);

      context.signal.addEventListener('abort', abortHandler);

      this.executeWithCheckpoints(job, context).then(settleResolve).catch(settleReject);
    });
  }

  protected async reportProgress(
    job: Job,
    current: number,
    total: number,
    message: string,
    context: WorkerContext,
    stage?: ImportJobStage,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const shapedCurrent = this.shapeProgressCurrent(job, current, total, stage, metadata);
    this.markJobActivity(job.id);
    await super.reportProgress(job, shapedCurrent, total, message, context, stage, metadata);
    this.markJobActivity(job.id);
  }

  private shapeProgressCurrent(
    job: Job,
    current: number,
    total: number,
    stage?: ImportJobStage,
    metadata?: Record<string, unknown>
  ): number {
    if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
      return current;
    }

    const previousPercent = clampPercent(job.progress.percent);
    let percent = clampPercent((current / total) * 100);

    if (stage) {
      const stageFloor = STAGE_PROGRESS_FLOORS[stage];
      if (typeof stageFloor === 'number') {
        percent = Math.max(percent, stageFloor);
      }

      const elapsedMs = asNumber(metadata?.elapsedMsInBatch) ?? 0;
      if (elapsedMs > 0) {
        if (stage === ImportJobStage.LAYER_LINK) {
          const heartbeatBoost = Math.min(3, Math.floor(elapsedMs / LAYER_LINK_HEARTBEAT_STEP_MS));
          percent = Math.max(percent, 96 + heartbeatBoost);
        } else if (stage === ImportJobStage.CANONICALIZE) {
          const heartbeatBoost = Math.min(
            3,
            Math.floor(elapsedMs / CANONICALIZE_HEARTBEAT_STEP_MS)
          );
          // Canonicalize can remain active for long periods while still making progress.
          // Keep progress moving to avoid false "stuck" perception.
          if (percent >= 70) {
            percent = Math.max(percent, Math.min(95, percent + heartbeatBoost));
          }
        }
      }
    }

    if (stage !== ImportJobStage.SUCCEEDED && stage !== ImportJobStage.FAILED) {
      percent = Math.min(percent, 99);
    }

    percent = Math.max(percent, previousPercent);
    return Math.max(0, Math.min(total, Math.round((percent / 100) * total)));
  }

  /**
   * Execute import with checkpoint tracking for resume capability
   * Uses Worker Thread to prevent main loop blocking
   *
   * Checkpoints are saved:
   * - Every CHECKPOINT_INTERVAL_CONVERSATIONS (100) conversations
   * - Every CHECKPOINT_INTERVAL_MS (30 seconds)
   * - When job is paused
   *
   * Resume behavior:
   * - If checkpoint exists in state_data, skip already-processed files/batches
   * - Continue from last checkpoint position
   */
  private async executeWithCheckpoints(job: Job, context: WorkerContext): Promise<WorkerResult> {
    const files = job.config.files || [];
    const importOptions = job.config.importOptions || {};
    this.markJobActivity(job.id);

    // ✅ Initialize change tracker for rollback support
    const changeTracker: ChangeTracker = createChangeTracker();

    console.log(`📥 Import worker processing ${files.length} file(s) for job ${job.id}`);
    console.log(`⏱️  Timeout: ${Math.round(this.timeoutMs / 1000)}s`);

    try {
      // Step 1: Initialize Import Service early (we need it for batch processing)
      // Get correct database client (test DB for E2E tests, production DB otherwise)
      const dbClient = await this.getDbClientForJob(job);
      const schemaCompatibilityCheck = (dbClient as any).assertImportSchemaCompatibility;
      if (typeof schemaCompatibilityCheck === 'function') {
        schemaCompatibilityCheck.call(dbClient);
      }
      console.log(`[ImportWorker] 🔌 DB Client Path: ${(dbClient as any).name}`);
      console.log(`[ImportWorker] 🔌 DB Connection: ${(dbClient as any).open ? 'OPEN' : 'CLOSED'}`);

      // In test mode, disable write queue to avoid database client mismatch
      const isTestMode = !!job.config.testContext?.dbPath;
      const writeQueue = isTestMode ? undefined : this.writeQueue;

      const { getDbWorker } = await import('../../../workers/db-worker-singleton');
      const dbWorker = getDbWorker();
      const { BulkGraphWriteSink, LegacyQueuedGraphWriteSink } =
        await import('../../../services/GraphWriteSink');
      const { GraphBatchAccumulator } = await import('../../../services/GraphBatchAccumulator');

      let batchAccumulator: any;
      if (process.env.KEIMENON_BULK_INSERTS !== '0') {
        if (!isTestMode && dbWorker?.isReady()) {
          const sink = new BulkGraphWriteSink(dbWorker as any, (progress) => {
            void this.reportProgress(
              job,
              progress.nodesWritten + progress.edgesWritten,
              -1, // total is handled by the overall ImportPipeline logic
              `Writing graph batch ${progress.batchIndex}...`,
              context,
              ImportJobStage.MATERIALIZE,
              {
                elapsedMsInBatch: progress.elapsedMs,
                nodesWritten: progress.nodesWritten,
                edgesWritten: progress.edgesWritten,
                payloadsWritten: progress.payloadsWritten,
                quarantinedRows: progress.quarantinedRows,
                batchPhase: progress.phase,
              }
            );
          });
          batchAccumulator = new GraphBatchAccumulator(sink, job.accountId, job.createdBy, job.id);
        } else if (writeQueue) {
          const sink = new LegacyQueuedGraphWriteSink(writeQueue);
          batchAccumulator = new GraphBatchAccumulator(sink, job.accountId, job.createdBy, job.id);
        }
      }

      const pipelineRunner = new ImportPipelineRunner(dbClient, writeQueue, batchAccumulator);

      // Step 1b: Check for existing checkpoint (resume scenario)
      let checkpoint: ImportCheckpoint | null = null;
      let uploadHash: string;
      let totalConversationsProcessed = 0;
      let totalMessagesProcessed = 0;
      let totalSourcesCreated = 0;
      let totalNodesCreated = 0;
      let totalEdgesCreated = 0;
      let totalManualGroups = 0;
      let totalAutoGroups = 0;
      let totalSpansCreated = 0;
      let totalPacketsCreated = 0;
      let totalAtomicUnitsCreated = 0;
      let totalPacketMassLinksCreated = 0;
      let totalGroupingEligibleMessages = 0;
      let totalGroupingAssignedMessages = 0;
      let totalGroupingUnmatchedMessages = 0;
      let totalGroupingDuplicateAssignments = 0;
      let totalGroupingNonCatchAllGroups = 0;
      const groupingTopLabels = new Set<string>();
      let totalSqlVariableSplitRetries = 0;
      let totalDeferredForeignKeyEdges = 0;
      let totalFkRequeueEscalations = 0;
      let lastSqlVariableSplit: SqlVariableSplitDiagnostics | undefined;
      let startFileIndex = 0;
      let startBatchIndex = 0;

      // Try to load existing checkpoint from job state_data
      const stateData = await this.loadJobStateData(job, context);
      if (stateData?.checkpoint && stateData.checkpoint.phase !== 'complete') {
        checkpoint = stateData.checkpoint as ImportCheckpoint;
        uploadHash = checkpoint.uploadHash;
        totalConversationsProcessed = checkpoint.conversationsProcessed;
        totalMessagesProcessed = checkpoint.messagesProcessed;
        totalSourcesCreated = Number(stateData?.stats?.sourcesCreated ?? 0);
        totalNodesCreated = Number(stateData?.stats?.nodesCreated ?? 0);
        totalEdgesCreated = Number(stateData?.stats?.edgesCreated ?? 0);
        totalManualGroups = Number(stateData?.stats?.manualGroups ?? 0);
        totalAutoGroups =
          Number(stateData?.stats?.autoGroups ?? 0) + (stateData?.stats?.catchAllGroup ? 1 : 0);
        totalSpansCreated = Number(stateData?.stats?.spansCreated ?? 0);
        totalPacketsCreated = Number(stateData?.stats?.packetsCreated ?? 0);
        totalAtomicUnitsCreated = Number(stateData?.stats?.atomicUnitsCreated ?? 0);
        totalPacketMassLinksCreated = Number(stateData?.stats?.packetMassLinksCreated ?? 0);
        startFileIndex = checkpoint.fileIndex;
        startBatchIndex = checkpoint.lastBatchIndex + 1; // Resume from next batch

        console.log(`📥 Resuming import from checkpoint:`);
        console.log(`   - File: ${startFileIndex + 1}/${files.length}`);
        console.log(`   - Batch: ${startBatchIndex}`);
        console.log(`   - Conversations: ${totalConversationsProcessed}`);
        console.log(`   - Messages: ${totalMessagesProcessed}`);
      } else {
        // New import - generate fresh upload hash
        uploadHash = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        console.log(`📥 Starting fresh import with hash: ${uploadHash}`);
      }

      // Canonical runtime config (single contract across UI/API/worker)
      const config: NormalizedImportOptions = normalizeImportOptions(importOptions);
      const accountClass = this.resolveJobAccountClass(job);
      const features = featureManifestForAccountClass(accountClass);

      // Track last checkpoint save time
      let lastCheckpointTime = Date.now();
      let conversationsSinceCheckpoint = 0;

      // Track parse quality for terminal gating
      let parseAttemptCount = 0;
      let parseErrorCount = 0;
      const parseErrorSamples: Array<{ index: number; message: string }> = [];

      const { Worker } = await import('worker_threads');
      const workerScriptPath = await this.resolveImportWorkerPath();

      // Step 2: Process Files Sequentially via Worker Thread
      for (let fileIndex = startFileIndex; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex];
        let currentBatchIndex = 0;
        let currentOverallProgress = computeWeightedImportProgress(fileIndex, 0, files.length);

        // If resuming mid-file, skip to the correct batch
        const skipBatches = fileIndex === startFileIndex ? startBatchIndex : 0;

        if (this.shouldCancel(context.signal)) {
          // Save checkpoint before canceling
          await this.saveCheckpoint(
            job,
            context,
            {
              phase: 'parse',
              fileIndex,
              conversationsProcessed: totalConversationsProcessed,
              messagesProcessed: totalMessagesProcessed,
              lastBatchIndex: currentBatchIndex,
              lastSaveTime: Date.now(),
              uploadHash,
            },
            changeTracker
          );
          throw new Error('CANCELED');
        }

        await this.reportProgress(
          job,
          computeWeightedImportProgress(fileIndex, 0, files.length),
          100,
          `${IMPORT_STAGE_LABELS[ImportJobStage.PARSE]} (${fileIndex + 1}/${files.length})`,
          context,
          ImportJobStage.PARSE
        );

        // Calculate conversations to skip for resume optimization
        // Worker will skip these internally to reduce IPC overhead
        const batchSize = 50;
        const skipConversations = skipBatches * batchSize;

        console.log(
          `[ImportWorker] Spawning worker for: ${file.fileName}${skipConversations > 0 ? ` (resuming, skipping ~${skipConversations} conversations)` : ''}`
        );

        if (!file.filePath) {
          throw new Error(`Missing file path for import file: ${file.fileName}`);
        }

        const workerOptions: {
          workerData: {
            filePath: string;
            fileSize: number;
            mimeType: string;
            batchSize: number;
            skipConversations: number;
          };
          execArgv?: string[];
        } = {
          workerData: {
            filePath: file.filePath,
            fileSize: file.fileSize,
            mimeType: file.mimeType || 'application/octet-stream',
            batchSize,
            skipConversations, // Resume optimization: worker skips these internally
          },
        };
        if (workerScriptPath.endsWith('.ts')) {
          workerOptions.execArgv = ['--no-warnings=MODULE_TYPELESS_PACKAGE_JSON'];
        }
        const worker = new Worker(workerScriptPath, workerOptions);

        // Worker Promise
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          let lastPipelineStage: ImportJobStage = ImportJobStage.PARSE;
          let lastPipelineMessage = IMPORT_STAGE_LABELS[ImportJobStage.PARSE];
          let latestWorkerFilePercent = 0;
          let lastWorkerProgressReportAt = 0;
          let heartbeatHandle: NodeJS.Timeout | null = null;
          let heartbeatElapsedMs = 0;
          let batchStartedAtMs = Date.now();

          const stopHeartbeat = () => {
            if (heartbeatHandle) {
              clearInterval(heartbeatHandle);
              heartbeatHandle = null;
            }
            heartbeatElapsedMs = 0;
          };

          const reportWorkerProgress = async (message: any, force = false): Promise<void> => {
            if (settled) {
              return;
            }

            this.markJobActivity(job.id);

            const fileProgress = Number(message?.data?.percent ?? latestWorkerFilePercent);
            if (Number.isFinite(fileProgress)) {
              latestWorkerFilePercent = Math.max(
                latestWorkerFilePercent,
                Math.max(0, Math.min(100, fileProgress))
              );
            }

            const weightedProgress = computeWeightedImportProgress(
              fileIndex,
              latestWorkerFilePercent,
              files.length
            );
            const overallProgress = Math.max(currentOverallProgress, weightedProgress);
            const now = Date.now();
            const shouldReport =
              force ||
              overallProgress > currentOverallProgress ||
              now - lastWorkerProgressReportAt >= WORKER_PROGRESS_REPORT_INTERVAL_MS;

            currentOverallProgress = overallProgress;

            if (!shouldReport) {
              return;
            }

            const workerMessage =
              typeof message?.data?.message === 'string' && message.data.message.trim().length > 0
                ? message.data.message
                : `Processing ${file.fileName}`;
            const metadataFromMessage =
              message?.data?.metadata && typeof message.data.metadata === 'object'
                ? (message.data.metadata as Record<string, unknown>)
                : {};
            const elapsedMsInBatch = Math.max(0, Date.now() - batchStartedAtMs);
            const progressMetadata: Record<string, unknown> = {
              ...metadataFromMessage,
              heartbeat: metadataFromMessage.heartbeat === true,
              batchIndex: Number(metadataFromMessage.batchIndex ?? currentBatchIndex),
              fileIndex: Number(metadataFromMessage.fileIndex ?? fileIndex),
              elapsedMsInBatch: Number(metadataFromMessage.elapsedMsInBatch ?? elapsedMsInBatch),
            };

            lastWorkerProgressReportAt = now;
            await this.reportProgress(
              job,
              overallProgress,
              100,
              `Processing ${file.fileName}: ${workerMessage}`,
              context,
              lastPipelineStage,
              progressMetadata
            );
          };

          const startBatchHeartbeat = () => {
            stopHeartbeat();
            batchStartedAtMs = Date.now();
            heartbeatHandle = setInterval(() => {
              if (settled) {
                return;
              }

              heartbeatElapsedMs += BATCH_HEARTBEAT_INTERVAL_MS;
              const elapsedSeconds = Math.max(1, Math.round(heartbeatElapsedMs / 1000));
              const heartbeatMessage = `${lastPipelineMessage} (${elapsedSeconds}s elapsed)`;
              void reportWorkerProgress(
                {
                  data: {
                    percent: latestWorkerFilePercent,
                    message: heartbeatMessage,
                    metadata: {
                      heartbeat: true,
                      batchIndex: currentBatchIndex,
                      fileIndex,
                      elapsedMsInBatch: heartbeatElapsedMs,
                    },
                  },
                },
                true
              ).catch((error) => {
                finishReject(error);
              });
            }, BATCH_HEARTBEAT_INTERVAL_MS);
          };

          const terminateWorker = async () => {
            try {
              await worker.terminate();
            } catch {
              // Ignore worker termination errors during teardown
            }
          };

          const finishResolve = () => {
            if (settled) {
              return;
            }
            settled = true;
            stopHeartbeat();
            context.signal.removeEventListener('abort', abortHandler);
            worker.off('message', onMessageQueued);
            worker.off('error', onError);
            worker.off('exit', onExit);
            void terminateWorker();
            resolve();
          };

          const finishReject = (error: unknown) => {
            if (settled) {
              return;
            }
            settled = true;
            stopHeartbeat();
            context.signal.removeEventListener('abort', abortHandler);
            worker.off('message', onMessageQueued);
            worker.off('error', onError);
            worker.off('exit', onExit);
            void terminateWorker();
            reject(error instanceof Error ? error : new Error(String(error)));
          };

          const onMessage = async (message: any) => {
            try {
              if (settled) {
                return;
              }
              this.markJobActivity(job.id);
              if (message.type === 'batch') {
                currentBatchIndex++;

                // Note: Batch skipping is now handled by the worker internally
                // via skipConversations parameter for better performance

                // Process Batch - parse raw data using ParserRegistry
                const rawBatch = message.data as Array<{ raw: unknown; index: number }>;
                if (rawBatch.length > 0) {
                  try {
                    // Parse raw conversations using proper parser
                    const parsedConversations: ImportConversation[] = [];

                    for (const item of rawBatch) {
                      if (settled) {
                        return;
                      }
                      parseAttemptCount++;

                      try {
                        const rawPayloads: unknown[] = (() => {
                          if (!Array.isArray(item.raw)) {
                            return [item.raw];
                          }

                          const firstObjectLike = item.raw.find(
                            (entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
                          ) as Record<string, unknown> | undefined;

                          const looksLikeConversationArray =
                            !!firstObjectLike &&
                            ('messages' in firstObjectLike ||
                              'mapping' in firstObjectLike ||
                              'chat_messages' in firstObjectLike);

                          if (looksLikeConversationArray) {
                            // Some object-root exports stream `conversations` as a single array payload.
                            // Expand to per-conversation records for consistent parser behavior.
                            return item.raw;
                          }

                          // Treat message arrays as a single generic conversation payload.
                          return [{ messages: item.raw }];
                        })();

                        for (const rawPayload of rawPayloads) {
                          // ParserRegistry auto-detects format (ChatGPT/Claude/Gemini)
                          const parseResult = await parserRegistry.parse(rawPayload, file.fileName);

                          // Convert each parsed conversation to ImportConversation format
                          for (const normalized of parseResult.conversations) {
                            parsedConversations.push(
                              normalizedToImportConversation(normalized, file.fileName)
                            );
                          }
                        }
                      } catch (parseError: any) {
                        parseErrorCount++;
                        const errorMessage = parseError.message || 'Unknown parse error';
                        if (
                          shouldLogParseItemErrors() &&
                          parseErrorSamples.length < MAX_PARSE_ERROR_LOG_SAMPLES
                        ) {
                          console.warn(
                            `[ImportWorker] Parse error for item ${item.index}: ${errorMessage}`
                          );
                        }

                        // Track sample errors for reporting (limit to prevent memory issues)
                        if (parseErrorSamples.length < MAX_PARSE_ERROR_SAMPLES) {
                          parseErrorSamples.push({ index: item.index, message: errorMessage });
                        }
                        // Continue with next item - don't fail entire batch
                      }
                    }

                    if (parsedConversations.length === 0 || settled) {
                      // No conversations parsed - skip this batch
                      return;
                    }

                    lastPipelineStage = ImportJobStage.CANONICALIZE;
                    lastPipelineMessage = 'Reconstructing canonical conversation graph';
                    startBatchHeartbeat();

                    let result: ImportResult;
                    try {
                      result = await pipelineRunner.run({
                        conversations: parsedConversations,
                        uploadHash,
                        config,
                        context: {
                          accountId: job.accountId,
                          userId: job.createdBy,
                          jobId: job.id,
                          agentRuntimeEnabled: features.agent_runtime,
                        },
                        hooks: {
                          onStage: async (stage, stageMessage) => {
                            if (settled) {
                              return;
                            }
                            lastPipelineStage = stage;
                            lastPipelineMessage = stageMessage;
                            await this.reportProgress(
                              job,
                              currentOverallProgress,
                              100,
                              `${file.fileName}: ${stageMessage}`,
                              context,
                              stage,
                              {
                                heartbeat: false,
                                batchIndex: currentBatchIndex,
                                fileIndex,
                                elapsedMsInBatch: Math.max(0, Date.now() - batchStartedAtMs),
                              }
                            );
                          },
                        },
                      });
                    } finally {
                      stopHeartbeat();
                    }

                    if (settled) {
                      return;
                    }

                    totalConversationsProcessed += result.conversations;
                    totalMessagesProcessed += result.messages;
                    totalSourcesCreated += result.sources;
                    totalNodesCreated += result.createdNodeIds?.length || 0;
                    totalEdgesCreated += result.createdEdgeIds?.length || 0;
                    totalManualGroups += Number(result.stats?.grouping?.manualGroups ?? 0);
                    totalAutoGroups +=
                      Number(result.stats?.grouping?.autoGroups ?? 0) +
                      (result.stats?.grouping?.catchAllGroup ? 1 : 0);
                    totalSpansCreated += Number(result.stats?.proImport?.spans ?? 0);
                    totalPacketsCreated += Number(result.stats?.proImport?.packets ?? 0);
                    totalAtomicUnitsCreated += Number(result.stats?.proImport?.atomicUnits ?? 0);
                    totalPacketMassLinksCreated += Number(
                      result.stats?.proImport?.packetMassLinks ?? 0
                    );
                    const groupingDiagnostics = result.stats?.grouping?.diagnostics;
                    if (groupingDiagnostics) {
                      totalGroupingEligibleMessages += Number(
                        groupingDiagnostics.eligibleMessages ?? 0
                      );
                      totalGroupingAssignedMessages += Number(
                        groupingDiagnostics.assignedMessages ?? 0
                      );
                      totalGroupingUnmatchedMessages += Number(
                        groupingDiagnostics.unmatchedMessages ?? 0
                      );
                      totalGroupingDuplicateAssignments += Number(
                        groupingDiagnostics.duplicateAssignments ?? 0
                      );
                      totalGroupingNonCatchAllGroups += Number(
                        groupingDiagnostics.nonCatchAllGroupCount ?? 0
                      );
                      const labels = Array.isArray(groupingDiagnostics.topLabels)
                        ? groupingDiagnostics.topLabels
                        : [];
                      for (const label of labels) {
                        if (typeof label === 'string' && label.trim().length > 0) {
                          groupingTopLabels.add(label);
                        }
                      }
                    }
                    const writeQueueDiagnostics = result.stats?.processing?.writeQueue;
                    if (writeQueueDiagnostics) {
                      totalSqlVariableSplitRetries += Number(
                        writeQueueDiagnostics.sqlVariableSplitRetries ?? 0
                      );
                      totalDeferredForeignKeyEdges += Number(
                        writeQueueDiagnostics.deferredForeignKeyEdges ?? 0
                      );
                      totalFkRequeueEscalations += Number(
                        writeQueueDiagnostics.fkRequeueEscalations ?? 0
                      );
                      if (writeQueueDiagnostics.lastSqlVariableSplit) {
                        lastSqlVariableSplit = writeQueueDiagnostics.lastSqlVariableSplit;
                      }
                    }
                    conversationsSinceCheckpoint += result.conversations;

                    console.log(
                      `[ImportWorker] 📊 Batch Result: +${result.conversations} conversations, +${result.messages} messages`
                    );
                    console.log(
                      `[ImportWorker] 📊 Created Nodes: ${result.createdNodeIds?.length || 0}, Edges: ${result.createdEdgeIds?.length || 0}`
                    );

                    if (isTestMode) {
                      try {
                        // Verify DB write immediately
                        const nodeCountResult = await dbClient.execute(
                          'SELECT COUNT(*) as count FROM nodes'
                        );
                        const nodeCount = Number(nodeCountResult?.records?.[0]?.count ?? 0);
                        console.log(
                          `[ImportWorker] 🔍 Immediate DB check (worker file): ${nodeCount} nodes total`
                        );
                      } catch (e: any) {
                        console.error(`[ImportWorker] ⚠️ Validation check failed: ${e.message}`);
                      }
                    }

                    // Track created entities for rollback support
                    if (result.createdNodeIds && result.createdNodeIds.length > 0) {
                      trackNodesCreated(changeTracker, result.createdNodeIds);
                    }
                    if (result.createdEdgeIds && result.createdEdgeIds.length > 0) {
                      trackEdgesCreated(changeTracker, result.createdEdgeIds);
                    }

                    if (settled) {
                      return;
                    }

                    job.updateStats({
                      conversationsProcessed: totalConversationsProcessed,
                      messagesProcessed: totalMessagesProcessed,
                      nodesCreated: totalNodesCreated,
                      edgesCreated: totalEdgesCreated,
                      sourcesCreated: totalSourcesCreated,
                      manualGroups: totalManualGroups,
                      autoGroups: totalAutoGroups,
                      spansCreated: totalSpansCreated,
                      packetsCreated: totalPacketsCreated,
                      atomicUnitsCreated: totalAtomicUnitsCreated,
                      packetMassLinksCreated: totalPacketMassLinksCreated,
                    });
                    await context.jobRepository.save(job);
                    this.markJobActivity(job.id);
                    if (settled) {
                      return;
                    }
                    if (context.broadcaster) {
                      context.broadcaster.broadcastJobUpdate(job);
                    }

                    // Check if we should save checkpoint
                    const now = Date.now();
                    const timeSinceCheckpoint = now - lastCheckpointTime;

                    if (
                      conversationsSinceCheckpoint >= CHECKPOINT_INTERVAL_CONVERSATIONS ||
                      timeSinceCheckpoint >= CHECKPOINT_INTERVAL_MS
                    ) {
                      await this.saveCheckpoint(
                        job,
                        context,
                        {
                          phase: 'materialize',
                          fileIndex,
                          conversationsProcessed: totalConversationsProcessed,
                          messagesProcessed: totalMessagesProcessed,
                          lastBatchIndex: currentBatchIndex,
                          lastSaveTime: now,
                          uploadHash,
                        },
                        changeTracker
                      );

                      lastCheckpointTime = now;
                      conversationsSinceCheckpoint = 0;
                      console.log(
                        `[ImportWorker] 💾 Checkpoint saved: ${totalConversationsProcessed} conversations`
                      );
                    }
                  } catch (err) {
                    stopHeartbeat();
                    console.error('Batch Import Error:', err);
                    finishReject(err);
                  }
                }
              } else if (message.type === 'error') {
                const workerErrorMessage = normalizeErrorMessage(message.data);
                if (isMalformedInputMessage(workerErrorMessage)) {
                  finishReject(toImportInvalidInputError(workerErrorMessage));
                } else {
                  finishReject(new Error(workerErrorMessage));
                }
              } else if (message.type === 'done') {
                finishResolve();
              }
            } catch (error) {
              finishReject(error);
            }
          };

          // Process worker messages in strict arrival order.
          // Without this queue, a fast "done" message can settle the job while
          // batch import work is still in-flight, causing premature success states.
          let messageChain: Promise<void> = Promise.resolve();
          const onMessageQueued = (message: any) => {
            if (settled) {
              return;
            }
            if (message?.type === 'progress') {
              void reportWorkerProgress(message).catch((error) => {
                finishReject(error);
              });
              return;
            }
            messageChain = messageChain
              .then(() => onMessage(message))
              .catch((error) => {
                finishReject(error);
              });
          };

          const onError = (error: Error) => {
            finishReject(error);
          };

          const onExit = (code: number) => {
            if (settled) {
              return;
            }

            if (code !== 0) {
              finishReject(new Error(`Worker stopped with exit code ${code}`));
              return;
            }

            // Some worker runtimes can terminate cleanly without emitting a final "done" message.
            // Resolve after in-flight queued messages have drained to avoid hanging at the end.
            void messageChain
              .then(() => {
                if (!settled) {
                  finishResolve();
                }
              })
              .catch((error) => {
                finishReject(error);
              });
          };

          const abortHandler = async () => {
            if (settled) {
              return;
            }

            try {
              await this.saveCheckpoint(
                job,
                context,
                {
                  phase: 'parse',
                  fileIndex,
                  conversationsProcessed: totalConversationsProcessed,
                  messagesProcessed: totalMessagesProcessed,
                  lastBatchIndex: currentBatchIndex,
                  lastSaveTime: Date.now(),
                  uploadHash,
                },
                changeTracker
              );
            } finally {
              try {
                worker.postMessage('cancel');
              } catch {
                // ignore postMessage errors during teardown
              }
              finishReject(new Error('CANCELED'));
            }
          };

          worker.on('message', onMessageQueued);
          worker.on('error', onError);
          worker.on('exit', onExit);
          context.signal.addEventListener('abort', abortHandler);
        });

        // Reset batch tracking for next file
        startBatchIndex = 0;
      }

      const parseErrorRate = parseAttemptCount > 0 ? parseErrorCount / parseAttemptCount : 0;
      const groupingDiagnostics = {
        eligibleMessages: totalGroupingEligibleMessages,
        assignedMessages: totalGroupingAssignedMessages,
        unmatchedMessages: totalGroupingUnmatchedMessages,
        duplicateAssignments: totalGroupingDuplicateAssignments,
        nonCatchAllGroupCount: totalGroupingNonCatchAllGroups,
        topLabels: Array.from(groupingTopLabels).slice(0, 12),
      };
      const writeQueueDiagnostics = {
        sqlVariableSplitRetries: totalSqlVariableSplitRetries,
        deferredForeignKeyEdges: totalDeferredForeignKeyEdges,
        fkRequeueEscalations: totalFkRequeueEscalations,
        lastSqlVariableSplit: lastSqlVariableSplit || null,
      };
      const parseQualityFailure = evaluateParseQualityGate({
        parseAttemptCount,
        parseErrorCount,
        conversationsProcessed: totalConversationsProcessed,
        parseErrorSamples,
      });

      if (parseQualityFailure) {
        return {
          success: false,
          error: parseQualityFailure,
          metadata: {
            uploadHash,
            changeTracker: serializeChangeTracker(changeTracker),
            groupingDiagnostics,
            writeQueueDiagnostics,
            parseErrors: {
              count: parseErrorCount,
              attempts: parseAttemptCount,
              errorRate: parseErrorRate,
              samples: parseErrorSamples,
              hasMore: parseErrorCount > MAX_PARSE_ERROR_SAMPLES,
            },
          },
        };
      }

      // Step 3: Complete - save final checkpoint
      const finalCheckpoint: ImportCheckpoint = {
        phase: 'complete',
        fileIndex: files.length - 1,
        conversationsProcessed: totalConversationsProcessed,
        messagesProcessed: totalMessagesProcessed,
        lastBatchIndex: 0,
        lastSaveTime: Date.now(),
        uploadHash,
      };

      await this.saveCheckpoint(job, context, finalCheckpoint, changeTracker);

      const importGraphBirth = this.buildImportGraphBirthMetadata({
        packetMassLinksCreated: totalPacketMassLinksCreated,
        packetsCreated: totalPacketsCreated,
        atomicUnitsCreated: totalAtomicUnitsCreated,
        manualGroups: totalManualGroups,
        autoGroups: totalAutoGroups,
        sourcesCreated: totalSourcesCreated,
      });
      const graphMaterialization = await this.collectGraphMaterializationSummary(
        dbClient,
        job.accountId,
        uploadHash,
        {
          sources: totalSourcesCreated,
          groups: totalManualGroups + totalAutoGroups,
        }
      );
      const graphInvariant = evaluateGraphMaterializationInvariant(graphMaterialization);
      const importTimeline = [
        {
          event: graphInvariant.passed
            ? 'hierarchy_materialized'
            : 'hierarchy_materialization_failed',
          timestamp: Date.now(),
          summary: graphMaterialization,
        },
      ];
      if (!graphInvariant.passed) {
        return {
          success: false,
          error: {
            code: 'GRAPH_MATERIALIZATION_FAILED',
            message: graphInvariant.message,
            details: {
              graphMaterialization,
            },
          },
          metadata: {
            uploadHash,
            conversations: totalConversationsProcessed,
            messages: totalMessagesProcessed,
            checkpoint: finalCheckpoint,
            changeTracker: serializeChangeTracker(changeTracker),
            importGraphBirth,
            graphMaterialization,
            importTimeline,
            groupingDiagnostics,
            writeQueueDiagnostics,
            parseErrors: {
              count: parseErrorCount,
              attempts: parseAttemptCount,
              errorRate: parseErrorRate,
              samples: parseErrorSamples,
              hasMore: parseErrorCount > MAX_PARSE_ERROR_SAMPLES,
            },
          },
        };
      }

      const graphBirthMetadata: ImportGraphBirthMetadata = importGraphBirth;
      const existingMetadata = (job.state.metadata || {}) as Record<string, unknown>;
      const existingTimeline = Array.isArray(existingMetadata.importTimeline)
        ? (existingMetadata.importTimeline as unknown[])
        : [];
      job.updateStateMetadata({
        importGraphBirth: graphBirthMetadata,
        graphMaterialization,
        importTimeline: [...existingTimeline, ...importTimeline],
        groupingDiagnostics,
        writeQueueDiagnostics,
      });
      await context.jobRepository.save(job);
      if (context.broadcaster) {
        context.broadcaster.broadcastJobUpdate(job);
      }

      await this.reportProgress(
        job,
        100,
        100,
        IMPORT_STAGE_LABELS[ImportJobStage.SUCCEEDED],
        context,
        ImportJobStage.SUCCEEDED
      );

      // Log parse error summary if any occurred
      if (parseErrorCount > 0 && shouldLogParseItemErrors()) {
        console.warn(`[ImportWorker] Completed with ${parseErrorCount} parse error(s)`);
      }

      return {
        success: true,
        metadata: {
          uploadHash,
          conversations: totalConversationsProcessed,
          messages: totalMessagesProcessed,
          checkpoint: finalCheckpoint,
          changeTracker: serializeChangeTracker(changeTracker),
          importGraphBirth: graphBirthMetadata,
          graphMaterialization,
          importTimeline,
          groupingDiagnostics,
          writeQueueDiagnostics,
          parseErrors: {
            count: parseErrorCount,
            attempts: parseAttemptCount,
            errorRate: parseErrorRate,
            samples: parseErrorSamples,
            hasMore: parseErrorCount > MAX_PARSE_ERROR_SAMPLES,
          },
        },
      };
    } catch (error: any) {
      if (error.message === 'CANCELED') {
        return {
          success: false,
          error: { code: 'CANCELED', message: 'Job was canceled' },
          metadata: { changeTracker: serializeChangeTracker(changeTracker) },
        };
      }

      if (error?.code === 'SCHEMA_MISMATCH') {
        return {
          success: false,
          error: {
            code: 'SCHEMA_MISMATCH',
            message:
              error.message ||
              'Database schema is not compatible with the import pipeline. Database migration required; restart into a fixed build.',
            details: error.details,
          },
          metadata: { changeTracker: serializeChangeTracker(changeTracker) },
        };
      }

      if (error?.code === 'WRITE_QUEUE_FAILURE') {
        return {
          success: false,
          error: {
            code: 'WRITE_QUEUE_FAILURE',
            message:
              error.message ||
              'Import failed due to write queue integrity errors (dead-letter or circuit-breaker).',
            details: error.details,
          },
          metadata: { changeTracker: serializeChangeTracker(changeTracker) },
        };
      }

      if (
        error?.code === 'GROUPING_INTEGRITY_FAILED' ||
        error?.code === 'GROUPING_QUALITY_FAILED'
      ) {
        return {
          success: false,
          error: {
            code: error.code,
            message: error.message || 'Import failed due to grouping validation',
            details: error.details,
          },
          metadata: { changeTracker: serializeChangeTracker(changeTracker) },
        };
      }

      const rawErrorMessage = normalizeErrorMessage(error?.message ?? error);
      if (error?.code === 'IMPORT_INVALID_INPUT' || isMalformedInputMessage(rawErrorMessage)) {
        if (shouldLogInvalidInputRejection()) {
          console.warn(`[ImportWorker] Import rejected for job ${job.id}: ${rawErrorMessage}`);
        }
        return {
          success: false,
          error: {
            code: 'IMPORT_INVALID_INPUT',
            message: rawErrorMessage,
          },
          metadata: { changeTracker: serializeChangeTracker(changeTracker) },
        };
      }

      console.error(`❌ Import worker failed for job ${job.id}:`, error);
      return {
        success: false,
        error: {
          code: error.code || 'IMPORT_FAILED',
          message: error.message || 'Import failed',
          stack: error.stack,
          details: error.details,
        },
        metadata: {
          changeTracker: serializeChangeTracker(changeTracker),
        },
      };
    }
  }

  private buildImportGraphBirthMetadata(input: {
    packetMassLinksCreated: number;
    packetsCreated: number;
    atomicUnitsCreated: number;
    manualGroups: number;
    autoGroups: number;
    sourcesCreated: number;
  }): Omit<ImportGraphBirthMetadata, 'objectiveBuildTaskId'> {
    const weightedMassTotal = Math.max(0, input.packetMassLinksCreated);
    const weightedMassMean =
      input.packetsCreated > 0 ? weightedMassTotal / input.packetsCreated : 0;
    const edgeStrengthMean =
      input.packetMassLinksCreated > 0 ? weightedMassTotal / input.packetMassLinksCreated : 0;
    const groups = Math.max(0, input.manualGroups + input.autoGroups);

    return {
      massStats: {
        atomicCount: Math.max(0, input.atomicUnitsCreated),
        packetCount: Math.max(0, input.packetsCreated),
        weightedMassTotal,
        weightedMassMean,
        weightedMassP95: weightedMassMean,
      },
      clusterCounts: {
        groups,
        subgroups: 0,
        isolated: Math.max(0, input.sourcesCreated - groups),
      },
      edgeStrengthStats: {
        count: Math.max(0, input.packetMassLinksCreated),
        mean: edgeStrengthMean,
        p50: edgeStrengthMean,
        p95: edgeStrengthMean,
        max: edgeStrengthMean,
      },
    };
  }

  private async collectGraphMaterializationSummary(
    dbClient: DatabaseClient,
    accountId: string,
    uploadHash: string,
    createdInJob: { sources: number; groups: number }
  ): Promise<GraphMaterializationSummary> {
    const row = (
      await dbClient.execute(
        `
          SELECT
            (SELECT COUNT(*) FROM nodes WHERE account_id = @accountId AND kind = 'AccountNode') AS account_nodes,
            (SELECT COUNT(*) FROM nodes WHERE account_id = @accountId AND kind = 'Principal') AS principal_nodes,
            (SELECT COUNT(*) FROM nodes WHERE account_id = @accountId AND kind = 'Source') AS source_nodes,
            (SELECT COUNT(*) FROM nodes WHERE account_id = @accountId AND kind = 'Group') AS group_nodes,
            (
              SELECT COUNT(*)
              FROM edges e
              JOIN nodes src ON src.id = e.from_id AND src.account_id = e.account_id
              JOIN nodes dst ON dst.id = e.to_id AND dst.account_id = e.account_id
              WHERE e.account_id = @accountId
                AND e.kind = 'CONTAINS'
                AND src.kind = 'AccountNode'
                AND dst.kind = 'Principal'
            ) AS account_principal_edges,
            (
              SELECT COUNT(*)
              FROM edges e
              JOIN nodes src ON src.id = e.from_id AND src.account_id = e.account_id
              JOIN nodes dst ON dst.id = e.to_id AND dst.account_id = e.account_id
              WHERE e.account_id = @accountId
                AND e.kind = 'CREATED_BY'
                AND src.kind = 'Source'
                AND dst.kind = 'Principal'
            ) AS source_principal_edges,
            (
              SELECT COUNT(*)
              FROM edges e
              JOIN nodes src ON src.id = e.from_id AND src.account_id = e.account_id
              JOIN nodes dst ON dst.id = e.to_id AND dst.account_id = e.account_id
              WHERE e.account_id = @accountId
                AND e.kind = 'IN_GROUP'
                AND src.kind = 'Source'
                AND dst.kind = 'Group'
            ) AS source_group_edges
        `,
        { accountId }
      )
    )?.records?.[0] as
      | {
          account_nodes?: number;
          principal_nodes?: number;
          source_nodes?: number;
          group_nodes?: number;
          account_principal_edges?: number;
          source_principal_edges?: number;
          source_group_edges?: number;
        }
      | undefined;

    const summary: GraphMaterializationSummary = {
      accountId,
      uploadHash,
      counts: {
        accountNodes: Number(row?.account_nodes ?? 0),
        principals: Number(row?.principal_nodes ?? 0),
        sources: Number(row?.source_nodes ?? 0),
        groups: Number(row?.group_nodes ?? 0),
      },
      links: {
        accountPrincipal: Number(row?.account_principal_edges ?? 0),
        sourcePrincipal: Number(row?.source_principal_edges ?? 0),
        sourceGroup: Number(row?.source_group_edges ?? 0),
      },
      createdInJob: {
        sources: Math.max(0, createdInJob.sources),
        groups: Math.max(0, createdInJob.groups),
      },
      passed: false,
      missing: [],
    };

    const invariant = evaluateGraphMaterializationInvariant(summary);
    summary.passed = invariant.passed;
    summary.missing = invariant.missing;
    return summary;
  }

  private resolveJobAccountClass(job: Job): 'free' | 'professional' | 'business' {
    const tenancy = (job.config?.tenancy || {}) as Record<string, unknown>;
    const raw = String(tenancy.accountClass || '').toLowerCase();
    if (raw === 'business' || raw === 'professional') {
      return raw;
    }
    return 'free';
  }

  /**
   * Load job state_data for checkpoint recovery
   */
  private async loadJobStateData(job: Job, context: WorkerContext): Promise<any | null> {
    try {
      const jobRepository = context.jobRepository as JobRepository;
      return await jobRepository.getRawStateData(job.id, job.accountId);
    } catch (error: any) {
      console.warn(`[ImportWorker] Could not load state_data for checkpoint: ${error.message}`);
      return null;
    }
  }

  /**
   * Save checkpoint to job state_data
   * Enables resume after pause or crash
   */
  private async saveCheckpoint(
    job: Job,
    context: WorkerContext,
    checkpoint: ImportCheckpoint,
    changeTracker: ChangeTracker
  ): Promise<void> {
    try {
      this.markJobActivity(job.id);
      const jobRepository = context.jobRepository as JobRepository;

      // Load current state_data and merge checkpoint
      const currentStateData = (await jobRepository.getRawStateData(job.id, job.accountId)) || {};
      const currentProgress = (currentStateData.progress || {}) as {
        current?: number;
        total?: number;
        percent?: number;
        message?: string;
        stage?: ImportJobStage | string;
        metadata?: Record<string, unknown>;
      };
      const latestJobProgress = job.progress;

      const currentProgressPercent = asNumber(currentProgress.percent) ?? 0;
      const latestJobProgressPercent = asNumber(latestJobProgress.percent) ?? 0;
      const mergedProgress =
        currentProgressPercent > latestJobProgressPercent
          ? {
              current: currentProgress.current ?? latestJobProgress.current,
              total: currentProgress.total ?? latestJobProgress.total,
              percent: currentProgressPercent,
              message: currentProgress.message ?? latestJobProgress.message,
              stage:
                (currentProgress.stage as ImportJobStage | undefined) ?? latestJobProgress.stage,
              metadata: currentProgress.metadata ?? latestJobProgress.metadata,
            }
          : latestJobProgress;

      const currentStats = (currentStateData.stats || {}) as Record<string, unknown>;
      const latestJobStats = job.stats as Record<string, unknown>;
      const numericStatKeys = new Set([
        ...Object.keys(currentStats),
        ...Object.keys(latestJobStats),
        'conversationsProcessed',
        'messagesProcessed',
      ]);
      const mergedStats: Record<string, unknown> = { ...currentStats, ...latestJobStats };
      for (const key of numericStatKeys) {
        const existingValue = asNumber(currentStats[key]);
        const latestValue = asNumber(latestJobStats[key]);
        const checkpointValue =
          key === 'conversationsProcessed'
            ? checkpoint.conversationsProcessed
            : key === 'messagesProcessed'
              ? checkpoint.messagesProcessed
              : null;
        const candidates = [existingValue, latestValue, checkpointValue].filter(
          (value): value is number => Number.isFinite(value as number)
        );
        if (candidates.length > 0) {
          mergedStats[key] = Math.max(...candidates);
        }
      }

      const updatedStateData = {
        ...currentStateData,
        progress: mergedProgress,
        stats: mergedStats,
        checkpoint,
        changeTracker: serializeChangeTracker(changeTracker),
      };

      await jobRepository.updateStateData(job.id, job.accountId, JSON.stringify(updatedStateData));
      this.markJobActivity(job.id);
    } catch (error: any) {
      console.error(`[ImportWorker] Failed to save checkpoint: ${error.message}`);
      // Don't throw - checkpoint save failure shouldn't stop the import
    }
  }

  // Removed parseFile as it is now handled by the worker
}
