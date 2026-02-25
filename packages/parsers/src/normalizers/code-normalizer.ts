import { generateContentId } from '../utils/id-generator';

/**
 * Configuration for code normalization
 */
export interface CodeNormalizerConfig {
  /**
   * Strip comments from code
   * Default: false (preserve comments for semantic meaning)
   */
  stripComments?: boolean;

  /**
   * Apply α-renaming to identifiers (x → VAR_1, foo → FUNC_1)
   * Useful for detecting functionally equivalent code with different names
   * Default: false (preserve original names)
   */
  alphaRename?: boolean;

  /**
   * Normalize string/number literals (STR_LIT_1, NUM_LIT_1)
   * Useful for detecting code that differs only in literal values
   * Default: false (preserve literal values)
   */
  normalizeLiterals?: boolean;

  /**
   * Generate token sketch for lightweight AST comparison
   * Format: "op|op|ident|num|..." (sequence of token types)
   * Default: true
   */
  generateTokenSketch?: boolean;

  /**
   * Normalize whitespace (consistent indentation, spacing)
   * Default: true
   */
  normalizeWhitespace?: boolean;

  /**
   * Indentation style (spaces per level)
   * Default: 2
   */
  indentSize?: number;
}

/**
 * Result of code normalization
 */
export interface CodeNormalizationResult {
  /**
   * Normalized code string
   */
  normalized: string;

  /**
   * Content ID (hash of normalized code)
   */
  content_id: string;

  /**
   * Token sketch (optional, if generateTokenSketch=true)
   * Format: "op|op|ident|num|str|..."
   */
  token_sketch: string;

  /**
   * Token count
   */
  tokenCount: number;

  /**
   * Original vs normalized size
   */
  originalSize: number;
  normalizedSize: number;

  /**
   * Detected language (if provided)
   */
  language: string;

  /**
   * Normalization steps applied
   */
  stepsApplied: string[];
}

/**
 * Token type for lexing
 */
interface Token {
  type:
    | 'keyword'
    | 'operator'
    | 'identifier'
    | 'number'
    | 'string'
    | 'comment'
    | 'whitespace'
    | 'punctuation'
    | 'unknown';
  value: string;
  line: number;
  column: number;
}

const DEFAULT_CONFIG: CodeNormalizerConfig = {
  stripComments: false,
  alphaRename: false,
  normalizeLiterals: false,
  generateTokenSketch: true,
  normalizeWhitespace: true,
  indentSize: 2,
};

/**
 * Code normalizer for deterministic content-addressable hashing
 *
 * Phase 1: Regex-based lexing (works for most languages)
 * Phase 2: Tree-sitter AST (future, for JS/TS/Python/Java/Go)
 *
 * Example:
 * ```
 * const normalizer = new CodeNormalizer({
 *   normalizeWhitespace: true,
 *   stripComments: true
 * });
 *
 * const result = normalizer.normalize(code, 'javascript');
 * // result.content_id: 'cid_def456...'
 * // result.token_sketch: 'keyword|ident|op|num|...'
 * ```
 */
export class CodeNormalizer {
  constructor(private config: CodeNormalizerConfig = DEFAULT_CONFIG) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Normalize code to canonical form
   *
   * @param code - Source code string
   * @param language - Language identifier (js, python, java, etc.)
   * @returns Normalization result with content_id
   */
  normalize(code: string, language: string): CodeNormalizationResult {
    const originalSize = code.length;
    const stepsApplied: string[] = [];
    let result = code;

    // 1. Tokenize
    const tokens = this.lex(code, language);
    stepsApplied.push('tokenize');

    // 2. Strip comments (optional)
    let filteredTokens = tokens;
    if (this.config.stripComments) {
      filteredTokens = this.stripCommentsFromTokens(filteredTokens);
      stepsApplied.push('strip_comments');
    }

    // 3. α-rename identifiers (optional)
    if (this.config.alphaRename) {
      filteredTokens = this.alphaRenameTokens(filteredTokens, language);
      stepsApplied.push('alpha_rename');
    }

    // 4. Normalize literals (optional)
    if (this.config.normalizeLiterals) {
      filteredTokens = this.normalizeLiteralTokens(filteredTokens);
      stepsApplied.push('normalize_literals');
    }

    // 5. Normalize whitespace
    if (this.config.normalizeWhitespace) {
      result = this.reconstructCodeWithNormalizedWhitespace(filteredTokens, language);
      stepsApplied.push('normalize_whitespace');
    } else {
      result = this.reconstructCode(filteredTokens);
    }

    // 6. Generate token sketch
    const token_sketch = this.config.generateTokenSketch ? this.generateSketch(filteredTokens) : '';

    // 7. Compute content ID
    const content_id = generateContentId(result);

    return {
      normalized: result,
      content_id,
      token_sketch,
      tokenCount: filteredTokens.length,
      originalSize,
      normalizedSize: result.length,
      language,
      stepsApplied,
    };
  }

  /**
   * Regex-based lexer (Phase 1)
   *
   * Works for most C-family and scripting languages
   * Not perfect, but good enough for normalization
   */
  private lex(code: string, language: string): Token[] {
    const tokens: Token[] = [];
    const lines = code.split('\n');

    // Language-specific keywords
    const keywords = this.getKeywordsForLanguage(language);

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      let column = 0;

      while (column < line.length) {
        const remaining = line.slice(column);

        // Whitespace
        const whitespaceMatch = remaining.match(/^(\s+)/);
        if (whitespaceMatch) {
          tokens.push({
            type: 'whitespace',
            value: whitespaceMatch[1],
            line: lineNum,
            column,
          });
          column += whitespaceMatch[1].length;
          continue;
        }

        // Single-line comment (// or #)
        if (remaining.startsWith('//') || (language === 'python' && remaining.startsWith('#'))) {
          tokens.push({
            type: 'comment',
            value: remaining, // Rest of line
            line: lineNum,
            column,
          });
          break; // End of line
        }

        // Multi-line comment /* ... */
        if (remaining.startsWith('/*')) {
          const endIndex = remaining.indexOf('*/');
          if (endIndex !== -1) {
            const commentValue = remaining.slice(0, endIndex + 2);
            tokens.push({
              type: 'comment',
              value: commentValue,
              line: lineNum,
              column,
            });
            column += commentValue.length;
            continue;
          }
        }

        // String literals (", ', `)
        const stringMatch = remaining.match(/^(["'`])(?:\\.|(?!\1).)*\1/);
        if (stringMatch) {
          tokens.push({
            type: 'string',
            value: stringMatch[0],
            line: lineNum,
            column,
          });
          column += stringMatch[0].length;
          continue;
        }

        // Numbers (int, float, hex, binary)
        const numberMatch = remaining.match(
          /^(0[xXbB][0-9a-fA-F]+|[0-9]+\.?[0-9]*([eE][+-]?[0-9]+)?)/
        );
        if (numberMatch) {
          tokens.push({
            type: 'number',
            value: numberMatch[0],
            line: lineNum,
            column,
          });
          column += numberMatch[0].length;
          continue;
        }

        // Identifiers and keywords
        const identMatch = remaining.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        if (identMatch) {
          const value = identMatch[0];
          const type = keywords.has(value) ? 'keyword' : 'identifier';
          tokens.push({
            type,
            value,
            line: lineNum,
            column,
          });
          column += value.length;
          continue;
        }

        // Operators (multi-char first)
        const opMatch = remaining.match(
          /^(===|!==|==|!=|<=|>=|&&|\|\||<<|>>|\+\+|--|->|=>|\*\*|\.\.\.)/
        );
        if (opMatch) {
          tokens.push({
            type: 'operator',
            value: opMatch[0],
            line: lineNum,
            column,
          });
          column += opMatch[0].length;
          continue;
        }

        // Single-char operators and punctuation
        const singleCharMatch = remaining.match(/^([+\-*/%<>=!&|^~?:;,.(){}[\]])/);
        if (singleCharMatch) {
          const value = singleCharMatch[0];
          const type = [
            '+',
            '-',
            '*',
            '/',
            '%',
            '<',
            '>',
            '=',
            '!',
            '&',
            '|',
            '^',
            '~',
            '?',
            ':',
          ].includes(value)
            ? 'operator'
            : 'punctuation';
          tokens.push({
            type,
            value,
            line: lineNum,
            column,
          });
          column += value.length;
          continue;
        }

        // Unknown character (should rarely happen)
        tokens.push({
          type: 'unknown',
          value: remaining[0],
          line: lineNum,
          column,
        });
        column++;
      }

      // Newline token (implicit)
      if (lineNum < lines.length - 1) {
        tokens.push({
          type: 'whitespace',
          value: '\n',
          line: lineNum,
          column: line.length,
        });
      }
    }

    return tokens;
  }

  /**
   * Get keywords for a language
   */
  private getKeywordsForLanguage(language: string): Set<string> {
    const keywordSets: Record<string, string[]> = {
      javascript: [
        'const',
        'let',
        'var',
        'function',
        'if',
        'else',
        'for',
        'while',
        'return',
        'class',
        'import',
        'export',
        'async',
        'await',
      ],
      typescript: [
        'const',
        'let',
        'var',
        'function',
        'if',
        'else',
        'for',
        'while',
        'return',
        'class',
        'import',
        'export',
        'async',
        'await',
        'interface',
        'type',
      ],
      python: [
        'def',
        'class',
        'if',
        'elif',
        'else',
        'for',
        'while',
        'return',
        'import',
        'from',
        'as',
        'with',
        'try',
        'except',
        'finally',
      ],
      java: [
        'public',
        'private',
        'protected',
        'class',
        'interface',
        'if',
        'else',
        'for',
        'while',
        'return',
        'new',
        'import',
        'static',
        'void',
      ],
      go: [
        'func',
        'var',
        'const',
        'if',
        'else',
        'for',
        'return',
        'package',
        'import',
        'type',
        'struct',
        'interface',
      ],
      rust: [
        'fn',
        'let',
        'mut',
        'if',
        'else',
        'for',
        'while',
        'return',
        'struct',
        'impl',
        'trait',
        'use',
        'pub',
      ],
    };

    return new Set(keywordSets[language] || []);
  }

  /**
   * Strip comment tokens
   */
  private stripCommentsFromTokens(tokens: Token[]): Token[] {
    return tokens.filter((t) => t.type !== 'comment');
  }

  /**
   * α-rename identifiers
   * x → VAR_1, foo → VAR_2, myFunc → FUNC_1
   */
  private alphaRenameTokens(tokens: Token[], _language: string): Token[] {
    const varMap = new Map<string, string>();
    let varCounter = 1;
    let funcCounter = 1;

    // Heuristic: identifiers followed by '(' are likely functions
    const isFunctionName = (index: number): boolean => {
      const nextNonWhitespace = tokens.slice(index + 1).find((t) => t.type !== 'whitespace');
      return nextNonWhitespace?.value === '(';
    };

    return tokens.map((token, index) => {
      if (token.type !== 'identifier') return token;

      if (!varMap.has(token.value)) {
        const isFunc = isFunctionName(index);
        const newName = isFunc ? `FUNC_${funcCounter++}` : `VAR_${varCounter++}`;
        varMap.set(token.value, newName);
      }

      return {
        ...token,
        value: varMap.get(token.value)!,
      };
    });
  }

  /**
   * Normalize literals
   * "hello" → STR_LIT_1, 42 → NUM_LIT_1
   */
  private normalizeLiteralTokens(tokens: Token[]): Token[] {
    let strCounter = 1;
    let numCounter = 1;

    return tokens.map((token) => {
      if (token.type === 'string') {
        return { ...token, value: `STR_LIT_${strCounter++}` };
      }
      if (token.type === 'number') {
        return { ...token, value: `NUM_LIT_${numCounter++}` };
      }
      return token;
    });
  }

  /**
   * Reconstruct code from tokens (simple concatenation)
   */
  private reconstructCode(tokens: Token[]): string {
    return tokens.map((t) => t.value).join('');
  }

  /**
   * Reconstruct code with normalized whitespace
   */
  private reconstructCodeWithNormalizedWhitespace(tokens: Token[], _language: string): string {
    let result = '';
    let indentLevel = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token.type === 'whitespace') {
        // Check if this is a newline
        if (token.value.includes('\n')) {
          result += '\n';
          // Next non-whitespace token gets proper indentation
          const nextToken = tokens[i + 1];
          if (nextToken && nextToken.type !== 'whitespace') {
            result += ' '.repeat(indentLevel * (this.config.indentSize || 2));
          }
        } else {
          // Single space for inline whitespace
          result += ' ';
        }
        continue;
      }

      // Adjust indent level
      if (token.value === '{' || token.value === '(' || token.value === '[') {
        indentLevel++;
      } else if (token.value === '}' || token.value === ')' || token.value === ']') {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      result += token.value;
    }

    return result.trim();
  }

  /**
   * Generate token sketch (sequence of token types)
   * Example: "keyword|ident|op|num|punctuation|..."
   */
  private generateSketch(tokens: Token[]): string {
    return tokens
      .filter((t) => t.type !== 'whitespace')
      .map((t) => {
        // Simplify type names
        switch (t.type) {
          case 'identifier':
            return 'ident';
          case 'operator':
            return 'op';
          case 'number':
            return 'num';
          case 'string':
            return 'str';
          case 'keyword':
            return 'kw';
          case 'punctuation':
            return 'punct';
          case 'comment':
            return 'comment';
          default:
            return 'unknown';
        }
      })
      .join('|');
  }
}

/**
 * Quick normalize function with default config
 *
 * @param code - Source code
 * @param language - Language identifier
 * @returns Content ID
 */
export function normalizeCode(code: string, language: string): string {
  const normalizer = new CodeNormalizer();
  const result = normalizer.normalize(code, language);
  return result.content_id;
}

/**
 * Batch normalize multiple code snippets
 */
export function normalizeCodeBatch(
  codeSnippets: Array<{ code: string; language: string }>,
  config?: CodeNormalizerConfig
): CodeNormalizationResult[] {
  const normalizer = new CodeNormalizer(config);
  return codeSnippets.map(({ code, language }) => normalizer.normalize(code, language));
}
