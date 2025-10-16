/**
 * Blocker: Extract blocks (paragraphs, code fences, tables, equations)
 *
 * Blocks are the fundamental unit for grouping:
 * - Paragraphs (prose blocks)
 * - Code fences (code blocks)
 * - Tables (tabular data)
 * - Equations (math blocks)
 */

export interface Block {
  text: string;
  start: number;           // Byte offset
  end: number;             // Byte offset
  type: 'paragraph' | 'code_fence' | 'table' | 'equation' | 'list' | 'blockquote';
  index: number;           // Block number (0-indexed)
  metadata?: {
    language?: string;     // For code fences
    headers?: string[];    // For tables
    level?: number;        // For lists
  };
}

export interface BlockerConfig {
  modality?: 'markdown' | 'code' | 'auto';
  minBlockSize?: number;  // Min characters for a block (default: 10)
}

const DEFAULT_CONFIG: BlockerConfig = {
  modality: 'auto',
  minBlockSize: 10,
};

/**
 * Extract blocks from text
 */
export function extractBlocks(
  text: string,
  config: BlockerConfig = {}
): Block[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Determine modality
  let modality = cfg.modality;
  if (modality === 'auto') {
    modality = detectModality(text);
  }

  if (modality === 'markdown') {
    return extractMarkdownBlocks(text, cfg.minBlockSize!);
  } else if (modality === 'code') {
    return extractCodeBlocks(text, cfg.minBlockSize!);
  }

  // Fallback: paragraph-based splitting
  return extractParagraphBlocks(text, cfg.minBlockSize!);
}

/**
 * Extract blocks from markdown
 */
function extractMarkdownBlocks(text: string, minSize: number): Block[] {
  const blocks: Block[] = [];
  let index = 0;

  // Split by double newlines (paragraph boundaries)
  const parts = text.split(/\n\n+/);
  let offset = 0;

  for (const part of parts) {
    if (part.trim().length < minSize) {
      offset += part.length + 2; // +2 for \n\n
      continue;
    }

    const trimmed = part.trim();
    const byteStart = Buffer.byteLength(text.slice(0, offset), 'utf8');
    const byteEnd = byteStart + Buffer.byteLength(trimmed, 'utf8');

    // Detect block type
    const blockType = detectMarkdownBlockType(trimmed);

    blocks.push({
      text: trimmed,
      start: byteStart,
      end: byteEnd,
      type: blockType.type,
      index,
      metadata: blockType.metadata,
    });

    index++;
    offset += part.length + 2;
  }

  return blocks;
}

/**
 * Detect markdown block type
 */
function detectMarkdownBlockType(text: string): {
  type: Block['type'];
  metadata?: Block['metadata'];
} {
  // Code fence
  if (text.startsWith('```')) {
    const languageMatch = text.match(/^```(\w+)/);
    return {
      type: 'code_fence',
      metadata: { language: languageMatch?.[1] || 'text' },
    };
  }

  // Table (has pipes)
  if (text.includes('|') && text.split('\n').length > 1) {
    return { type: 'table' };
  }

  // Blockquote
  if (text.startsWith('>')) {
    return { type: 'blockquote' };
  }

  // List
  if (/^[\s]*[-*+]\s/.test(text) || /^[\s]*\d+\.\s/.test(text)) {
    return { type: 'list' };
  }

  // Equation (LaTeX)
  if (text.includes('\\begin{equation}') || text.includes('$$')) {
    return { type: 'equation' };
  }

  // Default: paragraph
  return { type: 'paragraph' };
}

/**
 * Extract blocks from code
 */
function extractCodeBlocks(text: string, minSize: number): Block[] {
  const blocks: Block[] = [];
  let index = 0;

  // Code blocks are typically separated by blank lines or function boundaries
  const parts = text.split(/\n\n+/);
  let offset = 0;

  for (const part of parts) {
    if (part.trim().length < minSize) {
      offset += part.length + 2;
      continue;
    }

    const trimmed = part.trim();
    const byteStart = Buffer.byteLength(text.slice(0, offset), 'utf8');
    const byteEnd = byteStart + Buffer.byteLength(trimmed, 'utf8');

    blocks.push({
      text: trimmed,
      start: byteStart,
      end: byteEnd,
      type: 'code_fence',
      index,
    });

    index++;
    offset += part.length + 2;
  }

  return blocks;
}

/**
 * Extract paragraph blocks (fallback)
 */
function extractParagraphBlocks(text: string, minSize: number): Block[] {
  const blocks: Block[] = [];
  let index = 0;

  // Split by double newlines
  const parts = text.split(/\n\n+/);
  let offset = 0;

  for (const part of parts) {
    if (part.trim().length < minSize) {
      offset += part.length + 2;
      continue;
    }

    const trimmed = part.trim();
    const byteStart = Buffer.byteLength(text.slice(0, offset), 'utf8');
    const byteEnd = byteStart + Buffer.byteLength(trimmed, 'utf8');

    blocks.push({
      text: trimmed,
      start: byteStart,
      end: byteEnd,
      type: 'paragraph',
      index,
    });

    index++;
    offset += part.length + 2;
  }

  return blocks;
}

/**
 * Detect text modality
 */
function detectModality(text: string): 'markdown' | 'code' {
  // Check for markdown indicators
  const markdownIndicators = [
    /^#{1,6}\s/m,           // Headings
    /\[.+\]\(.+\)/,         // Links
    /!\[.+\]\(.+\)/,        // Images
    /^>\s/m,                // Blockquotes
    /^[-*+]\s/m,            // Lists
    /```/,                  // Code fences
  ];

  for (const pattern of markdownIndicators) {
    if (pattern.test(text)) {
      return 'markdown';
    }
  }

  // Check for code indicators
  const codeIndicators = [
    /function\s+\w+/,
    /const\s+\w+\s*=/,
    /class\s+\w+/,
    /def\s+\w+/,
    /public\s+(static\s+)?void/,
    /import\s+/,
  ];

  for (const pattern of codeIndicators) {
    if (pattern.test(text)) {
      return 'code';
    }
  }

  // Default to markdown (prose)
  return 'markdown';
}

/**
 * Get block at specific byte offset
 */
export function getBlockAtOffset(blocks: Block[], offset: number): Block | null {
  for (const block of blocks) {
    if (offset >= block.start && offset < block.end) {
      return block;
    }
  }
  return null;
}

/**
 * Filter blocks by type
 */
export function filterBlocksByType(
  blocks: Block[],
  type: Block['type']
): Block[] {
  return blocks.filter((b) => b.type === type);
}

/**
 * Merge adjacent blocks of same type
 */
export function mergeAdjacentBlocks(blocks: Block[]): Block[] {
  if (blocks.length === 0) return [];

  const merged: Block[] = [];
  let current = { ...blocks[0] };

  for (let i = 1; i < blocks.length; i++) {
    const next = blocks[i];

    // If same type and adjacent, merge
    if (next.type === current.type && next.start === current.end) {
      current.text += '\n\n' + next.text;
      current.end = next.end;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);

  // Re-index
  return merged.map((b, i) => ({ ...b, index: i }));
}

/**
 * Batch extract blocks from multiple texts
 */
export function extractBlocksBatch(
  texts: string[],
  config: BlockerConfig = {}
): Block[][] {
  return texts.map((text) => extractBlocks(text, config));
}
