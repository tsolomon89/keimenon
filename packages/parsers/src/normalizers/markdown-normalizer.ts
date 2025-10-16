import { generateContentId } from '../utils/id-generator';

/**
 * Configuration for Markdown normalization
 */
export interface MarkdownNormalizerConfig {
  /**
   * Strip markup and extract semantic text only
   * Default: true
   */
  stripMarkup: boolean;

  /**
   * Preserve code blocks as separate islands
   * Returns byte offsets of code fences
   * Default: true
   */
  preserveCodeIslands: boolean;

  /**
   * Normalize whitespace in prose (not in code)
   * Default: true
   */
  normalizeWhitespace: boolean;

  /**
   * Strip HTML tags
   * Default: true
   */
  stripHtml: boolean;

  /**
   * Convert reference-style links to inline
   * Default: false (preserve structure)
   */
  inlineLinks: boolean;
}

/**
 * Code island (code fence in markdown)
 */
export interface CodeIsland {
  start: number;        // Byte offset in original
  end: number;          // Byte offset in original
  language: string;     // Language tag (js, python, etc.)
  code: string;         // Raw code content
}

/**
 * Result of Markdown normalization
 */
export interface MarkdownNormalizationResult {
  /**
   * Normalized text (semantic content without markup)
   */
  normalized: string;

  /**
   * Content ID (hash of normalized text)
   */
  content_id: string;

  /**
   * Code islands found in document
   */
  codeIslands: CodeIsland[];

  /**
   * Extracted headings
   */
  headings: Array<{
    level: number;
    text: string;
    start: number;
    end: number;
  }>;

  /**
   * Original vs normalized size
   */
  originalSize: number;
  normalizedSize: number;

  /**
   * Normalization steps applied
   */
  stepsApplied: string[];
}

const DEFAULT_CONFIG: MarkdownNormalizerConfig = {
  stripMarkup: true,
  preserveCodeIslands: true,
  normalizeWhitespace: true,
  stripHtml: true,
  inlineLinks: false,
};

/**
 * Markdown normalizer for semantic text extraction
 *
 * Converts markdown to plain text while preserving:
 * - Code blocks as separate islands (with byte offsets)
 * - Heading structure (for sectioning)
 * - Semantic meaning (not formatting)
 *
 * Example:
 * ```
 * const normalizer = new MarkdownNormalizer();
 * const result = normalizer.normalize(markdown);
 * // result.normalized: Plain text without markup
 * // result.codeIslands: [{start, end, language, code}, ...]
 * ```
 */
export class MarkdownNormalizer {
  constructor(private config: MarkdownNormalizerConfig = DEFAULT_CONFIG) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Normalize markdown to semantic text
   */
  normalize(markdown: string): MarkdownNormalizationResult {
    const originalSize = markdown.length;
    const stepsApplied: string[] = [];
    const codeIslands: CodeIsland[] = [];
    const headings: Array<{ level: number; text: string; start: number; end: number }> = [];

    let text = markdown;

    // 1. Extract code blocks (preserve as islands)
    if (this.config.preserveCodeIslands) {
      const extraction = this.extractCodeBlocks(text);
      codeIslands.push(...extraction.islands);
      text = extraction.textWithoutCode;
      stepsApplied.push('extract_code_blocks');
    }

    // 2. Extract headings (for structural signatures)
    const headingExtraction = this.extractHeadings(text);
    headings.push(...headingExtraction);
    stepsApplied.push('extract_headings');

    // 3. Strip HTML tags
    if (this.config.stripHtml) {
      text = this.stripHtmlTags(text);
      stepsApplied.push('strip_html');
    }

    // 4. Strip markdown formatting
    if (this.config.stripMarkup) {
      text = this.stripMarkdown(text);
      stepsApplied.push('strip_markdown');
    }

    // 5. Normalize whitespace
    if (this.config.normalizeWhitespace) {
      text = this.normalizeWhitespace(text);
      stepsApplied.push('normalize_whitespace');
    }

    const normalizedSize = text.length;
    const content_id = generateContentId(text);

    return {
      normalized: text,
      content_id,
      codeIslands,
      headings,
      originalSize,
      normalizedSize,
      stepsApplied,
    };
  }

  /**
   * Extract code blocks and replace with placeholder
   */
  private extractCodeBlocks(text: string): {
    textWithoutCode: string;
    islands: CodeIsland[];
  } {
    const islands: CodeIsland[] = [];
    let result = text;

    // Match fenced code blocks: ```lang\n...\n```
    const fenceRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;

    while ((match = fenceRegex.exec(text)) !== null) {
      const language = match[1] || 'text';
      const code = match[2];
      const start = match.index;
      const end = match.index + match[0].length;

      islands.push({
        start,
        end,
        language,
        code,
      });
    }

    // Remove code blocks from text (replace with placeholder)
    result = text.replace(fenceRegex, '\n[CODE_BLOCK]\n');

    return { textWithoutCode: result, islands };
  }

  /**
   * Extract heading structure
   */
  private extractHeadings(text: string): Array<{
    level: number;
    text: string;
    start: number;
    end: number;
  }> {
    const headings: Array<{ level: number; text: string; start: number; end: number }> = [];

    // Match ATX headings: # Heading
    const atxRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;

    while ((match = atxRegex.exec(text)) !== null) {
      const level = match[1].length;
      const headingText = match[2].trim();
      const start = match.index;
      const end = match.index + match[0].length;

      headings.push({
        level,
        text: headingText,
        start,
        end,
      });
    }

    return headings;
  }

  /**
   * Strip HTML tags
   */
  private stripHtmlTags(text: string): string {
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // Remove HTML tags (simple approach)
    text = text.replace(/<[^>]+>/g, '');

    return text;
  }

  /**
   * Strip markdown formatting
   */
  private stripMarkdown(text: string): string {
    // Bold/italic: **text** or *text*
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');
    text = text.replace(/_([^_]+)_/g, '$1');

    // Inline code: `code`
    text = text.replace(/`([^`]+)`/g, '$1');

    // Links: [text](url)
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Images: ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

    // Headings: # Heading
    text = text.replace(/^#{1,6}\s+/gm, '');

    // Blockquotes: > text
    text = text.replace(/^>\s+/gm, '');

    // Lists: - item or 1. item
    text = text.replace(/^[\s]*[-*+]\s+/gm, '');
    text = text.replace(/^[\s]*\d+\.\s+/gm, '');

    // Horizontal rules: --- or ***
    text = text.replace(/^[-*_]{3,}$/gm, '');

    // Tables (simple removal)
    text = text.replace(/\|/g, ' ');

    return text;
  }

  /**
   * Normalize whitespace (multiple spaces → single, trim lines)
   */
  private normalizeWhitespace(text: string): string {
    // Multiple spaces to single
    text = text.replace(/ {2,}/g, ' ');

    // Multiple newlines to double (paragraph break)
    text = text.replace(/\n{3,}/g, '\n\n');

    // Trim each line
    text = text
      .split('\n')
      .map((line) => line.trim())
      .join('\n');

    // Trim overall
    return text.trim();
  }
}

/**
 * Quick normalize function with default config
 */
export function normalizeMarkdown(markdown: string): string {
  const normalizer = new MarkdownNormalizer();
  const result = normalizer.normalize(markdown);
  return result.content_id;
}

/**
 * Extract just the semantic text (no islands, no metadata)
 */
export function extractSemanticText(markdown: string): string {
  const normalizer = new MarkdownNormalizer();
  const result = normalizer.normalize(markdown);
  return result.normalized;
}

/**
 * Extract code blocks only
 */
export function extractCodeBlocks(markdown: string): CodeIsland[] {
  const normalizer = new MarkdownNormalizer({
    ...DEFAULT_CONFIG,
    preserveCodeIslands: true
  });
  const result = normalizer.normalize(markdown);
  return result.codeIslands;
}

/**
 * Extract heading structure
 */
export function extractHeadings(markdown: string): Array<{
  level: number;
  text: string;
  start: number;
  end: number;
}> {
  const normalizer = new MarkdownNormalizer();
  const result = normalizer.normalize(markdown);
  return result.headings;
}
