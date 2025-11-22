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
import { DatabaseClient } from '@canvas-memory/db';
import { EnhancedImportServiceV2, ImportConversation } from '../../../services/import-enhanced-v2';
import { DatabaseWriteQueue } from '../../../services/DatabaseWriteQueue';
import { ImportConfiguration } from '@canvas-memory/types';
import { ParserRegistry } from '@canvas-memory/parsers';
import { ImportJobStage, IMPORT_STAGE_LABELS } from '@canvas-memory/types/src/import-job-stages';
import * as fs from 'fs/promises';
import {
  ChangeTracker,
  createChangeTracker,
  trackNodesCreated,
  trackEdgesCreated,
  serializeChangeTracker,
} from '../../jobs/domain/ChangeTracker';

export class ImportWorker extends BaseWorker {
  readonly type = 'import' as const;
  private timeoutMs: number;

  constructor(
    private db: DatabaseClient,
    private writeQueue?: DatabaseWriteQueue,
    timeoutMs?: number
  ) {
    super();
    // Default 10 minutes, configurable via env var
    this.timeoutMs = timeoutMs || parseInt(process.env.IMPORT_WORKER_TIMEOUT_MS || '600000');
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
    // Wrap execution in timeout promise race
    return Promise.race([
      this.executeWithCheckpoints(job, context),
      this.createTimeoutPromise(job),
    ]);
  }

  /**
   * Create timeout promise that rejects after configured duration
   */
  private createTimeoutPromise(job: Job): Promise<WorkerResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Import job ${job.id} exceeded timeout of ${this.timeoutMs}ms (${Math.round(this.timeoutMs / 1000)}s). ` +
              `Consider increasing IMPORT_WORKER_TIMEOUT_MS for large imports.`
          )
        );
      }, this.timeoutMs);
    });
  }

  /**
   * Execute import with checkpoint tracking for resume capability
   */
  private async executeWithCheckpoints(job: Job, context: WorkerContext): Promise<WorkerResult> {
    const files = job.config.files || [];
    const importOptions = job.config.importOptions || {};
    let allConversations: ImportConversation[] = []; // Declare at function scope for error handling

    // ✅ Initialize change tracker for rollback support
    let changeTracker: ChangeTracker = createChangeTracker();

    console.log(`📥 Import worker processing ${files.length} file(s) for job ${job.id}`);
    console.log(`⏱️  Timeout: ${Math.round(this.timeoutMs / 1000)}s`);

    try {
      // Step 1: Load and parse files (PARSE stage)
      await this.reportProgress(job, 0, 100, IMPORT_STAGE_LABELS[ImportJobStage.PARSE], context);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (this.shouldCancel(context.signal)) {
          return {
            success: false,
            error: {
              code: 'CANCELED',
              message: 'Job was canceled during file loading',
            },
          };
        }

        await this.reportProgress(
          job,
          Math.round((i / files.length) * 30),
          100,
          `${IMPORT_STAGE_LABELS[ImportJobStage.PARSE]} (${i + 1}/${files.length})`,
          context
        );

        // Parse file based on mime type
        console.log(
          `[ImportWorker] Parsing file: ${file.fileName}, size: ${file.fileSize}, mime: ${file.mimeType}`
        );
        const conversations = await this.parseFile(file);
        console.log(
          `[ImportWorker] Parsed ${conversations.length} conversations from ${file.fileName}`
        );
        allConversations.push(...conversations);
      }
      console.log(
        `[ImportWorker] Total conversations after parsing all files: ${allConversations.length}`
      );

      // Step 2: Build import configuration
      const config: ImportConfiguration = this.buildImportConfig(importOptions);

      // Step 3: Run import pipeline (MATERIALIZE stage)
      await this.reportProgress(
        job,
        30,
        100,
        IMPORT_STAGE_LABELS[ImportJobStage.MATERIALIZE],
        context
      );

      // Get correct database client (test DB for E2E tests, production DB otherwise)
      const dbClient = await this.getDbClientForJob(job);

      // In test mode, disable write queue to avoid database client mismatch
      // (writeQueue uses production DB client, but job needs test DB client)
      const isTestMode = !!job.config.testContext?.dbPath;
      const writeQueue = isTestMode ? undefined : this.writeQueue;

      const importService = new EnhancedImportServiceV2(dbClient, writeQueue);

      // Generate upload hash
      const uploadHash = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      const result = await importService.import(allConversations, uploadHash, config, {
        accountId: job.accountId,
        userId: job.createdBy,
      });

      if (this.shouldCancel(context.signal)) {
        return {
          success: false,
          error: {
            code: 'CANCELED',
            message: 'Job was canceled during import',
          },
          metadata: {
            changeTracker: serializeChangeTracker(changeTracker), // ✅ Include for potential rollback
          },
        };
      }

      // ✅ Step 3.5: Track created nodes/edges for rollback support
      // Query nodes created by this import (identified by upload_hash in metadata)
      try {
        const createdNodesQuery = await dbClient.execute(
          `SELECT id FROM nodes
           WHERE account_id = ?
           AND json_extract(properties, '$.metadata.uploadHash') = ?`,
          [job.accountId, uploadHash]
        );

        const createdNodeIds = createdNodesQuery.records.map((r: any) => r.id);
        if (createdNodeIds.length > 0) {
          changeTracker = trackNodesCreated(changeTracker, createdNodeIds);
          console.log(`[ImportWorker] Tracked ${createdNodeIds.length} created nodes for rollback`);
        }

        // Query edges created by this import
        // Edges are connected to nodes with this uploadHash, so find edges between those nodes
        if (createdNodeIds.length > 0) {
          const createdEdgesQuery = await dbClient.execute(
            `SELECT DISTINCT e.id FROM edges e
             WHERE e.account_id = ?
             AND (e.from_id IN (${createdNodeIds.map(() => '?').join(',')})
                  OR e.to_id IN (${createdNodeIds.map(() => '?').join(',')}))`,
            [job.accountId, ...createdNodeIds, ...createdNodeIds]
          );

          const createdEdgeIds = createdEdgesQuery.records.map((r: any) => r.id);
          if (createdEdgeIds.length > 0) {
            changeTracker = trackEdgesCreated(changeTracker, createdEdgeIds);
            console.log(
              `[ImportWorker] Tracked ${createdEdgeIds.length} created edges for rollback`
            );
          }
        }
      } catch (trackingError: any) {
        console.warn(`[ImportWorker] Failed to track created entities:`, trackingError.message);
        // Non-fatal - continue with import success
      }

      // Step 4: Complete (SUCCEEDED stage)
      await this.reportProgress(
        job,
        100,
        100,
        IMPORT_STAGE_LABELS[ImportJobStage.SUCCEEDED],
        context
      );

      console.log(
        `✅ Import worker completed job ${job.id}: ${result.messages} messages, ${result.conversations} conversations`
      );

      return {
        success: true,
        metadata: {
          uploadHash: result.uploadHash,
          conversations: result.conversations,
          messages: result.messages,
          groups: result.groups.length,
          sources: result.sources,
          codeBlocks: result.codeBlocks,
          duplicatesForReview: result.duplicatesForReview,
          // Checkpoint data for resume capability
          checkpoint: {
            stage: 'SUCCEEDED',
            filesProcessed: files.length,
            totalFiles: files.length,
            completedAt: new Date().toISOString(),
          },
          // ✅ Change tracker for rollback support
          changeTracker: serializeChangeTracker(changeTracker),
        },
      };
    } catch (error: any) {
      console.error(`❌ Import worker failed for job ${job.id}:`, error);

      // Determine if this is a timeout error
      const isTimeout = error.message && error.message.includes('exceeded timeout');

      // Build enhanced error message with diagnostics
      let errorMessage = isTimeout
        ? `Import timed out after ${Math.round(this.timeoutMs / 1000)}s. ` +
          `Processed ${allConversations?.length || 0} conversations before timeout. ` +
          `Try: (1) Split large files, (2) Increase IMPORT_WORKER_TIMEOUT_MS, or (3) Reduce file size.`
        : error.message || 'Import failed';

      // Append diagnostic info for timeout errors
      if (isTimeout) {
        errorMessage += ` [Files: ${files.length}, Conversations parsed: ${allConversations?.length || 0}, Timeout: ${this.timeoutMs}ms]`;
      }

      return {
        success: false,
        error: {
          code: isTimeout ? 'TIMEOUT' : error.code || 'IMPORT_FAILED',
          message: errorMessage,
          stack: error.stack,
        },
        metadata: {
          changeTracker: serializeChangeTracker(changeTracker), // ✅ Include for potential rollback
        },
      };
    }
  }

  /**
   * Parse file into conversations
   */
  private async parseFile(file: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    filePath?: string;
  }): Promise<ImportConversation[]> {
    console.log(`📖 Parsing file: ${file.fileName}`);

    if (!file.filePath) {
      throw new Error('File path is required for parsing');
    }

    // Read file contents
    const fileContent = await fs.readFile(file.filePath, 'utf-8');

    // Parse JSON
    let data: unknown;
    try {
      data = JSON.parse(fileContent);
    } catch (error: any) {
      throw new Error(`Failed to parse JSON: ${error.message}`);
    }

    // Use ParserRegistry to detect platform and parse
    const registry = new ParserRegistry();
    const parseResult = await registry.parse(data, file.fileName);

    console.log(
      `✅ Parsed ${parseResult.conversations.length} conversations from ${file.fileName}`
    );
    console.log(`   Platform: ${parseResult.platform}`);
    console.log(`   Total messages: ${parseResult.stats.total_messages}`);

    // Convert to ImportConversation format
    const importConversations: ImportConversation[] = parseResult.conversations.map((conv) => {
      const messages: ImportConversation['messages'] = conv.messages.map((msg) => ({
        id: msg.metadata?.id || `${conv.conversation_id}_msg_${msg.index}`,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        conversationId: conv.conversation_id,
        index: msg.index,
        hash: msg.hash,
      }));

      return {
        id: conv.conversation_id,
        title: conv.title,
        platform: conv.platform,
        messages: messages,
        created_at: conv.created_at,
      };
    });

    return importConversations;
  }

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
