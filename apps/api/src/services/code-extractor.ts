import { EventEmitter } from 'events';
import { createHash } from 'crypto';

export interface CodeBlock {
  id: string;
  language: string;
  code: string;
  hash: string;
  messageId: string;
  conversationId: string;
  metadata: {
    lineCount: number;
    charCount: number;
    isFenced: boolean;
    hasComments: boolean;
  };
}

export interface CodeExtractionConfig {
  minLength: number;
  deduplicate: boolean;
  extractInline: boolean;
  languages: string[];
}

/**
 * Code Extractor - Extract code blocks from conversation messages
 */
export class CodeExtractor extends EventEmitter {
  private config: CodeExtractionConfig;
  private codeBlocks: CodeBlock[] = [];
  private hashIndex: Map<string, CodeBlock> = new Map();

  // Language detection patterns
  private static readonly LANGUAGE_EXTENSIONS: Record<string, string> = {
    javascript: 'js',
    typescript: 'ts',
    python: 'py',
    java: 'java',
    cpp: 'cpp',
    'c++': 'cpp',
    c: 'c',
    csharp: 'cs',
    'c#': 'cs',
    go: 'go',
    rust: 'rs',
    ruby: 'rb',
    php: 'php',
    swift: 'swift',
    kotlin: 'kt',
    scala: 'scala',
    html: 'html',
    css: 'css',
    sql: 'sql',
    bash: 'sh',
    shell: 'sh',
    sh: 'sh',
    json: 'json',
    yaml: 'yaml',
    xml: 'xml',
    markdown: 'md',
    md: 'md',
  };

  constructor(config: Partial<CodeExtractionConfig> = {}) {
    super();

    this.config = {
      minLength: config.minLength || 10,
      deduplicate: config.deduplicate !== undefined ? config.deduplicate : true,
      extractInline: config.extractInline !== undefined ? config.extractInline : false,
      languages: config.languages || [],
    };
  }

  /**
   * Extract code blocks from messages
   */
  async extractFromMessages(messages: Array<{
    id: string;
    content: string;
    conversationId: string;
    role: string;
  }>): Promise<CodeBlock[]> {
    this.codeBlocks = [];
    this.hashIndex.clear();

    for (const message of messages) {
      // Skip user messages unless configured otherwise
      if (message.role === 'user' && !this.config.extractInline) {
        continue;
      }

      const blocks = this.extractFromText(
        message.content,
        message.id,
        message.conversationId
      );

      for (const block of blocks) {
        this.addCodeBlock(block);
      }
    }

    this.emit('complete', {
      totalBlocks: this.codeBlocks.length,
      uniqueBlocks: this.hashIndex.size,
      duplicatesRemoved: this.codeBlocks.length - this.hashIndex.size,
    });

    return this.codeBlocks;
  }

  /**
   * Extract code blocks from a single text
   */
  private extractFromText(
    text: string,
    messageId: string,
    conversationId: string
  ): CodeBlock[] {
    const blocks: CodeBlock[] = [];

    // Extract fenced code blocks (```language\ncode\n```)
    const fencedRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;

    while ((match = fencedRegex.exec(text)) !== null) {
      const language = match[1]?.toLowerCase() || 'plaintext';
      const code = match[2].trim();

      if (code.length >= this.config.minLength) {
        // Filter by language if specified
        if (this.config.languages.length > 0 && !this.config.languages.includes(language)) {
          continue;
        }

        blocks.push(this.createCodeBlock(code, language, messageId, conversationId, true));
      }
    }

    // Extract inline code blocks if enabled
    if (this.config.extractInline) {
      const inlineRegex = /`([^`\n]+)`/g;

      while ((match = inlineRegex.exec(text)) !== null) {
        const code = match[1].trim();

        if (code.length >= this.config.minLength && this.looksLikeCode(code)) {
          blocks.push(this.createCodeBlock(
            code,
            this.detectLanguage(code),
            messageId,
            conversationId,
            false
          ));
        }
      }
    }

    return blocks;
  }

  /**
   * Create a code block object
   */
  private createCodeBlock(
    code: string,
    language: string,
    messageId: string,
    conversationId: string,
    isFenced: boolean
  ): CodeBlock {
    const hash = this.hashCode(code);
    const id = `code_${hash.slice(0, 12)}`;

    return {
      id,
      language,
      code,
      hash,
      messageId,
      conversationId,
      metadata: {
        lineCount: code.split('\n').length,
        charCount: code.length,
        isFenced,
        hasComments: this.hasComments(code, language),
      },
    };
  }

  /**
   * Add code block with optional deduplication
   */
  private addCodeBlock(block: CodeBlock): void {
    if (this.config.deduplicate) {
      if (!this.hashIndex.has(block.hash)) {
        this.hashIndex.set(block.hash, block);
        this.codeBlocks.push(block);
      }
    } else {
      this.codeBlocks.push(block);
    }
  }

  /**
   * Hash code content for deduplication
   */
  private hashCode(code: string): string {
    // Normalize code before hashing
    const normalized = code
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/\/\/.*$/gm, '')  // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove multi-line comments
      .trim();

    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Detect if inline code looks like actual code
   */
  private looksLikeCode(text: string): boolean {
    // Heuristics for code detection
    const codePatterns = [
      /[a-zA-Z_]\w*\s*\(/, // Function calls
      /[a-zA-Z_]\w*\s*=/, // Assignments
      /\w+\.\w+/, // Property access
      /[\{\}\[\]();]/, // Code punctuation
      /const|let|var|function|class|import|export/, // JS keywords
      /def|class|import|from/, // Python keywords
    ];

    return codePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Detect programming language from code content
   */
  private detectLanguage(code: string): string {
    // Simple language detection based on keywords/syntax
    if (/\bdef\b|\bclass\b.*:|\bimport\b/.test(code)) return 'python';
    if (/\bfunction\b|\bconst\b|\blet\b|=>/.test(code)) return 'javascript';
    if (/interface|type\s+\w+\s*=/.test(code)) return 'typescript';
    if (/public|private|protected|class.*\{/.test(code)) return 'java';
    if (/\bfn\b|\blet\s+mut\b|\bimpl\b/.test(code)) return 'rust';
    if (/\bfunc\b|\bpackage\b|\bgofmt\b/.test(code)) return 'go';
    if (/SELECT|INSERT|UPDATE|DELETE|FROM|WHERE/i.test(code)) return 'sql';
    if (/<\w+>|<\/\w+>/.test(code)) return 'html';

    return 'plaintext';
  }

  /**
   * Check if code has comments
   */
  private hasComments(code: string, language: string): boolean {
    const commentPatterns: Record<string, RegExp[]> = {
      javascript: [/\/\//, /\/\*[\s\S]*?\*\//],
      typescript: [/\/\//, /\/\*[\s\S]*?\*\//],
      python: [/#/, /'''[\s\S]*?'''/, /"""[\s\S]*?"""/],
      java: [/\/\//, /\/\*[\s\S]*?\*\//],
      cpp: [/\/\//, /\/\*[\s\S]*?\*\//],
      c: [/\/\//, /\/\*[\s\S]*?\*\//],
      ruby: [/#/, /=begin[\s\S]*?=end/],
      sql: [/--/, /\/\*[\s\S]*?\*\//],
    };

    const patterns = commentPatterns[language] || commentPatterns.javascript;
    return patterns.some(pattern => pattern.test(code));
  }

  /**
   * Get file extension for language
   */
  static getExtension(language: string): string {
    return CodeExtractor.LANGUAGE_EXTENSIONS[language.toLowerCase()] || 'txt';
  }

  /**
   * Get all code blocks
   */
  getCodeBlocks(): CodeBlock[] {
    return this.codeBlocks;
  }

  /**
   * Get code blocks by language
   */
  getCodeBlocksByLanguage(language: string): CodeBlock[] {
    return this.codeBlocks.filter(block => block.language === language);
  }

  /**
   * Get code blocks by conversation
   */
  getCodeBlocksByConversation(conversationId: string): CodeBlock[] {
    return this.codeBlocks.filter(block => block.conversationId === conversationId);
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalBlocks: number;
    uniqueBlocks: number;
    languageDistribution: Record<string, number>;
    avgLineCount: number;
    avgCharCount: number;
  } {
    const languageDistribution: Record<string, number> = {};
    let totalLines = 0;
    let totalChars = 0;

    for (const block of this.codeBlocks) {
      languageDistribution[block.language] = (languageDistribution[block.language] || 0) + 1;
      totalLines += block.metadata.lineCount;
      totalChars += block.metadata.charCount;
    }

    return {
      totalBlocks: this.codeBlocks.length,
      uniqueBlocks: this.hashIndex.size,
      languageDistribution,
      avgLineCount: this.codeBlocks.length > 0 ? totalLines / this.codeBlocks.length : 0,
      avgCharCount: this.codeBlocks.length > 0 ? totalChars / this.codeBlocks.length : 0,
    };
  }
}
