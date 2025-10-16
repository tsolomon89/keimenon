/**
 * Tokenizer: Break text into words/tokens
 *
 * Supports:
 * - Language-aware word boundaries
 * - Code vs prose tokenization
 * - Byte offset tracking
 */

export interface Token {
  text: string;
  start: number;       // Byte offset
  end: number;         // Byte offset
  type: 'word' | 'number' | 'punctuation' | 'whitespace';
}

export interface TokenizerConfig {
  language?: string;   // 'code' or 'prose' (default: auto-detect)
  preserveWhitespace?: boolean;
  lowercase?: boolean;
}

/**
 * Tokenize text into words/tokens with byte offsets
 */
export function tokenize(
  text: string,
  config: TokenizerConfig = {}
): Token[] {
  const { preserveWhitespace = false, lowercase = false } = config;

  // Determine if text is code or prose
  const isCode = config.language === 'code' || looksLikeCode(text);

  if (isCode) {
    return tokenizeCode(text, preserveWhitespace, lowercase);
  } else {
    return tokenizeProse(text, preserveWhitespace, lowercase);
  }
}

/**
 * Tokenize prose (natural language)
 */
function tokenizeProse(
  text: string,
  preserveWhitespace: boolean,
  lowercase: boolean
): Token[] {
  const tokens: Token[] = [];

  // Word boundary regex (Unicode-aware)
  const regex = /(\p{L}+|\p{N}+|[^\p{L}\p{N}\s]+|\s+)/gu;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const tokenText = match[0];
    const start = match.index;
    const end = start + Buffer.byteLength(tokenText, 'utf8');

    let type: Token['type'] = 'word';
    if (/^\p{N}+$/u.test(tokenText)) {
      type = 'number';
    } else if (/^[^\p{L}\p{N}\s]+$/u.test(tokenText)) {
      type = 'punctuation';
    } else if (/^\s+$/.test(tokenText)) {
      type = 'whitespace';
    }

    if (type === 'whitespace' && !preserveWhitespace) {
      continue;
    }

    tokens.push({
      text: lowercase ? tokenText.toLowerCase() : tokenText,
      start,
      end,
      type,
    });
  }

  return tokens;
}

/**
 * Tokenize code (programming language)
 */
function tokenizeCode(
  text: string,
  preserveWhitespace: boolean,
  lowercase: boolean
): Token[] {
  const tokens: Token[] = [];

  // Code tokenization (identifiers, numbers, operators, etc.)
  const regex = /([a-zA-Z_$][a-zA-Z0-9_$]*|0[xXbB][0-9a-fA-F]+|[0-9]+\.?[0-9]*|[+\-*/%<>=!&|^~?:;,.(){}[\]]|\s+|.)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const tokenText = match[0];
    const start = match.index;
    const end = start + Buffer.byteLength(tokenText, 'utf8');

    let type: Token['type'] = 'word';
    if (/^[0-9]/.test(tokenText)) {
      type = 'number';
    } else if (/^[+\-*/%<>=!&|^~?:;,.(){}[\]]/.test(tokenText)) {
      type = 'punctuation';
    } else if (/^\s+$/.test(tokenText)) {
      type = 'whitespace';
    }

    if (type === 'whitespace' && !preserveWhitespace) {
      continue;
    }

    tokens.push({
      text: lowercase ? tokenText.toLowerCase() : tokenText,
      start,
      end,
      type,
    });
  }

  return tokens;
}

/**
 * Heuristic to detect if text is code vs prose
 */
function looksLikeCode(text: string): boolean {
  // Check for code indicators
  const codeIndicators = [
    /function\s+\w+\s*\(/,        // function declarations
    /const\s+\w+\s*=/,            // const declarations
    /let\s+\w+\s*=/,              // let declarations
    /var\s+\w+\s*=/,              // var declarations
    /class\s+\w+/,                // class declarations
    /def\s+\w+\s*\(/,             // Python functions
    /public\s+(static\s+)?void/,  // Java methods
    /\w+\s*::\s*\w+/,             // C++ scope resolution
    /import\s+\{/,                // ES6 imports
    /from\s+\w+\s+import/,        // Python imports
  ];

  for (const pattern of codeIndicators) {
    if (pattern.test(text)) {
      return true;
    }
  }

  // Check ratio of non-word characters
  const nonWord = (text.match(/[{}()[\];]/g) || []).length;
  const words = (text.match(/\b\w+\b/g) || []).length;
  if (words > 0 && nonWord / words > 0.15) {
    return true;
  }

  return false;
}

/**
 * Generate n-grams from tokens
 */
export function generateNgrams(tokens: Token[], n: number): string[] {
  if (n < 1 || tokens.length < n) {
    return [];
  }

  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    const ngram = tokens
      .slice(i, i + n)
      .map((t) => t.text)
      .join(' ');
    ngrams.push(ngram);
  }

  return ngrams;
}

/**
 * Generate character shingles (for short text)
 */
export function generateShingles(text: string, size: number = 13): string[] {
  if (text.length < size) {
    return [text];
  }

  const shingles: string[] = [];
  for (let i = 0; i <= text.length - size; i++) {
    shingles.push(text.slice(i, i + size));
  }

  return shingles;
}

/**
 * Batch tokenize multiple texts
 */
export function tokenizeBatch(
  texts: string[],
  config: TokenizerConfig = {}
): Token[][] {
  return texts.map((text) => tokenize(text, config));
}
