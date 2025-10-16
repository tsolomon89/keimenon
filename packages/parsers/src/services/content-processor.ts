/**
 * Content Processor: Apply multi-level breaking pipeline to conversation content
 *
 * Takes parsed conversations and applies:
 * 1. Text normalization (UTF-8, NFC, LF)
 * 2. Blob creation (content-addressed storage)
 * 3. Multi-level breaking (token, phrase, sentence, block, section)
 * 4. Signature generation (structural, MinHash, TF-IDF, token sketch)
 * 5. Span tracking (byte offsets for virtual nodes)
 */

import { NormalizedConversation, NormalizedMessage } from '../types';
import { normalizeText, NormalizationResult } from '../utils/text-normalizer';
import { generateBlobId, generateNodeKey, generateContentId } from '../utils/id-generator';
import {
  extractSections,
  extractBlocks,
  extractSentences,
  extractPhrases,
  tokenize,
  Section,
  Block,
  Sentence,
  Phrase,
  Token,
} from '../breaking';
import { generateContentSignature, ContentSignature } from '../breaking/signature-generator';

/**
 * Blob: Content-addressed binary storage
 */
export interface Blob {
  blob_id: string;           // blob_abc123...
  hash: string;              // SHA-256
  size_bytes: number;
  encoding: string;          // utf8
  data_tag: string;          // For test isolation (e.g., 'test', 'manual', 'prod')
  created_at: number;        // Unix timestamp
  original_path?: string;    // Source file path
}

/**
 * Node Span: Virtual node referencing byte range(s) in blob(s)
 */
export interface NodeSpan {
  node_id: string;           // Generated from node metadata
  node_key: string;          // nk_def456... (stable across re-ingests)
  blob_hash: string;         // References blob
  byte_start: number;
  byte_end: number;
  encoding: string;          // utf8
  offset_kind: string;       // byte
  level: 'token' | 'phrase' | 'sentence' | 'block' | 'section' | 'message' | 'conversation';
  modality: 'code' | 'prose' | 'math' | 'json' | 'csv' | 'markdown' | 'html';
  parent_node_id?: string;   // Parent in hierarchy
  data_tag: string;          // For test isolation
  created_at: number;
}

/**
 * Node Signature: MinHash, TF-IDF, structural signatures
 */
export interface NodeSignature {
  node_id: string;
  content_id: string;        // cid_789abc... (for deduplication)
  minhash: number[];         // 128-element array
  minhash_bands?: string[];  // LSH band hashes
  tfidf_vector?: Record<string, number>;
  token_sketch?: string;     // For code: "op|ident|num|..."
  structural_path: string;   // "h1[2]|h2[5]|p[3]"
  data_tag: string;          // For test isolation
  created_at: number;
}

/**
 * Processed content with all breaking levels
 */
export interface ProcessedContent {
  blob: Blob;
  spans: NodeSpan[];
  signatures: NodeSignature[];
  sections: Section[];
  blocks: Block[];
  sentences: Sentence[];
  phrases: Phrase[];
  tokens: Token[];
  normalization: NormalizationResult;
}

/**
 * Processing configuration
 */
export interface ProcessingConfig {
  /**
   * Extract tokens (default: true)
   */
  extractTokens?: boolean;

  /**
   * Extract phrases (default: true)
   */
  extractPhrases?: boolean;

  /**
   * Extract sentences (default: true)
   */
  extractSentences?: boolean;

  /**
   * Extract blocks (default: true)
   */
  extractBlocks?: boolean;

  /**
   * Extract sections (default: true)
   */
  extractSections?: boolean;

  /**
   * Generate signatures (default: true)
   */
  generateSignatures?: boolean;

  /**
   * MinHash permutations (default: 128)
   */
  minHashPermutations?: number;

  /**
   * Generate LSH bands (default: true)
   */
  generateLshBands?: boolean;

  /**
   * Number of LSH bands (default: 16)
   */
  lshBandsCount?: number;
}

const DEFAULT_CONFIG: ProcessingConfig = {
  extractTokens: true,
  extractPhrases: true,
  extractSentences: true,
  extractBlocks: true,
  extractSections: true,
  generateSignatures: true,
  minHashPermutations: 128,
  generateLshBands: true,
  lshBandsCount: 16,
};

/**
 * Content Processor: Apply breaking pipeline to content
 */
export class ContentProcessor {
  private config: ProcessingConfig;

  constructor(config: ProcessingConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process a single message
   */
  async processMessage(
    message: NormalizedMessage,
    conversationId: string,
    conversationContext: string
  ): Promise<ProcessedContent> {
    return this.processText(
      message.content,
      'message',
      {
        conversation_id: conversationId,
        message_role: message.role,
        message_index: message.index,
      },
      conversationContext
    );
  }

  /**
   * Process entire conversation
   */
  async processConversation(
    conversation: NormalizedConversation
  ): Promise<ProcessedContent[]> {
    // Combine all messages into context for structural signatures
    const fullContext = conversation.messages.map(m => m.content).join('\n\n---\n\n');

    const results: ProcessedContent[] = [];

    for (const message of conversation.messages) {
      const processed = await this.processMessage(
        message,
        conversation.conversation_id,
        fullContext
      );
      results.push(processed);
    }

    return results;
  }

  /**
   * Process arbitrary text with breaking pipeline
   */
  async processText(
    text: string,
    level: NodeSpan['level'] = 'message',
    metadata: Record<string, any> = {},
    contextText?: string,
    dataTag: string = 'manual'
  ): Promise<ProcessedContent> {
    const now = Math.floor(Date.now() / 1000);

    // Step 1: Normalize text
    const normalized = normalizeText(text);

    // Step 2: Create blob
    const blobBuffer = Buffer.from(normalized.normalized, 'utf8');
    const blobId = generateBlobId(blobBuffer);
    const blob: Blob = {
      blob_id: blobId,
      hash: normalized.hash,
      size_bytes: blobBuffer.length,
      encoding: 'utf8',
      data_tag: dataTag,
      created_at: now,
    };

    // Step 3: Apply breaking pipeline
    const sections = this.config.extractSections
      ? extractSections(normalized.normalized)
      : [];

    const blocks = this.config.extractBlocks
      ? extractBlocks(normalized.normalized)
      : [];

    const sentences = this.config.extractSentences
      ? extractSentences(normalized.normalized)
      : [];

    const phrases = this.config.extractPhrases
      ? extractPhrases(normalized.normalized)
      : [];

    const tokens = this.config.extractTokens
      ? tokenize(normalized.normalized)
      : [];

    // Step 4: Create node spans for each level
    const spans: NodeSpan[] = [];
    const signatures: NodeSignature[] = [];

    // Root span (entire message/document)
    const rootNodeId = `node_${blobId}_root`;
    const rootNodeKey = generateNodeKey(blobId, level, 'prose', 0, blobBuffer.length);
    const rootContentId = generateContentId(normalized.normalized);

    spans.push({
      node_id: rootNodeId,
      node_key: rootNodeKey,
      blob_hash: blob.hash,
      byte_start: 0,
      byte_end: blobBuffer.length,
      encoding: 'utf8',
      offset_kind: 'byte',
      level,
      modality: 'prose',
      data_tag: dataTag,
      created_at: now,
    });

    // Generate signature for root
    if (this.config.generateSignatures) {
      // Map message/conversation level to breaking level for signature generation
      const signatureLevel: 'token' | 'phrase' | 'sentence' | 'block' | 'section' =
        level === 'message' || level === 'conversation' ? 'section' : level;

      const signature = generateContentSignature(
        normalized.normalized,
        0,
        blobBuffer.length,
        signatureLevel,
        contextText || normalized.normalized,
        {
          numPermutations: this.config.minHashPermutations,
        }
      );

      signatures.push(this.contentSignatureToNodeSignature(
        rootNodeId,
        signature,
        now,
        dataTag
      ));
    }

    // Section spans
    for (const section of sections) {
      const sectionNodeId = `node_${blobId}_sec_${section.id}`;
      const sectionNodeKey = generateNodeKey(
        blobId,
        'section',
        'prose',
        section.start,
        section.end
      );

      spans.push({
        node_id: sectionNodeId,
        node_key: sectionNodeKey,
        blob_hash: blob.hash,
        byte_start: section.start,
        byte_end: section.end,
        encoding: 'utf8',
        offset_kind: 'byte',
        level: 'section',
        modality: 'prose',
        parent_node_id: rootNodeId,
        data_tag: dataTag,
        created_at: now,
      });

      // Generate signature for section
      if (this.config.generateSignatures) {
        const signature = generateContentSignature(
          section.text,
          section.start,
          section.end,
          'section',
          contextText || normalized.normalized,
          {
            numPermutations: this.config.minHashPermutations,
          }
        );

        signatures.push(this.contentSignatureToNodeSignature(
          sectionNodeId,
          signature,
          now,
          dataTag
        ));
      }
    }

    // Block spans
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const blockNodeId = `node_${blobId}_block_${i}`;
      const blockModality = this.inferBlockModality(block);
      const blockNodeKey = generateNodeKey(
        blobId,
        'block',
        blockModality,
        block.start,
        block.end
      );

      // Find parent section
      const parentSection = sections.find(
        s => s.start <= block.start && s.end >= block.end
      );

      spans.push({
        node_id: blockNodeId,
        node_key: blockNodeKey,
        blob_hash: blob.hash,
        byte_start: block.start,
        byte_end: block.end,
        encoding: 'utf8',
        offset_kind: 'byte',
        level: 'block',
        modality: blockModality,
        parent_node_id: parentSection
          ? `node_${blobId}_sec_${parentSection.id}`
          : rootNodeId,
        data_tag: dataTag,
        created_at: now,
      });

      // Generate signature for block
      if (this.config.generateSignatures) {
        const signature = generateContentSignature(
          block.text,
          block.start,
          block.end,
          'block',
          contextText || normalized.normalized,
          {
            numPermutations: this.config.minHashPermutations,
            modality: blockModality === 'code' ? 'code' : 'prose',
          }
        );

        signatures.push(this.contentSignatureToNodeSignature(
          blockNodeId,
          signature,
          now,
          dataTag
        ));
      }
    }

    // Sentence spans (only for first N sentences to avoid explosion)
    const maxSentences = 100;
    for (let i = 0; i < Math.min(sentences.length, maxSentences); i++) {
      const sentence = sentences[i];
      const sentenceNodeId = `node_${blobId}_sent_${i}`;
      const sentenceNodeKey = generateNodeKey(
        blobId,
        'sentence',
        'prose',
        sentence.start,
        sentence.end
      );

      // Find parent block
      const parentBlock = blocks.find(
        b => b.start <= sentence.start && b.end >= sentence.end
      );

      spans.push({
        node_id: sentenceNodeId,
        node_key: sentenceNodeKey,
        blob_hash: blob.hash,
        byte_start: sentence.start,
        byte_end: sentence.end,
        encoding: 'utf8',
        offset_kind: 'byte',
        level: 'sentence',
        modality: 'prose',
        parent_node_id: parentBlock
          ? `node_${blobId}_block_${blocks.indexOf(parentBlock)}`
          : rootNodeId,
        data_tag: dataTag,
        created_at: now,
      });
    }

    return {
      blob,
      spans,
      signatures,
      sections,
      blocks,
      sentences,
      phrases,
      tokens,
      normalization: normalized,
    };
  }

  /**
   * Convert ContentSignature to NodeSignature
   */
  private contentSignatureToNodeSignature(
    nodeId: string,
    signature: ContentSignature,
    timestamp: number,
    dataTag: string
  ): NodeSignature {
    return {
      node_id: nodeId,
      content_id: signature.contentId,
      minhash: signature.minHash.hashes,
      tfidf_vector: signature.tfIdf?.terms,
      token_sketch: signature.tokenSketch?.sketch,
      structural_path: signature.structural.path,
      data_tag: dataTag,
      created_at: timestamp,
    };
  }

  /**
   * Infer modality from block type
   */
  private inferBlockModality(block: Block): 'code' | 'prose' | 'math' | 'json' | 'csv' | 'markdown' | 'html' {
    switch (block.type) {
      case 'code_fence':
        return 'code';
      case 'equation':
        return 'math';
      case 'table':
        return 'csv';
      default:
        return 'prose';
    }
  }

  /**
   * Batch process multiple conversations
   */
  async processConversations(
    conversations: NormalizedConversation[]
  ): Promise<ProcessedContent[][]> {
    const results: ProcessedContent[][] = [];

    for (const conversation of conversations) {
      const processed = await this.processConversation(conversation);
      results.push(processed);
    }

    return results;
  }
}

/**
 * Helper: Create content processor with default config
 */
export function createContentProcessor(config?: ProcessingConfig): ContentProcessor {
  return new ContentProcessor(config);
}

/**
 * Helper: Process single text quickly
 */
export async function processText(text: string, config?: ProcessingConfig): Promise<ProcessedContent> {
  const processor = new ContentProcessor(config);
  return processor.processText(text);
}
