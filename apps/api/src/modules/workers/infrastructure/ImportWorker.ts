/**
 * Import Worker
 *
 * Processes import jobs using the existing EnhancedImportServiceV2.
 * Wraps the synchronous import logic in a background job.
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
import { EnhancedImportServiceV2, ImportConversation } from '../../../services/import-enhanced-v2';
import { DatabaseWriteQueue } from '../../../services/DatabaseWriteQueue';
import { ImportConfiguration, ImportJobStage, IMPORT_STAGE_LABELS } from '@keimenon/types';
import { ParserRegistry, NormalizedConversation, NormalizedMessage } from '@keimenon/parsers';
import * as fs from 'fs/promises';
import { nanoid } from 'nanoid';
import {
  ChangeTracker,
  createChangeTracker,
  trackNodesCreated,
  trackEdgesCreated,
  serializeChangeTracker,
} from '../../jobs/domain/ChangeTracker';
import { JobRepository } from '../../jobs/infrastructure/JobRepository';
import { WORKER_CONFIG } from '../../jobs/jobs.config';

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

// Shared parser registry instance
const parserRegistry = new ParserRegistry();

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

    // Wrap execution in timeout promise race
    return Promise.race([
      this.executeWithCheckpoints(job, context),
      this.createTimeoutPromise(job, adaptiveTimeout),
    ]);
  }

  /**
   * Calculate timeout based on import size
   *
   * Formula:
   * - Base: 2 minutes
   * - Per 100 messages (estimated from file size): +1 minute
   * - Spine extraction enabled: +50% multiplier
   * - Max: 60 minutes
   */
  private calculateAdaptiveTimeout(job: Job): number {
    const files = job.config.files || [];

    // Estimate message count from file size (~1KB per message average)
    const estimatedMessages = files.reduce((sum, f) => {
      return sum + Math.ceil((f.fileSize || 0) / 1024);
    }, 0);

    const { baseMs, perHundredMsgsMs, spineMultiplier, maxMs } =
      WORKER_CONFIG.import.adaptiveTimeout;

    const importOptions = job.config.importOptions as Record<string, unknown> | undefined;
    const metadata = job.config.metadata as Record<string, unknown> | undefined;
    const spineEnabled =
      metadata?.spineEnabled === true ||
      ((importOptions?.spine as Record<string, unknown> | undefined)?.enabled ?? false) === true;

    const calculated =
      (baseMs + Math.ceil(estimatedMessages / 100) * perHundredMsgsMs) *
      (spineEnabled ? spineMultiplier : 1);

    return Math.min(Math.max(this.timeoutMs, calculated), maxMs);
  }

  /**
   * Create timeout promise that rejects after specified duration
   */
  private createTimeoutPromise(job: Job, timeoutMs?: number): Promise<WorkerResult> {
    const timeout = timeoutMs ?? this.timeoutMs;
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Import job ${job.id} exceeded timeout of ${timeout}ms (${Math.round(timeout / 1000)}s). ` +
              `Estimated size may have been too optimistic. Consider disabling spine extraction for very large imports.`
          )
        );
      }, timeout);
    });
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

    // ✅ Initialize change tracker for rollback support
    const changeTracker: ChangeTracker = createChangeTracker();

    console.log(`📥 Import worker processing ${files.length} file(s) for job ${job.id}`);
    console.log(`⏱️  Timeout: ${Math.round(this.timeoutMs / 1000)}s`);

    try {
      // Step 1: Initialize Import Service early (we need it for batch processing)
      // Get correct database client (test DB for E2E tests, production DB otherwise)
      const dbClient = await this.getDbClientForJob(job);
      console.log(`[ImportWorker] 🔌 DB Client Path: ${(dbClient as any).name}`);
      console.log(`[ImportWorker] 🔌 DB Connection: ${(dbClient as any).open ? 'OPEN' : 'CLOSED'}`);

      // In test mode, disable write queue to avoid database client mismatch
      const isTestMode = !!job.config.testContext?.dbPath;
      const writeQueue = isTestMode ? undefined : this.writeQueue;

      const importService = new EnhancedImportServiceV2(dbClient, writeQueue);

      // Step 1b: Check for existing checkpoint (resume scenario)
      let checkpoint: ImportCheckpoint | null = null;
      let uploadHash: string;
      let totalConversationsProcessed = 0;
      let totalMessagesProcessed = 0;
      let startFileIndex = 0;
      let startBatchIndex = 0;

      // Try to load existing checkpoint from job state_data
      const stateData = await this.loadJobStateData(job, context);
      if (stateData?.checkpoint && stateData.checkpoint.phase !== 'complete') {
        checkpoint = stateData.checkpoint as ImportCheckpoint;
        uploadHash = checkpoint.uploadHash;
        totalConversationsProcessed = checkpoint.conversationsProcessed;
        totalMessagesProcessed = checkpoint.messagesProcessed;
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

      // Build config
      const config: ImportConfiguration = this.buildImportConfig(importOptions);

      // Track last checkpoint save time
      let lastCheckpointTime = Date.now();
      let conversationsSinceCheckpoint = 0;

      // Track parse errors for reporting (Gap 5 fix)
      let parseErrorCount = 0;
      const parseErrorSamples: Array<{ index: number; message: string }> = [];
      const MAX_PARSE_ERROR_SAMPLES = 10; // Limit to prevent memory issues

      const { Worker } = await import('worker_threads');
      const path = await import('path');

      // Step 2: Process Files Sequentially via Worker Thread
      for (let fileIndex = startFileIndex; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex];
        let currentBatchIndex = 0;

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
          Math.round((fileIndex / files.length) * 10), // First 10% is "starting"
          100,
          `${IMPORT_STAGE_LABELS[ImportJobStage.PARSE]} (${fileIndex + 1}/${files.length})`,
          context
        );

        // Calculate conversations to skip for resume optimization
        // Worker will skip these internally to reduce IPC overhead
        const batchSize = 50;
        const skipConversations = skipBatches * batchSize;

        console.log(
          `[ImportWorker] Spawning worker for: ${file.fileName}${skipConversations > 0 ? ` (resuming, skipping ~${skipConversations} conversations)` : ''}`
        );

        // Spawn Worker
        const actualWorkerPath = __filename.endsWith('.ts')
          ? path.join(__dirname, 'import.worker.ts')
          : path.join(__dirname, 'import.worker.js');

        const worker = new Worker(actualWorkerPath, {
          workerData: {
            filePath: file.filePath,
            fileSize: file.fileSize,
            mimeType: file.mimeType,
            batchSize,
            skipConversations, // Resume optimization: worker skips these internally
          },
        });

        // Worker Promise
        await new Promise<void>((resolve, reject) => {
          worker.on('message', async (message: any) => {
            if (message.type === 'progress') {
              // Map worker progress (0-100 of file) to overall Job Progress (10-90)
              const fileProgress = message.data.percent;
              const overallProgress = 10 + Math.round(fileProgress * 0.8); // Map 0-100 to 10-90

              await this.reportProgress(
                job,
                overallProgress,
                100,
                `Processing ${file.fileName}: ${message.data.message}`,
                context
              );
            } else if (message.type === 'batch') {
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
                    try {
                      // ParserRegistry auto-detects format (ChatGPT/Claude/Gemini)
                      const parseResult = await parserRegistry.parse(item.raw, file.fileName);

                      // Convert each parsed conversation to ImportConversation format
                      for (const normalized of parseResult.conversations) {
                        parsedConversations.push(
                          normalizedToImportConversation(normalized, file.fileName)
                        );
                      }
                    } catch (parseError: any) {
                      parseErrorCount++;
                      const errorMessage = parseError.message || 'Unknown parse error';
                      console.warn(
                        `[ImportWorker] Parse error for item ${item.index}: ${errorMessage}`
                      );

                      // Track sample errors for reporting (limit to prevent memory issues)
                      if (parseErrorSamples.length < MAX_PARSE_ERROR_SAMPLES) {
                        parseErrorSamples.push({ index: item.index, message: errorMessage });
                      }
                      // Continue with next item - don't fail entire batch
                    }
                  }

                  if (parsedConversations.length === 0) {
                    // No conversations parsed - skip this batch
                    return;
                  }

                  const result = await importService.import(
                    parsedConversations,
                    uploadHash,
                    config,
                    {
                      accountId: job.accountId,
                      userId: job.createdBy,
                    }
                  );
                  totalConversationsProcessed += result.conversations;
                  totalMessagesProcessed += result.messages;
                  totalMessagesProcessed += result.messages;
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
                  console.error('Batch Import Error:', err);
                  reject(err);
                }
              }
            } else if (message.type === 'error') {
              reject(new Error(message.data));
            } else if (message.type === 'done') {
              resolve();
            }
          });

          worker.on('error', reject);
          worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
          });

          // Handle Cancellation/Pause from Parent
          // Use { once: true } to auto-cleanup listener after first trigger
          const abortHandler = async () => {
            // Save checkpoint before stopping
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

            worker.postMessage('cancel');
            reject(new Error('CANCELED'));
          };
          context.signal.addEventListener('abort', abortHandler, { once: true });
        });

        // Reset batch tracking for next file
        startBatchIndex = 0;
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

      await this.reportProgress(
        job,
        100,
        100,
        IMPORT_STAGE_LABELS[ImportJobStage.SUCCEEDED],
        context
      );

      // Log parse error summary if any occurred
      if (parseErrorCount > 0) {
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
          // Parse error reporting (Gap 5 fix)
          parseErrors: {
            count: parseErrorCount,
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

      console.error(`❌ Import worker failed for job ${job.id}:`, error);
      return {
        success: false,
        error: {
          code: 'IMPORT_FAILED',
          message: error.message || 'Import failed',
          stack: error.stack,
        },
        metadata: {
          changeTracker: serializeChangeTracker(changeTracker),
        },
      };
    }
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
      const jobRepository = context.jobRepository as JobRepository;

      // Load current state_data and merge checkpoint
      const currentStateData = (await jobRepository.getRawStateData(job.id, job.accountId)) || {};
      const updatedStateData = {
        ...currentStateData,
        checkpoint,
        changeTracker: serializeChangeTracker(changeTracker),
      };

      await jobRepository.updateStateData(job.id, job.accountId, JSON.stringify(updatedStateData));
    } catch (error: any) {
      console.error(`[ImportWorker] Failed to save checkpoint: ${error.message}`);
      // Don't throw - checkpoint save failure shouldn't stop the import
    }
  }

  // Removed parseFile as it is now handled by the worker

  /**
   * Build import configuration from job options
   * Maps the complete configuration from UI to ImportConfiguration schema
   */
  private buildImportConfig(options: any): ImportConfiguration {
    // Extract extraction settings (which roles to include)
    const extraction = options.extraction || { includeUser: true, includeAssistant: false };
    const includeUser = extraction.includeUser ?? true;
    const includeAssistant = extraction.includeAssistant ?? false;

    // Extract processing mode
    const processingMode = options.processingMode || 'automatic';
    const isManualMode = processingMode === 'manual';

    // Extract duplicate detection config
    const dupeConfig = options.duplicateDetection || {};
    const dupeEnabled = dupeConfig.enabled ?? true;

    // Extract code settings
    const codeSettings = options.codeSettings || {};
    const minMessageLength = options.minMessageLength ?? 400;

    // Support legacy fields for backward compatibility
    const targetGroupCount = options.targetGroupCount ?? 25;
    const codeMinChars = options.codeMinChars;
    const legacyDupeThreshold = options.duplicateThreshold;

    return {
      sources: {
        scope: 'message',
        roleFilter: {
          user: includeUser,
          ai: includeAssistant,
          separate: includeUser && includeAssistant, // Only separate if both enabled
        },
        // FIX: Use minMessageLength instead of codeMinChars
        minLengthUser: minMessageLength,
        minLengthAI: minMessageLength,
        bundling: {
          enabled: false, // TODO: Make this configurable in future
          method: 'keyword',
          similarityThreshold: 0.75,
        },
      },
      grouping: {
        mode: isManualMode ? 'manual' : 'auto',
        auto: !isManualMode
          ? {
              targetGroupCount: targetGroupCount,
              createCatchAll: true,
              minGroupSize: 2,
              algorithm: 'tfidf',
            }
          : undefined,
        manual: isManualMode ? options.groups || [] : [],
      },
      code: {
        extract: options.extractCode ?? true,
        removeFromSource: true,
        createEdges: true,
        // Use codeSettings.minLength if available, fallback to legacy codeMinChars, then default
        minLength: codeSettings.minLength ?? codeMinChars ?? 50,
        deduplicate: codeSettings.deduplicate ?? true,
      },
      duplicates: {
        // FIX: Respect user's enabled preference
        enabled: dupeEnabled,
        level: dupeConfig.level || 'both', // Default to 'both' (message + conversation)
        detectExact: dupeConfig.exactMatch ?? true,
        detectNear: true,
        // Use new threshold if available, fallback to legacy field
        nearThreshold: dupeConfig.similarityThreshold ?? legacyDupeThreshold ?? 0.85,
        detectSemantic: false, // Future: Premium feature
        semanticThreshold: 0.9,
        createReviewFolders: dupeConfig.requireReview ?? true,
        autoMergeSuggestions: dupeConfig.autoApproveExact ?? false,
      },
      privacy: {
        storageMode: 'local',
        allowExternalAPIs: false,
        apiKey: null,
      },
    };
  }
}
