/**
 * Sentencer: Extract sentences from prose
 *
 * Uses language-aware sentence boundary detection
 * Exempts code blocks (no sentence boundaries in code)
 */

export interface Sentence {
  text: string;
  start: number;       // Byte offset
  end: number;         // Byte offset
  index: number;       // Sentence number (0-indexed)
}

export interface SentencerConfig {
  language?: string;   // 'en', 'es', etc. (default: 'en')
  abbreviations?: string[]; // Custom abbreviations to handle
}

const DEFAULT_ABBREVIATIONS = [
  'Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sr', 'Jr',
  'etc', 'vs', 'e.g', 'i.e', 'viz',
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Extract sentences from text
 */
export function extractSentences(
  text: string,
  config: SentencerConfig = {}
): Sentence[] {
  const abbreviations = config.abbreviations || DEFAULT_ABBREVIATIONS;
  const sentences: Sentence[] = [];

  // Skip if text looks like code
  if (looksLikeCode(text)) {
    // Return entire text as single "sentence"
    return [
      {
        text,
        start: 0,
        end: Buffer.byteLength(text, 'utf8'),
        index: 0,
      },
    ];
  }

  // Sentence boundary detection
  let current = '';
  let startOffset = 0;
  let index = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    current += char;

    // Check for sentence boundaries
    if (isSentenceTerminator(char)) {
      // Check if it's a real boundary (not abbreviation)
      if (!isAbbreviation(current, abbreviations)) {
        // Look ahead for whitespace or end
        if (!next || /\s/.test(next)) {
          // Trim and add sentence
          const trimmed = current.trim();
          if (trimmed.length > 0) {
            const byteStart = Buffer.byteLength(text.slice(0, startOffset), 'utf8');
            const byteEnd = byteStart + Buffer.byteLength(trimmed, 'utf8');

            sentences.push({
              text: trimmed,
              start: byteStart,
              end: byteEnd,
              index,
            });

            index++;
          }

          current = '';
          startOffset = i + 1;
        }
      }
    }
  }

  // Add remaining text as final sentence
  if (current.trim().length > 0) {
    const trimmed = current.trim();
    const byteStart = Buffer.byteLength(text.slice(0, startOffset), 'utf8');
    const byteEnd = byteStart + Buffer.byteLength(trimmed, 'utf8');

    sentences.push({
      text: trimmed,
      start: byteStart,
      end: byteEnd,
      index,
    });
  }

  return sentences;
}

/**
 * Check if character is a sentence terminator
 */
function isSentenceTerminator(char: string): boolean {
  return char === '.' || char === '!' || char === '?';
}

/**
 * Check if text ends with an abbreviation
 */
function isAbbreviation(text: string, abbreviations: string[]): boolean {
  const trimmed = text.trim();

  for (const abbr of abbreviations) {
    if (trimmed.endsWith(abbr + '.')) {
      return true;
    }
  }

  // Check for single-letter abbreviations (e.g., "U.S.")
  if (/\b[A-Z]\.$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Heuristic to detect code (avoid sentence splitting in code)
 */
function looksLikeCode(text: string): boolean {
  // Check for code indicators
  const codeIndicators = [
    /function\s+\w+/,
    /const\s+\w+\s*=/,
    /let\s+\w+\s*=/,
    /var\s+\w+\s*=/,
    /class\s+\w+/,
    /def\s+\w+/,
    /public\s+(static\s+)?void/,
    /import\s+/,
    /from\s+\w+\s+import/,
  ];

  for (const pattern of codeIndicators) {
    if (pattern.test(text)) {
      return true;
    }
  }

  // Check for high density of operators
  const operators = (text.match(/[{}()[\];=<>+\-*/%&|^~]/g) || []).length;
  const chars = text.length;
  if (chars > 0 && operators / chars > 0.1) {
    return true;
  }

  return false;
}

/**
 * Get sentence at specific byte offset
 */
export function getSentenceAtOffset(
  sentences: Sentence[],
  offset: number
): Sentence | null {
  for (const sentence of sentences) {
    if (offset >= sentence.start && offset < sentence.end) {
      return sentence;
    }
  }
  return null;
}

/**
 * Merge short sentences (< minLength)
 */
export function mergeShortSentences(
  sentences: Sentence[],
  minLength: number = 20
): Sentence[] {
  const merged: Sentence[] = [];
  let current: Sentence | null = null;

  for (const sentence of sentences) {
    if (!current) {
      current = { ...sentence };
      continue;
    }

    // If current is too short, merge with next
    if (current.text.length < minLength) {
      current.text += ' ' + sentence.text;
      current.end = sentence.end;
    } else {
      merged.push(current);
      current = { ...sentence };
    }
  }

  if (current) {
    merged.push(current);
  }

  // Re-index
  return merged.map((s, i) => ({ ...s, index: i }));
}

/**
 * Batch extract sentences from multiple texts
 */
export function extractSentencesBatch(
  texts: string[],
  config: SentencerConfig = {}
): Sentence[][] {
  return texts.map((text) => extractSentences(text, config));
}
