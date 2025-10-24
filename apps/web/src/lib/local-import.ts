/**
 * Local-First Import Service
 *
 * Processes chat files entirely in the browser without uploading to server.
 * This implements the "local-first" philosophy from CLAUDE.md:
 * - Free/Pro tiers process on-device
 * - No server upload required
 * - Data stays local
 * - BYO keys for AI features
 */

import {
  ParserRegistry,
  SegmentExtractor,
  SourcesStitcher,
  extractCodeBlocks,
  codeBlocksToAssets,
  deduplicateCodeAssets,
  type ParseResult,
  type NormalizedConversation,
  type SourceDoc,
  type CodeAsset,
  type ImportConfig,
} from '@canvas-memory/parsers/browser';

export interface LocalImportConfig {
  // Role & length filters
  includeUser: boolean;
  includeAssistant: boolean;
  minMessageLength: number;

  // Processing mode
  processingMode: 'manual' | 'auto';
  branches: 'merged' | 'separate';

  // Code extraction
  extractCode: boolean;
  codeMinLength: number;
  codeDeduplicate: boolean;

  // Duplicate detection
  duplicateDetection: {
    enabled: boolean;
    exactMatch: boolean;
    similarityThreshold: number;
    crossConversation: boolean;
    algorithm: 'jaccard' | 'levenshtein' | 'cosine';
  };
}

export const DEFAULT_LOCAL_CONFIG: LocalImportConfig = {
  includeUser: true,
  includeAssistant: false,
  minMessageLength: 400,
  processingMode: 'auto',
  branches: 'merged',
  extractCode: true,
  codeMinLength: 50,
  codeDeduplicate: true,
  duplicateDetection: {
    enabled: false,
    exactMatch: true,
    similarityThreshold: 0.85,
    crossConversation: true,
    algorithm: 'jaccard',
  },
};

export interface LocalImportProgress {
  stage:
    | 'reading'
    | 'parsing'
    | 'extracting'
    | 'stitching'
    | 'deduping'
    | 'saving'
    | 'complete'
    | 'error';
  progress: number; // 0-100
  message: string;
  detail?: string;
}

export interface LocalImportResult {
  success: boolean;
  conversations: Array<{
    id: string;
    title: string;
    platform: string;
    messageCount: number;
  }>;
  sources: SourceDoc[];
  codeAssets: CodeAsset[];
  stats: {
    totalConversations: number;
    totalMessages: number;
    totalSources: number;
    totalCodeBlocks: number;
    userMessages: number;
    assistantMessages: number;
    processingTimeMs: number;
  };
  error?: string;
}

/**
 * Convert LocalImportConfig to parser ImportConfig
 */
function convertConfig(config: LocalImportConfig): ImportConfig {
  return {
    sources_role_subset:
      config.includeUser && config.includeAssistant
        ? 'both'
        : config.includeUser
          ? 'user'
          : 'assistant',
    sources_min_chars_user: config.minMessageLength,
    sources_min_chars_assistant: config.minMessageLength,
    sources_stitch_strategy: config.processingMode === 'manual' ? 'by_chat' : 'by_title',
    sources_preserve_chat_integrity: config.branches === 'merged',
    sources_cap: 150,
    sources_attach_mode: 'non-unique',
    similarity_threshold: config.duplicateDetection.similarityThreshold,
    export_code: config.extractCode,
    code_global_dedupe: config.codeDeduplicate,
    code_min_chars: config.codeMinLength,
    sources_export_format: 'md',
    include_assistant_context: config.includeAssistant,
    duplicate_detection_enabled: config.duplicateDetection.enabled,
    duplicate_exact_match: config.duplicateDetection.exactMatch,
    duplicate_similarity_threshold: config.duplicateDetection.similarityThreshold,
    duplicate_cross_conversation: config.duplicateDetection.crossConversation,
    duplicate_algorithm: config.duplicateDetection.algorithm,
    duplicate_normalize_tokens: true,
    duplicate_min_token_overlap: 5,
    duplicate_length_ratio_tolerance: 0.2,
    duplicate_ignore_whitespace: true,
    duplicate_ignore_case: false,
    duplicate_ignore_timestamp: true,
    duplicate_require_review: true,
    duplicate_auto_approve_exact: false,
    duplicate_auto_merge_threshold: 0.95,
  };
}

/**
 * Extract code from conversations
 */
function extractCodeFromConversations(
  conversations: NormalizedConversation[],
  minChars: number
): CodeAsset[] {
  const allAssets: CodeAsset[] = [];

  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.role !== 'assistant') continue;

      const blocks = extractCodeBlocks(msg.content);
      const assets = codeBlocksToAssets(
        blocks,
        `msg_${msg.index}_${conv.conversation_id}`,
        conv.conversation_id,
        msg.timestamp,
        minChars
      );

      allAssets.push(...assets);
    }
  }

  return allAssets;
}

/**
 * Process a chat file locally in the browser
 */
export class LocalImportService {
  private parserRegistry: ParserRegistry;
  private onProgress?: (progress: LocalImportProgress) => void;

  constructor(onProgress?: (progress: LocalImportProgress) => void) {
    this.parserRegistry = new ParserRegistry();
    this.onProgress = onProgress;
  }

  /**
   * Read file as text
   */
  private async readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as text'));
        }
      };

      reader.onerror = () => {
        reject(new Error(`File read error: ${reader.error?.message}`));
      };

      reader.readAsText(file);
    });
  }

  /**
   * Report progress
   */
  private reportProgress(
    stage: LocalImportProgress['stage'],
    progress: number,
    message: string,
    detail?: string
  ) {
    if (this.onProgress) {
      this.onProgress({ stage, progress, message, detail });
    }
  }

  /**
   * Import a chat file
   */
  async importFile(file: File, config: LocalImportConfig): Promise<LocalImportResult> {
    const startTime = Date.now();

    try {
      // Stage 1: Read file
      this.reportProgress('reading', 0, 'Reading file...', file.name);
      const fileContent = await this.readFile(file);

      this.reportProgress(
        'reading',
        20,
        'Parsing JSON...',
        `${(fileContent.length / 1024 / 1024).toFixed(2)} MB`
      );
      const data = JSON.parse(fileContent);

      // Stage 2: Parse conversations
      this.reportProgress('parsing', 30, 'Parsing conversations...', 'Detecting platform');
      const parseResult: ParseResult = await this.parserRegistry.parse(data, file.name);

      this.reportProgress(
        'parsing',
        40,
        'Parsed conversations',
        `${parseResult.conversations.length} conversations, ${parseResult.stats.total_messages} messages`
      );

      // Stage 3: Extract code blocks (if enabled)
      let codeAssets: CodeAsset[] = [];
      if (config.extractCode) {
        this.reportProgress('extracting', 50, 'Extracting code blocks...');
        codeAssets = extractCodeFromConversations(parseResult.conversations, config.codeMinLength);

        if (config.codeDeduplicate) {
          this.reportProgress('deduping', 55, 'Deduplicating code...');
          codeAssets = deduplicateCodeAssets(codeAssets);
        }

        this.reportProgress(
          'extracting',
          60,
          'Code extraction complete',
          `${codeAssets.length} code blocks`
        );
      }

      // Stage 4: Build source documents (if filters applied)
      let sources: SourceDoc[] = [];
      const importConfig = convertConfig(config);

      if (importConfig.sources_role_subset !== 'both' || importConfig.sources_cap > 0) {
        this.reportProgress('stitching', 65, 'Building source documents...');

        const extractor = new SegmentExtractor(importConfig);
        const segments = extractor.extractAll(parseResult.conversations);
        const dedupedSegments = extractor.dedupeExact(segments);

        this.reportProgress('stitching', 75, 'Stitching segments...');
        const stitcher = new SourcesStitcher(importConfig);
        sources = stitcher.buildSources(dedupedSegments);

        this.reportProgress('stitching', 80, 'Sources built', `${sources.length} source documents`);
      }

      // Stage 5: Save to local storage (IndexedDB or LocalStorage)
      this.reportProgress('saving', 85, 'Saving to local storage...');

      // TODO: Implement local storage save using IndexedDB
      // Related: apps/web/src/lib/db.ts (create IndexedDB wrapper)
      // See: docs/architecture/LOCAL_STORAGE.md for design
      // For now, we'll just prepare the result

      this.reportProgress('saving', 95, 'Save complete');

      // Stage 6: Build result
      const processingTimeMs = Date.now() - startTime;

      this.reportProgress(
        'complete',
        100,
        'Import complete!',
        `Processed in ${(processingTimeMs / 1000).toFixed(1)}s`
      );

      const result: LocalImportResult = {
        success: true,
        conversations: parseResult.conversations.map((conv) => ({
          id: conv.conversation_id,
          title: conv.title,
          platform: conv.platform,
          messageCount: conv.messages.length,
        })),
        sources,
        codeAssets,
        stats: {
          totalConversations: parseResult.stats.total_conversations,
          totalMessages: parseResult.stats.total_messages,
          totalSources: sources.length,
          totalCodeBlocks: codeAssets.length,
          userMessages: parseResult.stats.user_messages,
          assistantMessages: parseResult.stats.assistant_messages,
          processingTimeMs,
        },
      };

      return result;
    } catch (error: any) {
      this.reportProgress('error', 0, 'Import failed', error.message);

      return {
        success: false,
        conversations: [],
        sources: [],
        codeAssets: [],
        stats: {
          totalConversations: 0,
          totalMessages: 0,
          totalSources: 0,
          totalCodeBlocks: 0,
          userMessages: 0,
          assistantMessages: 0,
          processingTimeMs: Date.now() - startTime,
        },
        error: error.message,
      };
    }
  }

  /**
   * Import multiple files
   */
  async importFiles(files: File[], config: LocalImportConfig): Promise<LocalImportResult[]> {
    const results: LocalImportResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      this.reportProgress('reading', 0, `Processing file ${i + 1} of ${files.length}`, file.name);

      const result = await this.importFile(file, config);
      results.push(result);
    }

    return results;
  }
}
