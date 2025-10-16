/**
 * ChatRecord: J+MD surface (JSON + Markdown)
 *
 * Every conversational turn has:
 * - raw_text: Verbatim original (HTML, Markdown, plaintext)
 * - md: Normalized CommonMark+GFM representation
 *
 * This dual surface enables:
 * - Stable byte addressing on md (md_char_start/end)
 * - Perfect provenance via raw_text
 * - Deterministic hashing (md_norm_sha256)
 */

/**
 * Code or math island detected in md
 */
export interface ContentIsland {
  type: 'code' | 'math';
  language?: string;        // For code: js, python, etc.
  md_char_start: number;    // Start offset in md
  md_char_end: number;      // End offset in md
  content: string;          // Island content
  fence_type?: string;      // For code: triple backtick, indent, etc.
  math_delim?: string;      // For math: $, $$, \[, etc.
}

/**
 * ChatRecord: Single conversational turn
 */
export interface ChatRecord {
  /**
   * Unique record ID
   */
  id: string;

  /**
   * Conversation ID this record belongs to
   */
  conversation_id: string;

  /**
   * Role: user, assistant, system, tool
   */
  role: 'user' | 'assistant' | 'system' | 'tool';

  /**
   * Raw text (verbatim from source)
   * May be HTML, Markdown, or plaintext
   */
  raw_text: string;

  /**
   * Normalized Markdown (CommonMark + GFM)
   * This is the stable surface for clustering
   */
  md: string;

  /**
   * SHA-256 of md (for deterministic hashing)
   */
  md_norm_sha256: string;

  /**
   * Code/math islands detected in md
   */
  islands: ContentIsland[];

  /**
   * Timestamp
   */
  timestamp: number;

  /**
   * Metadata
   */
  metadata?: Record<string, any>;
}

/**
 * ChatRecord creation result
 */
export interface ChatRecordResult {
  record: ChatRecord;
  normalization_applied: boolean;
  islands_found: number;
}
