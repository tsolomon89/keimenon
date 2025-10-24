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
import * as fs from 'fs/promises';

export class ImportWorker extends BaseWorker {
  readonly type = 'import' as const;

  constructor(
    private db: DatabaseClient,
    private writeQueue?: DatabaseWriteQueue
  ) {
    super();
  }

  validate(job: Job): boolean {
    // Check required config
    if (!job.config.files || job.config.files.length === 0) {
      return false;
    }

    return true;
  }

  protected async execute(job: Job, context: WorkerContext): Promise<WorkerResult> {
    const files = job.config.files || [];
    const importOptions = job.config.importOptions || {};

    console.log(`📥 Import worker processing ${files.length} file(s) for job ${job.id}`);

    try {
      // Step 1: Load and parse files
      await this.reportProgress(job, 0, 100, 'Loading files...', context);

      const allConversations: ImportConversation[] = [];

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
          `Loading file ${i + 1}/${files.length}: ${file.fileName}`,
          context
        );

        // Parse file based on mime type
        const conversations = await this.parseFile(file);
        allConversations.push(...conversations);
      }

      // Step 2: Build import configuration
      const config: ImportConfiguration = this.buildImportConfig(importOptions);

      // Step 3: Run import pipeline
      await this.reportProgress(job, 30, 100, 'Running import pipeline...', context);

      const importService = new EnhancedImportServiceV2(this.db, this.writeQueue);

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
        };
      }

      // Step 4: Complete
      await this.reportProgress(job, 100, 100, 'Import complete', context);

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
        },
      };
    } catch (error: any) {
      console.error(`❌ Import worker failed for job ${job.id}:`, error);

      return {
        success: false,
        error: {
          code: error.code || 'IMPORT_FAILED',
          message: error.message || 'Import failed',
          stack: error.stack,
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
   */
  private buildImportConfig(options: any): ImportConfiguration {
    return {
      sources: {
        scope: 'message',
        roleFilter: {
          user: true,
          ai: true,
          separate: true,
        },
        minLengthUser: options.codeMinChars || 10,
        minLengthAI: options.codeMinChars || 10,
        bundling: {
          enabled: false,
          method: 'keyword',
          similarityThreshold: 0.75,
        },
      },
      grouping: {
        mode: 'auto',
        auto: {
          targetGroupCount: 25,
          createCatchAll: true,
          minGroupSize: 2,
          algorithm: 'tfidf',
        },
        manual: [],
      },
      code: {
        extract: options.exportCode || false,
        removeFromSource: true,
        createEdges: true,
        minLength: options.codeMinChars || 50,
        deduplicate: true,
      },
      duplicates: {
        enabled: true,
        level: 'message',
        detectExact: true,
        detectNear: true,
        nearThreshold: 0.85,
        detectSemantic: false,
        semanticThreshold: 0.9,
        createReviewFolders: true,
        autoMergeSuggestions: false,
      },
      privacy: {
        storageMode: 'local',
        allowExternalAPIs: false,
        apiKey: null,
      },
    };
  }
}
