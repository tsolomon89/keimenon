import {
  ParserRegistry,
  NormalizedConversation,
  SegmentExtractor,
  SourcesStitcher,
  ImportConfig,
  SourceDoc,
  codeBlocksToAssets,
  deduplicateCodeAssets,
  extractCodeBlocks,
  CodeAsset,
} from '@keimenon/parsers';
// import { getNeo4jClient } from '@keimenon/db';
const getNeo4jClient = () => ({ getSession: () => ({ run: async () => {}, close: async () => {} }) });
import {
  DuplicateDetectionService,
  DuplicateGroup,
  DuplicateDetectionConfig,
} from './duplicate-detection';

export interface ImportResult {
  conversations: Array<{
    id: string;
    title: string;
    platform: string;
    message_count: number;
  }>;
  sources: SourceDoc[];
  code_assets: CodeAsset[];
  duplicate_groups?: DuplicateGroup[]; // Optional - only if duplicate detection enabled
  stats: {
    total_conversations: number;
    total_messages: number;
    total_sources: number;
    total_code_blocks: number;
    user_messages: number;
    assistant_messages: number;
    duplicate_candidates?: number; // Only if duplicate detection enabled
  };
}

/**
 * Import chat conversations from JSON/JSONL files
 */
export class ImportService {
  private parserRegistry: ParserRegistry;

  constructor() {
    this.parserRegistry = new ParserRegistry();
  }

  /**
   * Import conversations from parsed data
   */
  async importConversations(
    data: unknown,
    sourceFile: string,
    config: ImportConfig
  ): Promise<ImportResult> {
    // 1. Parse conversations
    const parseResult = await this.parserRegistry.parse(data, sourceFile);

    // 2. Extract code blocks if enabled
    let codeAssets: CodeAsset[] = [];
    if (config.export_code) {
      codeAssets = this.extractCodeFromConversations(
        parseResult.conversations,
        config.code_min_chars
      );

      if (config.code_global_dedupe) {
        codeAssets = deduplicateCodeAssets(codeAssets);
      }
    }

    // 3. Detect duplicates if enabled
    let duplicateGroups: DuplicateGroup[] | undefined;
    if (config.duplicate_detection_enabled) {
      const duplicateService = new DuplicateDetectionService();
      const dupConfig: DuplicateDetectionConfig = {
        enabled: config.duplicate_detection_enabled,
        exactMatch: config.duplicate_exact_match,
        similarityThreshold: config.duplicate_similarity_threshold,
        crossConversation: config.duplicate_cross_conversation,
        algorithm: config.duplicate_algorithm,
        normalizeTokens: config.duplicate_normalize_tokens,
        minTokenOverlap: config.duplicate_min_token_overlap,
        lengthRatioTolerance: config.duplicate_length_ratio_tolerance,
        ignoreWhitespace: config.duplicate_ignore_whitespace,
        ignoreCase: config.duplicate_ignore_case,
        ignoreTimestamp: config.duplicate_ignore_timestamp,
        requireReview: config.duplicate_require_review,
        autoApproveExact: config.duplicate_auto_approve_exact,
        autoMergeThreshold: config.duplicate_auto_merge_threshold,
      };

      duplicateGroups = await duplicateService.findDuplicates(parseResult.conversations, dupConfig);
    }

    // 4. Build Sources Mode documents if enabled
    let sources: SourceDoc[] = [];
    if (config.sources_role_subset !== 'user' || config.sources_cap > 0) {
      const extractor = new SegmentExtractor(config);
      const segments = extractor.extractAll(parseResult.conversations);
      const dedupedSegments = extractor.dedupeExact(segments);

      const stitcher = new SourcesStitcher(config);
      sources = stitcher.buildSources(dedupedSegments);
    }

    // 5. Persist to Neo4j
    await this.persistToNeo4j(parseResult.conversations, sources, codeAssets);

    // 6. Build result
    const result: ImportResult = {
      conversations: parseResult.conversations.map((conv) => ({
        id: conv.conversation_id,
        title: conv.title,
        platform: conv.platform,
        message_count: conv.messages.length,
      })),
      sources,
      code_assets: codeAssets,
      duplicate_groups: duplicateGroups,
      stats: {
        total_conversations: parseResult.stats.total_conversations,
        total_messages: parseResult.stats.total_messages,
        total_sources: sources.length,
        total_code_blocks: codeAssets.length,
        user_messages: parseResult.stats.user_messages,
        assistant_messages: parseResult.stats.assistant_messages,
        duplicate_candidates: duplicateGroups
          ? duplicateGroups.reduce((sum, g) => sum + g.candidates.length, 0)
          : undefined,
      },
    };

    return result;
  }

  /**
   * Extract code blocks from all assistant messages
   */
  private extractCodeFromConversations(
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
   * Persist conversations, sources, and code to Neo4j
   */
  private async persistToNeo4j(
    conversations: NormalizedConversation[],
    sources: SourceDoc[],
    codeAssets: CodeAsset[]
  ): Promise<void> {
    const neo4j = getNeo4jClient();
    const session = neo4j.getSession();

    try {
      // Create ChatThread nodes and Message nodes
      for (const conv of conversations) {
        await this.createChatThread(session, conv);
      }

      // Create SourceDoc nodes (as Source nodes with special type)
      for (const source of sources) {
        await this.createSourceDoc(session, source);
      }

      // Create CodeAsset nodes
      for (const asset of codeAssets) {
        await this.createCodeAsset(session, asset);
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Create ChatThread node with messages
   */
  private async createChatThread(session: any, conv: NormalizedConversation) {
    const now = Date.now();

    // Create ChatThread node
    const threadResult = await session.run(
      `
      CREATE (t:ChatThread:Node {
        id: $id,
        kind: 'ChatThread',
        title: $title,
        created_at: $created_at,
        updated_at: $updated_at,
        metadata: $metadata
      })
      RETURN t
      `,
      {
        id: conv.conversation_id,
        title: conv.title,
        created_at: conv.created_at,
        updated_at: now,
        metadata: JSON.stringify({
          platform: conv.platform,
          source_file: conv.metadata?.source_file,
        }),
      }
    );

    // Create Message nodes and HAS_MESSAGE relationships
    for (const msg of conv.messages) {
      const msgId = `${conv.conversation_id}_msg_${msg.index}`;

      await session.run(
        `
        MATCH (t:ChatThread {id: $threadId})
        CREATE (m:Message:Node {
          id: $id,
          kind: 'Message',
          role: $role,
          content: $content,
          thread_id: $threadId,
          timestamp: $timestamp,
          created_at: $created_at,
          updated_at: $updated_at,
          metadata: $metadata
        })
        CREATE (t)-[:HAS_MESSAGE {index: $index}]->(m)
        `,
        {
          threadId: conv.conversation_id,
          id: msgId,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          index: msg.index,
          created_at: msg.timestamp,
          updated_at: now,
          metadata: JSON.stringify({
            hash: msg.hash,
            ...msg.metadata,
          }),
        }
      );
    }
  }

  /**
   * Create SourceDoc as a Source node
   */
  private async createSourceDoc(session: any, sourceDoc: SourceDoc) {
    const now = Date.now();

    await session.run(
      `
      CREATE (s:Source:Node {
        id: $id,
        kind: 'Source',
        title: $title,
        fingerprint: $fingerprint,
        mime_type: 'text/markdown',
        size_bytes: $size_bytes,
        created_at: $created_at,
        updated_at: $updated_at,
        metadata: $metadata
      })
      `,
      {
        id: sourceDoc.source_id,
        title: sourceDoc.canonical_title,
        fingerprint: `srcdoc:${sourceDoc.source_id}`,
        size_bytes: sourceDoc.n_chars,
        created_at: sourceDoc.created_ts_min,
        updated_at: now,
        metadata: JSON.stringify({
          type: 'source_doc',
          n_segments: sourceDoc.n_segments,
          n_chars: sourceDoc.n_chars,
          content_markdown: sourceDoc.content_markdown,
          provenance: sourceDoc.provenance,
        }),
      }
    );

    // Create COMPILED_FROM edges to messages if we can find them
    for (const prov of sourceDoc.provenance) {
      await session.run(
        `
        MATCH (s:Source {id: $sourceId})
        MATCH (m:Message)
        WHERE m.thread_id = $threadId
          AND m.metadata.index >= $minIdx
          AND m.metadata.index <= $maxIdx
        MERGE (s)-[:COMPILED_FROM]->(m)
        `,
        {
          sourceId: sourceDoc.source_id,
          threadId: prov.conversation_id,
          minIdx: prov.message_idx_start,
          maxIdx: prov.message_idx_end,
        }
      );
    }
  }

  /**
   * Create CodeAsset as a Source node with code type
   */
  private async createCodeAsset(session: any, asset: CodeAsset) {
    const now = Date.now();

    await session.run(
      `
      CREATE (c:CodeAsset:Source:Node {
        id: $id,
        kind: 'Source',
        title: $title,
        fingerprint: $fingerprint,
        mime_type: $mime_type,
        size_bytes: $size_bytes,
        created_at: $created_at,
        updated_at: $updated_at,
        metadata: $metadata
      })
      `,
      {
        id: asset.id,
        title: `${asset.language} code`,
        fingerprint: asset.hash,
        mime_type: `text/x-${asset.language}`,
        size_bytes: asset.code.length,
        created_at: asset.timestamp,
        updated_at: now,
        metadata: JSON.stringify({
          type: 'code_asset',
          language: asset.language,
          ext: asset.ext,
          code: asset.code,
          conversation_id: asset.conversation_id,
          derived_from_message_id: asset.derived_from_message_id,
        }),
      }
    );

    // Create DERIVES_FROM edge to message
    await session.run(
      `
      MATCH (c:CodeAsset {id: $codeId})
      MATCH (m:Message {id: $msgId})
      MERGE (c)-[:DERIVES_FROM]->(m)
      `,
      {
        codeId: asset.id,
        msgId: asset.derived_from_message_id,
      }
    );
  }
}
