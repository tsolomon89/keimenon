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
  // Phase 1-3 services
  ContentProcessor,
  GroupingStorage,
  DeduplicationEngine,
  ClusteringEngine,
  ClusterEvidenceComputer,
  type ProcessingConfig,
} from '@canvas-memory/parsers';
import { getNeo4jClient, getSQLiteClient } from '@canvas-memory/db';
import {
  DuplicateDetectionService,
  DuplicateGroup,
  DuplicateDetectionConfig,
} from './duplicate-detection';
import { getLocalDocumentStore, LocalDocumentStore } from './local-document-store';
import path from 'path';
import os from 'os';

export interface ImportResultLocal {
  conversations: Array<{
    id: string;
    title: string;
    platform: string;
    message_count: number;
  }>;
  sources: SourceDoc[];
  code_assets: CodeAsset[];
  duplicate_groups?: DuplicateGroup[];
  stats: {
    total_conversations: number;
    total_messages: number;
    total_sources: number;
    total_code_blocks: number;
    user_messages: number;
    assistant_messages: number;
    duplicate_candidates?: number;
    local_storage_bytes: number;
    // Phase 1-3 stats
    phase1_blobs_created?: number;
    phase2_spans_created?: number;
    phase2_signatures_created?: number;
    phase3_exact_duplicates?: number;
    phase3_clusters_created?: number;
    phase3_near_dup_edges?: number;
  };
}

/**
 * Import chat conversations with local-first storage
 * Documents stored on filesystem, metadata in Neo4j
 */
export class ImportServiceLocal {
  private parserRegistry: ParserRegistry;
  private localStore: LocalDocumentStore;

  constructor() {
    this.parserRegistry = new ParserRegistry();
    this.localStore = getLocalDocumentStore();
  }

  /**
   * Initialize local storage
   */
  async initialize(): Promise<void> {
    await this.localStore.initialize();
  }

  /**
   * Import conversations from parsed data with local storage
   */
  async importConversations(
    data: unknown,
    sourceFile: string,
    config: ImportConfig,
    dataTag: 'test' | 'automated' | 'manual' | 'real' = 'manual'
  ): Promise<ImportResultLocal> {
    let localStorageBytes = 0;

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

      duplicateGroups = await duplicateService.findDuplicates(
        parseResult.conversations,
        dupConfig
      );
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

    // 5. Phase 1-3: Content Processing, Grouping, and Clustering (SQLite)
    const phase3Stats = await this.runPhase1to3Processing(
      parseResult.conversations,
      dataTag
    );

    // 6. Persist to local storage + Neo4j
    localStorageBytes = await this.persistToLocalAndNeo4j(
      parseResult.conversations,
      sources,
      codeAssets,
      dataTag
    );

    // 7. Build result
    const result: ImportResultLocal = {
      conversations: parseResult.conversations.map(conv => ({
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
        local_storage_bytes: localStorageBytes,
        // Phase 1-3 stats
        phase1_blobs_created: phase3Stats.blobs_created,
        phase2_spans_created: phase3Stats.spans_created,
        phase2_signatures_created: phase3Stats.signatures_created,
        phase3_exact_duplicates: phase3Stats.exact_duplicates_found,
        phase3_clusters_created: phase3Stats.clusters_created,
        phase3_near_dup_edges: phase3Stats.near_dup_edges_created,
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
   * Run Phase 1-3 Processing Pipeline on SQLite
   * Phase 1-2: Content processing (breaking, signatures, LSH)
   * Phase 3: Deduplication + Clustering
   */
  private async runPhase1to3Processing(
    conversations: NormalizedConversation[],
    dataTag: string
  ): Promise<{
    blobs_created: number;
    spans_created: number;
    signatures_created: number;
    exact_duplicates_found: number;
    clusters_created: number;
    near_dup_edges_created: number;
  }> {
    // Get SQLite database path (default to user home directory)
    const dbPath = process.env.SQLITE_PATH || path.join(os.homedir(), '.canvas-memory', 'canvas.db');

    // Initialize Phase 1-3 services
    const processor = new ContentProcessor({
      extractTokens: false,    // Skip token level for performance
      extractPhrases: false,    // Skip phrase level
      extractSentences: true,   // Keep sentences
      extractBlocks: true,      // Keep blocks
      extractSections: true,    // Keep sections
      generateSignatures: true, // Generate MinHash/TF-IDF
      minHashPermutations: 128,
    });

    const storage = new GroupingStorage(dbPath);
    const deduper = new DeduplicationEngine(dbPath, storage);
    const clusterer = new ClusteringEngine(dbPath, storage, undefined); // Use default policy
    const evidenceComputer = new ClusterEvidenceComputer(dbPath, undefined);

    let blobsCreated = 0;
    let spansCreated = 0;
    let signaturesCreated = 0;

    // Phase 1-2: Process each conversation
    for (const conv of conversations) {
      const processedMessages = await processor.processConversation(conv);

      for (const processed of processedMessages) {
        // Insert blob
        storage.insertBlob({
          ...processed.blob,
          data_tag: dataTag,
        });
        blobsCreated++;

        // Insert spans
        const spansWithTag = processed.spans.map(span => ({
          ...span,
          data_tag: dataTag,
        }));
        storage.insertNodeSpans(spansWithTag);
        spansCreated += processed.spans.length;

        // Insert signatures
        const sigsWithTag = processed.signatures.map(sig => ({
          ...sig,
          data_tag: dataTag,
        }));
        storage.insertNodeSignatures(sigsWithTag);
        signaturesCreated += processed.signatures.length;

        // Insert LSH bands
        for (const signature of processed.signatures) {
          if (signature.minhash_bands) {
            const lshBands = signature.minhash_bands.map((bandHash, bandIndex) => ({
              band_hash: bandHash,
              band_index: bandIndex,
              node_id: signature.node_id,
              created_at: signature.created_at,
              data_tag: dataTag,
            }));
            storage.insertLshBands(lshBands);
          }
        }
      }
    }

    // Phase 3: Exact Deduplication
    const dedupResult = await deduper.deduplicate();
    const exactDuplicatesFound = dedupResult.canonical_nodes.length;

    // Phase 3: Clustering (run on sentence + block levels, prose + code modalities)
    let clustersCreated = 0;
    let nearDupEdgesCreated = 0;

    try {
      // Cluster sentence-level prose
      const sentenceProseResult = await clusterer.cluster('sentence', 'prose');
      clustersCreated += sentenceProseResult.stats.total_clusters || 0;
      nearDupEdgesCreated += sentenceProseResult.stats.edges_created || 0;

      // Cluster block-level prose
      const blockProseResult = await clusterer.cluster('block', 'prose');
      clustersCreated += blockProseResult.stats.total_clusters || 0;
      nearDupEdgesCreated += blockProseResult.stats.edges_created || 0;

      // Cluster block-level code
      const blockCodeResult = await clusterer.cluster('block', 'code');
      clustersCreated += blockCodeResult.stats.total_clusters || 0;
      nearDupEdgesCreated += blockCodeResult.stats.edges_created || 0;

      // Compute evidence for all clusters
      evidenceComputer.computeAllEvidence();
    } catch (error) {
      console.warn('Phase 3 clustering encountered an error (continuing):', error);
    }

    return {
      blobs_created: blobsCreated,
      spans_created: spansCreated,
      signatures_created: signaturesCreated,
      exact_duplicates_found: exactDuplicatesFound,
      clusters_created: clustersCreated,
      near_dup_edges_created: nearDupEdgesCreated,
    };
  }

  /**
   * Persist conversations, sources, and code to local storage + Neo4j
   * Returns total bytes stored locally
   */
  private async persistToLocalAndNeo4j(
    conversations: NormalizedConversation[],
    sources: SourceDoc[],
    codeAssets: CodeAsset[],
    dataTag: 'test' | 'automated' | 'manual' | 'real' = 'manual'
  ): Promise<number> {
    const neo4j = getNeo4jClient();
    const session = neo4j.getSession();
    let totalBytes = 0;

    try {
      // 1. Save conversations to local + create graph nodes
      for (const conv of conversations) {
        // Save full conversation to local storage
        const convMetadata = await this.localStore.saveConversation(
          conv.conversation_id,
          conv
        );
        totalBytes += convMetadata.size;

        // Create ChatThread node (metadata only)
        await this.createChatThread(session, conv, dataTag);

        // Save messages to local + create Message nodes
        for (const msg of conv.messages) {
          const msgId = `${conv.conversation_id}_msg_${msg.index}`;

          // Save message content to local storage
          const msgMetadata = await this.localStore.saveMessage(
            conv.conversation_id,
            msgId,
            msg.content,
            'md'
          );
          totalBytes += msgMetadata.size;

          // Create Message node with location pointer
          await this.createMessageNode(session, conv.conversation_id, msg, msgId, msgMetadata.storagePath, dataTag);
        }
      }

      // 2. Save SourceDocs to local + create Source nodes
      for (const source of sources) {
        // Save source content to local storage
        const sourceContent = this.formatSourceDoc(source);
        const sourceMetadata = await this.localStore.saveSource(
          source.source_id,
          sourceContent
        );
        totalBytes += sourceMetadata.size;

        // Create Source node with location pointer
        await this.createSourceDoc(session, source, sourceMetadata.storagePath, dataTag);
      }

      // 3. Save CodeAssets to local + create CodeBlock nodes
      for (const asset of codeAssets) {
        // Save code to local storage
        const codeMetadata = await this.localStore.saveCodeBlock(
          asset.id,
          asset.code,
          asset.language
        );
        totalBytes += codeMetadata.size;

        // Create CodeBlock node with location pointer
        await this.createCodeAsset(session, asset, codeMetadata.storagePath, dataTag);
      }
    } finally {
      await session.close();
    }

    return totalBytes;
  }

  /**
   * Create ChatThread node
   */
  private async createChatThread(session: any, conv: NormalizedConversation, dataTag: string) {
    const now = Date.now();

    await session.run(
      `
      CREATE (t:ChatThread:Node {
        id: $id,
        kind: 'ChatThread',
        title: $title,
        created_at: $created_at,
        updated_at: $updated_at,
        metadata: $metadata,
        data_tag: $data_tag
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
          message_count: conv.messages.length,
        }),
        data_tag: dataTag,
      }
    );
  }

  /**
   * Create Message node (metadata only, content in local storage)
   */
  private async createMessageNode(
    session: any,
    threadId: string,
    msg: any,
    msgId: string,
    storagePath: string,
    dataTag: string
  ) {
    const now = Date.now();

    await session.run(
      `
      MATCH (t:ChatThread {id: $threadId})
      CREATE (m:Message:Node {
        id: $id,
        kind: 'Message',
        role: $role,
        content_location: $content_location,
        content_hash: $content_hash,
        char_count: $char_count,
        thread_id: $threadId,
        timestamp: $timestamp,
        created_at: $created_at,
        updated_at: $updated_at,
        metadata: $metadata,
        data_tag: $data_tag
      })
      CREATE (t)-[:HAS_MESSAGE {index: $index}]->(m)
      `,
      {
        threadId,
        id: msgId,
        role: msg.role,
        content_location: this.localStore.getStorageLocation({
          id: msgId,
          type: 'message',
          hash: msg.hash,
          storagePath,
          size: msg.content.length,
          createdAt: msg.timestamp
        }),
        content_hash: msg.hash,
        char_count: msg.content.length,
        timestamp: msg.timestamp,
        index: msg.index,
        created_at: msg.timestamp,
        updated_at: now,
        metadata: JSON.stringify({
          ...msg.metadata,
        }),
        data_tag: dataTag,
      }
    );
  }

  /**
   * Create SourceDoc as a Source node
   */
  private async createSourceDoc(
    session: any,
    sourceDoc: SourceDoc,
    storagePath: string,
    dataTag: string
  ) {
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
        content_location: $content_location,
        created_at: $created_at,
        updated_at: $updated_at,
        metadata: $metadata,
        data_tag: $data_tag
      })
      `,
      {
        id: sourceDoc.source_id,
        title: sourceDoc.canonical_title,
        fingerprint: `srcdoc:${sourceDoc.source_id}`,
        size_bytes: sourceDoc.n_chars,
        content_location: this.localStore.getStorageLocation({
          id: sourceDoc.source_id,
          type: 'source',
          hash: sourceDoc.source_id,
          storagePath,
          size: sourceDoc.n_chars,
          createdAt: sourceDoc.created_ts_min,
        }),
        created_at: sourceDoc.created_ts_min,
        updated_at: now,
        metadata: JSON.stringify({
          type: 'source_doc',
          n_segments: sourceDoc.n_segments,
          n_chars: sourceDoc.n_chars,
          provenance: sourceDoc.provenance,
        }),
        data_tag: dataTag,
      }
    );

    // Create COMPILED_FROM edges to messages
    for (const prov of sourceDoc.provenance) {
      await session.run(
        `
        MATCH (s:Source {id: $sourceId})
        MATCH (m:Message)
        WHERE m.thread_id = $threadId
          AND m.metadata CONTAINS '"index":' + toString($minIdx)
        MERGE (s)-[:COMPILED_FROM]->(m)
        `,
        {
          sourceId: sourceDoc.source_id,
          threadId: prov.conversation_id,
          minIdx: prov.message_idx_start,
        }
      );
    }
  }

  /**
   * Create CodeAsset as a CodeBlock node
   */
  private async createCodeAsset(
    session: any,
    asset: CodeAsset,
    storagePath: string,
    dataTag: string
  ) {
    const now = Date.now();

    await session.run(
      `
      CREATE (c:CodeBlock:Source:Node {
        id: $id,
        kind: 'CodeBlock',
        language: $language,
        title: $title,
        fingerprint: $fingerprint,
        mime_type: $mime_type,
        size_bytes: $size_bytes,
        content_location: $content_location,
        content_hash: $content_hash,
        line_count: $line_count,
        char_count: $char_count,
        created_at: $created_at,
        updated_at: $updated_at,
        metadata: $metadata,
        data_tag: $data_tag
      })
      `,
      {
        id: asset.id,
        language: asset.language,
        title: `${asset.language} code`,
        fingerprint: asset.hash,
        mime_type: `text/x-${asset.language}`,
        size_bytes: asset.code.length,
        content_location: this.localStore.getStorageLocation({
          id: asset.id,
          type: 'code',
          hash: asset.hash,
          storagePath,
          size: asset.code.length,
          createdAt: asset.timestamp,
        }),
        content_hash: asset.hash,
        line_count: asset.code.split('\n').length,
        char_count: asset.code.length,
        created_at: asset.timestamp,
        updated_at: now,
        metadata: JSON.stringify({
          type: 'code_asset',
          ext: asset.ext,
          conversation_id: asset.conversation_id,
          derived_from_message_id: asset.derived_from_message_id,
        }),
        data_tag: dataTag,
      }
    );

    // Create DERIVES_FROM edge to message
    if (asset.derived_from_message_id) {
      await session.run(
        `
        MATCH (c:CodeBlock {id: $codeId})
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

  /**
   * Format source document as Markdown
   */
  private formatSourceDoc(source: SourceDoc): string {
    let markdown = `# ${source.canonical_title}\n\n`;
    markdown += source.content_markdown + '\n\n';
    markdown += `## Provenance\n\n`;
    markdown += `| Conversation | Messages | Timestamp |\n`;
    markdown += `|--------------|----------|----------|\n`;

    for (const prov of source.provenance) {
      const msgRange = prov.message_idx_start === prov.message_idx_end
        ? `${prov.message_idx_start}`
        : `${prov.message_idx_start}-${prov.message_idx_end}`;
      const date = new Date(prov.created_ts_min).toISOString();
      markdown += `| ${prov.conversation_id.substring(0, 12)}... | ${msgRange} | ${date} |\n`;
    }

    return markdown;
  }
}
