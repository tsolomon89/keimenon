import { Router, Request, Response } from 'express';
import { streamingUploadService } from '../services/streaming-upload';
import { StreamingJSONParserV2 } from '../services/streaming-json-parser-v2';
import { SourcesBuilder } from '../services/sources-builder';
import { CodeExtractor } from '../services/code-extractor';
import { similarityEngine, SimilarityAlgorithm } from '../services/similarity-engine';
import { getNeo4jClient } from '@canvas-memory/db';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
  ContentProcessor,
  GroupingStorage,
  DeduplicationEngine,
  ClusteringEngine,
  ClusterEvidenceComputer,
} from '@canvas-memory/parsers';
import path from 'path';
import os from 'os';

// Enhanced import configuration schema - now accepts the same format as standard import
const EnhancedImportConfigSchema = z.object({
  // Standard import config fields
  sources_role_subset: z.enum(['both', 'user', 'assistant']).default('both'),
  sources_min_chars_user: z.number().default(400),
  sources_min_chars_assistant: z.number().default(400),
  sources_stitch_strategy: z.enum(['by_chat', 'by_title', 'by_topic']).default('by_chat'),
  sources_preserve_chat_integrity: z.boolean().default(true),
  sources_cap: z.number().default(150),
  sources_attach_mode: z.string().default('non-unique'),
  include_assistant_context: z.boolean().default(false),
  sources_export_format: z.string().default('md'),

  // Code extraction
  export_code: z.boolean().default(true),
  code_min_chars: z.number().default(50),
  code_global_dedupe: z.boolean().default(true),

  // Duplicate detection
  duplicate_detection_enabled: z.boolean().default(true),
  duplicate_exact_match: z.boolean().default(false),
  duplicate_similarity_threshold: z.number().min(0).max(1).default(0.85),
  duplicate_cross_conversation: z.boolean().default(true),
  duplicate_algorithm: z.enum(['jaccard', 'levenshtein', 'cosine', 'embedding']).default('jaccard'),
  duplicate_normalize_tokens: z.boolean().default(true),
  duplicate_min_token_overlap: z.number().default(5),
  duplicate_length_ratio_tolerance: z.number().default(0.2),
  duplicate_ignore_whitespace: z.boolean().default(true),
  duplicate_ignore_case: z.boolean().default(false),
  duplicate_ignore_timestamp: z.boolean().default(true),
  duplicate_require_review: z.boolean().default(true),
  duplicate_auto_approve_exact: z.boolean().default(false),
  duplicate_auto_merge_threshold: z.number().default(0.95),
  similarity_threshold: z.number().default(0.85),
}).partial();

/**
 * Factory function to create import-enhanced routes with auth
 */
export function createImportEnhancedRoutes(authService: AuthService): Router {
  const router = Router();

  /**
   * POST /api/v1/import/enhanced
   * Enhanced import with Sources mode, code extraction, and deduplication
   */
  router.post('/enhanced', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // Extract account_id and userId from authenticated user
      const accountId = (req as any).user?.accountId;
      const userId = (req as any).user?.userId;
      if (!accountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Handle streaming upload with form fields
      const uploadResult = await streamingUploadService.handleUploadWithFields(req);
      const files = uploadResult.files;

      // Parse configuration from form fields
      let config = EnhancedImportConfigSchema.parse({});

      if (uploadResult.fields.config) {
        const parsed = typeof uploadResult.fields.config === 'string'
          ? JSON.parse(uploadResult.fields.config)
          : uploadResult.fields.config;
        config = EnhancedImportConfigSchema.parse(parsed);
      }

      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid files uploaded.',
        });
      }

      const results = [];

      for (const file of files) {
        try {
          const importResult = await processEnhancedImport(file, config, accountId, userId);

          // Format response to match standard import structure
          results.push({
            file: file.fileName,
            success: true,
            result: {
              conversations: importResult.conversationsData || [],
              sources: importResult.sourcesData || [],
              code_assets: importResult.codeBlocksData || [],
              duplicate_groups: importResult.duplicateGroupsData || [],
              stats: {
                total_conversations: importResult.conversations,
                total_messages: importResult.messageCount || 0,
                total_sources: importResult.sources,
                total_code_blocks: importResult.codeBlocks,
                user_messages: 0, // Not tracked in enhanced import
                assistant_messages: 0, // Not tracked in enhanced import
                duplicate_candidates: importResult.duplicates,
              },
            },
          });
        } catch (error: any) {
          results.push({
            file: file.fileName,
            success: false,
            error: error.message,
          });
        }
      }

      res.json({
        success: true,
        results,
        summary: {
          total_files: files.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        },
      });

    } catch (error: any) {
      console.error('Enhanced import error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to process import',
      });
    }
  });

  return router;
}

/**
 * Process a single file with enhanced features
 */
async function processEnhancedImport(
  file: { uploadId: string; fileName: string; filePath: string },
  config: z.infer<typeof EnhancedImportConfigSchema>,
  accountId: string,
  userId: string
) {
  const { uploadId, fileName, filePath } = file;

  streamingUploadService.updateStatus(uploadId, 'processing');

  // Step 1: Parse conversations
  const parser = new StreamingJSONParserV2();
  const conversations: any[] = [];

  parser.on('batch', (batch) => {
    conversations.push(...batch);
  });

  await parser.parseFile(filePath);
  console.log(`✅ Parsed ${conversations.length} conversations`);

  // Use global database client (supports both SQLite and Neo4j)
  const db = global.dbClient;
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Step 2: Build sources (always enabled in enhanced import)
  console.log('📦 Building sources...');
  let sources: any[] = [];
  const sourcesConfig = {
    enabled: true,
    roleSubset: config.sources_role_subset || 'both',
    minCharsUser: config.sources_min_chars_user || 400,
    minCharsAssistant: config.sources_min_chars_assistant || 400,
    stitchStrategy: config.sources_stitch_strategy || 'by_chat',
    preserveChatIntegrity: config.sources_preserve_chat_integrity !== false,
    sourcesCap: config.sources_cap || 150,
    includeAssistantContext: config.include_assistant_context || false,
  };

  const builder = new SourcesBuilder(sourcesConfig);

  // Convert conversations to format expected by builder
  const convForSources = conversations.map(conv => ({
    id: conv.id,
    title: conv.title,
    messages: conv.messages.map((msg: any, idx: number) => ({
      id: msg.metadata?.id || `${conv.id}_msg_${idx}`,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      conversationId: conv.id,
      index: idx,
    })),
    platform: conv.platform,
    created_at: conv.created_at,
  }));

  sources = await builder.buildSources(convForSources);
  console.log(`✅ Built ${sources.length} sources`);

  // IMPORTANT: Save conversations FIRST to create ChatThread and Message nodes
  // Other entities (sources, code blocks, duplicates) create edges pointing to these nodes
  console.log('💾 Saving conversations...');
  await saveConversationsToNeo4j(db, conversations, accountId, userId);
  console.log(`✅ Saved ${conversations.length} conversations`);

  // Now save sources (creates edges to conversations)
  console.log('💾 Saving sources...');
  await saveSourcesToNeo4j(db, sources, accountId, userId);
  console.log(`✅ Saved ${sources.length} sources`);

  // Step 3: Extract code blocks if enabled
  let codeBlocks: any[] = [];
  if (config.export_code !== false) {
    const codeConfig = {
      enabled: true,
      minLength: config.code_min_chars || 50,
      deduplicate: config.code_global_dedupe !== false,
      extractInline: false,
      languages: [],
    };

    const extractor = new CodeExtractor(codeConfig);

    // Flatten all messages from all conversations
    const allMessages = conversations.flatMap(conv =>
      conv.messages.map((msg: any, idx: number) => ({
        id: msg.metadata?.id || `${conv.id}_msg_${idx}`,
        content: msg.content,
        conversationId: conv.id,
        role: msg.role,
      }))
    );

    codeBlocks = await extractor.extractFromMessages(allMessages);

    // Save code blocks to database (creates edges to messages)
    await saveCodeBlocksToNeo4j(db, codeBlocks, accountId, userId);
  }

  // Step 4: Detect duplicates if enabled
  let duplicates: any[] = [];
  if (config.duplicate_detection_enabled !== false) {
    const textsToCheck = config.duplicate_cross_conversation !== false
      ? conversations  // Check across all conversations
      : conversations.map(conv => ({ ...conv, messages: [conv] })); // Check within conversations

    // Extract message contents for comparison
    const messages = textsToCheck.flatMap(conv =>
      conv.messages.map((msg: any) => ({
        id: msg.metadata?.id || msg.id,
        content: msg.content,
        conversationId: conv.id,
      }))
    );

    duplicates = similarityEngine.findDuplicates(messages, {
      algorithm: (config.duplicate_algorithm || 'jaccard') as SimilarityAlgorithm,
      threshold: config.duplicate_similarity_threshold || 0.85,
      normalizeTokens: config.duplicate_normalize_tokens !== false,
      ignoreCase: config.duplicate_ignore_case || false,
      ignoreWhitespace: config.duplicate_ignore_whitespace !== false,
      minTokenOverlap: config.duplicate_min_token_overlap || 5,
      lengthRatioTolerance: config.duplicate_length_ratio_tolerance || 0.2,
    });

    // Save duplicate relationships to database (creates edges between messages)
    await saveDuplicatesToNeo4j(db, duplicates, accountId, userId);
  }

  // Step 5: Create default organizational structure (Folders/Groups)
  console.log('📁 Creating default organization...');
  await createDefaultOrganization(db, conversations, accountId, userId);
  console.log('✅ Default organization created');

  // Cleanup temp file
  await streamingUploadService.cleanup(filePath);
  streamingUploadService.updateStatus(uploadId, 'complete');

  // Format duplicate groups for frontend
  const duplicateGroups = duplicates.length > 0 ? [{
    id: 'group_1',
    candidates: duplicates.map((dup: any) => ({
      id: `${dup.primary}_${dup.duplicate}`,
      primary: {
        id: dup.primary,
        content: dup.primaryContent || '',
        conversationTitle: '',
        timestamp: Date.now(),
        charCount: 0,
        metadata: {},
      },
      duplicate: {
        id: dup.duplicate,
        content: dup.duplicateContent || '',
        conversationTitle: '',
        timestamp: Date.now(),
        charCount: 0,
        metadata: {},
      },
      similarity: dup.similarity.score,
      metrics: {
        tokenOverlap: 0,
        editDistance: 0,
        lengthRatio: 1,
      },
    })),
    totalDuplicates: duplicates.length,
    reviewed: 0,
    autoResolved: 0,
  }] : [];

  // Step 6: Run Phase 1-3 Processing (blobs, signatures, deduplication, clustering)
  console.log('🔬 Running Phase 1-3 processing...');
  const phase3Stats = await runPhase1to3Processing(conversations, accountId);
  console.log(`✅ Phase 1-3 complete: ${phase3Stats.blobs_created} blobs, ${phase3Stats.clusters_created} clusters`);

  return {
    uploadId,
    fileName,
    conversations: conversations.length,
    sources: sources.length,
    codeBlocks: codeBlocks.length,
    duplicates: duplicates.length,
    messageCount: conversations.reduce((sum, conv) => sum + conv.messages.length, 0),
    // Include actual data for frontend
    conversationsData: conversations.map(conv => ({
      id: conv.id,
      title: conv.title,
      platform: conv.platform,
      message_count: conv.messages.length,
    })),
    sourcesData: sources,
    codeBlocksData: codeBlocks,
    duplicateGroupsData: duplicateGroups,
    // Phase 1-3 stats
    phase1_blobs_created: phase3Stats.blobs_created,
    phase2_spans_created: phase3Stats.spans_created,
    phase2_signatures_created: phase3Stats.signatures_created,
    phase3_exact_duplicates: phase3Stats.exact_duplicates_found,
    phase3_clusters_created: phase3Stats.clusters_created,
    phase3_near_dup_edges: phase3Stats.near_dup_edges_created,
  };
}

/**
 * Run Phase 1-3 Processing Pipeline on SQLite
 * Phase 1-2: Content processing (breaking, signatures, LSH)
 * Phase 3: Deduplication + Clustering
 */
async function runPhase1to3Processing(
  conversations: any[],
  accountId: string
): Promise<{
  blobs_created: number;
  spans_created: number;
  signatures_created: number;
  exact_duplicates_found: number;
  clusters_created: number;
  near_dup_edges_created: number;
}> {
  // Get SQLite database path
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

  // Convert conversations to NormalizedConversation format
  const normalizedConvs = conversations.map(conv => ({
    conversation_id: conv.id,
    title: conv.title,
    platform: conv.platform || 'unknown',
    created_at: conv.created_at || Date.now(),
    messages: conv.messages.map((msg: any, idx: number) => ({
      index: idx,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp || Date.now(),
      hash: `hash_${msg.metadata?.id || `${conv.id}_msg_${idx}`}`,
    })),
    metadata: {
      source_file: 'import',
    },
  }));

  // Phase 1-2: Process each conversation
  // NOTE: Phase 1-3 tables don't have account_id yet - using data_tag for now
  // TODO: Add account_id column to blobs, node_spans, node_signatures, lsh_bands tables
  const dataTag = `account_${accountId.substring(0, 8)}`;

  for (const conv of normalizedConvs) {
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
 * Create default organizational structure after import
 * Creates a root folder "Imported Conversations" and groups each conversation
 */
async function createDefaultOrganization(db: any, conversations: any[], accountId: string, userId: string) {
  // Create root folder
  const folderId = `folder_${randomUUID()}`;
  const folderNode = {
    id: folderId,
    kind: 'Folder' as const,
    created_at: Date.now(),
    updated_at: Date.now(),
    account_id: accountId,
    created_by: userId,
    properties: JSON.stringify({
      name: 'Imported Conversations',
      description: `Auto-created folder for ${conversations.length} imported conversations`,
      created_by: 'import',
    }),
  };
  await db.createNode(folderNode);

  // Create a group for each conversation
  for (const conv of conversations) {
    const groupId = `group_${randomUUID()}`;
    const groupNode = {
      id: groupId,
      kind: 'Group' as const,
      created_at: Date.now(),
      updated_at: Date.now(),
      account_id: accountId,
      created_by: userId,
      properties: JSON.stringify({
        name: conv.title || 'Untitled Conversation',
        description: `Imported from ${conv.platform || 'unknown platform'}`,
        message_count: conv.messages.length,
      }),
    };
    await db.createNode(groupNode);

    // Create edge from Group to ChatThread (IN_GROUP)
    const inGroupEdge = {
      id: `${conv.id}_in_${groupId}`,
      kind: 'IN_GROUP' as const,
      from: conv.id,
      to: groupId,
      created_at: Date.now(),
      account_id: accountId,
      created_by: userId,
    };
    await db.createEdge(inGroupEdge);

    // Create edge from Group to Folder (FOLDS_INTO_FOLDER)
    const foldsEdge = {
      id: `${groupId}_folds_${folderId}`,
      kind: 'FOLDS_INTO_FOLDER' as const,
      from: groupId,
      to: folderId,
      created_at: Date.now(),
      account_id: accountId,
      created_by: userId,
    };
    await db.createEdge(foldsEdge);
  }
}

/**
 * Save conversations to database (SQLite or Neo4j)
 */
async function saveConversationsToNeo4j(db: any, conversations: any[], accountId: string, userId: string) {
  for (const conv of conversations) {
    // Create ChatThread node
    const chatNode = {
      id: conv.id,
      kind: 'ChatThread' as const,
      created_at: conv.created_at || Date.now(),
      updated_at: conv.updated_at || Date.now(),
      title: conv.title,
      account_id: accountId,
      created_by: userId,
      metadata: {
        platform: conv.platform,
        message_count: conv.messages.length,
      },
    };
    await db.createNode(chatNode);

    // Create Message nodes and CONTAINS edges
    for (let idx = 0; idx < conv.messages.length; idx++) {
      const msg = conv.messages[idx];
      const msgId = msg.metadata?.id || `${conv.id}_msg_${idx}`;

      const messageNode = {
        id: msgId,
        kind: 'Message' as const,
        created_at: msg.timestamp || Date.now(),
        updated_at: msg.timestamp || Date.now(),
        role: msg.role,
        content: msg.content,
        thread_id: conv.id,
        timestamp: msg.timestamp || Date.now(),
        char_count: msg.content?.length || 0,
        account_id: accountId,
        created_by: userId,
        metadata: {
          index: idx,
        },
      };
      await db.createNode(messageNode);

      // Create CONTAINS edge from ChatThread to Message
      const containsEdge = {
        id: `${conv.id}_contains_${msgId}`,
        kind: 'CONTAINS' as const,
        from: conv.id,
        to: msgId,
        created_at: Date.now(),
        account_id: accountId,
        created_by: userId,
        metadata: {
          rank: idx,
        },
      };
      await db.createEdge(containsEdge);
    }
  }
}

/**
 * Save source documents to database (SQLite or Neo4j)
 */
async function saveSourcesToNeo4j(db: any, sources: any[], accountId: string, userId: string) {
  for (const source of sources) {
    // Create Source node
    const sourceNode = {
      id: source.id,
      kind: 'Source' as const,
      created_at: source.created_at || Date.now(),
      updated_at: Date.now(),
      fingerprint: source.id, // Using ID as fingerprint for now
      mime_type: 'text/markdown',
      size_bytes: source.content?.length || 0,
      title: source.title,
      account_id: accountId,
      created_by: userId,
      metadata: {
        platform: source.platform,
        message_count: source.metadata.messageCount,
        char_count: source.metadata.charCount,
        has_code: source.metadata.hasCode,
        content: source.content, // Store content in metadata for now
      },
    };
    await db.createNode(sourceNode);

    // Create DERIVES_FROM edge to ChatThread
    const derivesEdge = {
      id: `${source.id}_derives_${source.conversationId}`,
      kind: 'DERIVES_FROM' as const,
      from: source.id,
      to: source.conversationId,
      created_at: Date.now(),
      account_id: accountId,
      created_by: userId,
    };
    await db.createEdge(derivesEdge);

    // Create DERIVES_FROM edges to messages (stitched from)
    for (const msgId of source.messageIds) {
      const stitchedEdge = {
        id: `${source.id}_stitched_${msgId}`,
        kind: 'DERIVES_FROM' as const,
        from: source.id,
        to: msgId,
        created_at: Date.now(),
        account_id: accountId,
        created_by: userId,
        metadata: {
          relationship_type: 'stitched_from',
        },
      };
      await db.createEdge(stitchedEdge);
    }
  }
}

/**
 * Save code blocks to database (SQLite or Neo4j)
 */
async function saveCodeBlocksToNeo4j(db: any, codeBlocks: any[], accountId: string, userId: string) {
  for (const block of codeBlocks) {
    // Create CodeBlock node
    const codeNode = {
      id: block.id,
      kind: 'CodeBlock' as const,
      created_at: Date.now(),
      updated_at: Date.now(),
      language: block.language,
      code: block.code,
      content_hash: block.hash,
      line_count: block.metadata.lineCount,
      char_count: block.metadata.charCount,
      is_fenced: block.metadata.isFenced,
      has_comments: block.metadata.hasComments,
      derived_from_message_id: block.messageId,
      account_id: accountId,
      created_by: userId,
    };
    await db.createNode(codeNode);

    // Create DERIVES_FROM edge to Message
    const derivesEdge = {
      id: `${block.id}_derives_${block.messageId}`,
      kind: 'DERIVES_FROM' as const,
      from: block.id,
      to: block.messageId,
      created_at: Date.now(),
      account_id: accountId,
      created_by: userId,
      metadata: {
        relationship_type: 'extracted_from',
      },
    };
    await db.createEdge(derivesEdge);
  }
}

/**
 * Save duplicate relationships to database (SQLite or Neo4j)
 */
async function saveDuplicatesToNeo4j(db: any, duplicates: any[], accountId: string, userId: string) {
  for (const dup of duplicates) {
    // Use EQUIVALENT_TO edge for duplicates
    const dupEdge = {
      id: `${dup.primary}_dup_${dup.duplicate}`,
      kind: 'DUP_OF' as const,
      from: dup.duplicate, // duplicate points to primary
      to: dup.primary,     // primary is the canonical node
      created_at: Date.now(),
      score: dup.similarity.score,
      canonical: dup.primary,
      account_id: accountId,
      created_by: userId,
      metadata: {
        algorithm: dup.similarity.algorithm,
        is_duplicate: dup.similarity.isDuplicate,
      },
    };
    await db.createEdge(dupEdge);
  }
}
