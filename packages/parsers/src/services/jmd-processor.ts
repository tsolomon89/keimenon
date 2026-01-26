/**
 * J+MD Processor: ChatRecord integration with J+MD surface
 *
 * Converts parsed conversations to ChatRecords with:
 * - raw_text: Verbatim original
 * - md: Normalized CommonMark+GFM
 * - md_char_start/end: Stable byte addressing on md
 * - islands: Code/math blocks detected
 * - md_norm_sha256: Deterministic hash
 *
 * Maps existing node spans back to J+MD provenance
 */

import * as crypto from 'crypto';
import { ChatRecord, ContentIsland } from '@keimenon/types';
import { NormalizedMessage } from '../types';
import { MarkdownNormalizer } from '../normalizers/markdown-normalizer';
import { NodeSpan, ProcessedContent } from './content-processor';

/**
 * J+MD conversion result
 */
export interface JmdConversionResult {
  chatRecord: ChatRecord;
  spanMappings: JmdSpanMapping[];
}

/**
 * Mapping from node span to J+MD coordinates
 */
export interface JmdSpanMapping {
  node_id: string;
  node_level: string;

  // Original span (in raw blob)
  blob_hash: string;
  byte_start: number;
  byte_end: number;

  // J+MD coordinates
  chat_record_id: string;
  md_char_start: number;
  md_char_end: number;
  raw_text_start: number;
  raw_text_end: number;

  // Island info (if span is inside code/math)
  island_index?: number;
  island_type?: 'code' | 'math';
}

/**
 * J+MD Processor
 */
export class JmdProcessor {
  private markdownNormalizer: MarkdownNormalizer;

  constructor() {
    this.markdownNormalizer = new MarkdownNormalizer({
      stripMarkup: false,
      normalizeWhitespace: true,
      stripHtml: false,
      inlineLinks: false,
      preserveCodeIslands: true,
    });
  }

  /**
   * Convert NormalizedMessage to ChatRecord
   */
  convertMessage(message: NormalizedMessage, conversationId: string): JmdConversionResult {
    const rawText = message.content;

    // Normalize to Markdown
    const normalized = this.markdownNormalizer.normalize(rawText);
    const md = normalized.normalized;

    // Detect islands
    const islands = this.detectIslands(md);

    // Compute md hash
    const mdNormSha256 = this.computeSha256(md);

    // Create ChatRecord
    const chatRecord: ChatRecord = {
      id: `chat_${message.hash}_${message.index}`,
      conversation_id: conversationId,
      role: message.role as any,
      raw_text: rawText,
      md,
      md_norm_sha256: mdNormSha256,
      islands,
      timestamp: message.timestamp || Date.now(),
      metadata: message.metadata,
    };

    // Create span mappings (for existing nodes)
    const spanMappings: JmdSpanMapping[] = [];

    return {
      chatRecord,
      spanMappings,
    };
  }

  /**
   * Map existing node spans to J+MD coordinates
   */
  mapSpansToJmd(processed: ProcessedContent, chatRecord: ChatRecord): JmdSpanMapping[] {
    const mappings: JmdSpanMapping[] = [];

    for (const span of processed.spans) {
      // Extract text from blob using byte offsets
      const spanText = processed.normalization.normalized.substring(span.byte_start, span.byte_end);

      // Find span in md (approximate)
      const mdCharStart = chatRecord.md.indexOf(spanText);
      if (mdCharStart === -1) {
        // Span not found in md (might be in raw_text only)
        continue;
      }

      const mdCharEnd = mdCharStart + spanText.length;

      // Find in raw_text
      const rawTextStart = chatRecord.raw_text.indexOf(spanText);
      const rawTextEnd = rawTextStart >= 0 ? rawTextStart + spanText.length : -1;

      // Check if inside island
      const island = this.findContainingIsland(chatRecord.islands, mdCharStart, mdCharEnd);

      const mapping: JmdSpanMapping = {
        node_id: span.node_id,
        node_level: span.level,
        blob_hash: span.blob_hash,
        byte_start: span.byte_start,
        byte_end: span.byte_end,
        chat_record_id: chatRecord.id,
        md_char_start: mdCharStart,
        md_char_end: mdCharEnd,
        raw_text_start: rawTextStart,
        raw_text_end: rawTextEnd,
        island_index: island?.index,
        island_type: island?.type,
      };

      mappings.push(mapping);
    }

    return mappings;
  }

  /**
   * Detect code and math islands in md
   */
  private detectIslands(md: string): ContentIsland[] {
    const islands: ContentIsland[] = [];

    // Detect fenced code blocks
    const codeFenceRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;

    while ((match = codeFenceRegex.exec(md)) !== null) {
      const language = match[1] || 'text';
      const content = match[2];
      const mdCharStart = match.index;
      const mdCharEnd = match.index + match[0].length;

      islands.push({
        type: 'code',
        language,
        md_char_start: mdCharStart,
        md_char_end: mdCharEnd,
        content,
        fence_type: '```',
      });
    }

    // Detect inline code
    const inlineCodeRegex = /`([^`]+)`/g;
    while ((match = inlineCodeRegex.exec(md)) !== null) {
      const content = match[1];
      const mdCharStart = match.index;
      const mdCharEnd = match.index + match[0].length;

      islands.push({
        type: 'code',
        language: 'inline',
        md_char_start: mdCharStart,
        md_char_end: mdCharEnd,
        content,
        fence_type: '`',
      });
    }

    // Detect display math ($$...$$)
    const displayMathRegex = /\$\$([\s\S]*?)\$\$/g;
    while ((match = displayMathRegex.exec(md)) !== null) {
      const content = match[1];
      const mdCharStart = match.index;
      const mdCharEnd = match.index + match[0].length;

      islands.push({
        type: 'math',
        md_char_start: mdCharStart,
        md_char_end: mdCharEnd,
        content,
        math_delim: '$$',
      });
    }

    // Detect inline math ($...$)
    const inlineMathRegex = /\$([^\$]+)\$/g;
    while ((match = inlineMathRegex.exec(md)) !== null) {
      const content = match[1];
      const mdCharStart = match.index;
      const mdCharEnd = match.index + match[0].length;

      islands.push({
        type: 'math',
        md_char_start: mdCharStart,
        md_char_end: mdCharEnd,
        content,
        math_delim: '$',
      });
    }

    // Sort by start position
    islands.sort((a, b) => a.md_char_start - b.md_char_start);

    return islands;
  }

  /**
   * Find island containing span
   */
  private findContainingIsland(
    islands: ContentIsland[],
    mdCharStart: number,
    mdCharEnd: number
  ): { index: number; type: 'code' | 'math' } | null {
    for (let i = 0; i < islands.length; i++) {
      const island = islands[i];
      if (mdCharStart >= island.md_char_start && mdCharEnd <= island.md_char_end) {
        return { index: i, type: island.type };
      }
    }
    return null;
  }

  /**
   * Compute SHA-256 hash
   */
  private computeSha256(text: string): string {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  }

  /**
   * Batch convert messages to ChatRecords
   */
  convertMessages(messages: NormalizedMessage[], conversationId: string): JmdConversionResult[] {
    return messages.map((msg) => this.convertMessage(msg, conversationId));
  }

  /**
   * Extract code islands from ChatRecord
   */
  getCodeIslands(chatRecord: ChatRecord): ContentIsland[] {
    return chatRecord.islands.filter((i) => i.type === 'code');
  }

  /**
   * Extract math islands from ChatRecord
   */
  getMathIslands(chatRecord: ChatRecord): ContentIsland[] {
    return chatRecord.islands.filter((i) => i.type === 'math');
  }

  /**
   * Get text from ChatRecord by md coordinates
   */
  getTextByMdCoords(chatRecord: ChatRecord, mdCharStart: number, mdCharEnd: number): string {
    return chatRecord.md.substring(mdCharStart, mdCharEnd);
  }

  /**
   * Get text from ChatRecord by raw_text coordinates
   */
  getTextByRawCoords(chatRecord: ChatRecord, rawTextStart: number, rawTextEnd: number): string {
    return chatRecord.raw_text.substring(rawTextStart, rawTextEnd);
  }

  /**
   * Check if span is inside an island
   */
  isInIsland(chatRecord: ChatRecord, mdCharStart: number, mdCharEnd: number): boolean {
    return this.findContainingIsland(chatRecord.islands, mdCharStart, mdCharEnd) !== null;
  }
}

/**
 * Helper: Create J+MD processor
 */
export function createJmdProcessor(): JmdProcessor {
  return new JmdProcessor();
}
