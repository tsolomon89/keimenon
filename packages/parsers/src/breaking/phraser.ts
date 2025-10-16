import { tokenize } from './tokenizer';

/**
 * Phraser: Extract phrases and n-grams from text
 *
 * Two approaches:
 * 1. Token-based: N-grams of words (1-5 tokens)
 * 2. Character-based: Shingles (9-13 chars) for short text
 */

export interface Phrase {
  text: string;
  start: number;
  end: number;
  tokens: number;      // How many tokens in phrase
}

export interface PhraserConfig {
  minTokens: number;   // Min n-gram size (default: 1)
  maxTokens: number;   // Max n-gram size (default: 5)
  shingleSize: number; // Character shingle size (default: 13)
  useShingles: boolean; // Use char shingles for short text (default: true)
}

const DEFAULT_CONFIG: PhraserConfig = {
  minTokens: 1,
  maxTokens: 5,
  shingleSize: 13,
  useShingles: true,
};

/**
 * Extract phrases from text
 *
 * For longer text (>100 chars): Token-based n-grams
 * For shorter text (<100 chars): Character shingles
 */
export function extractPhrases(
  text: string,
  config: Partial<PhraserConfig> = {}
): Phrase[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // For short text, use character shingles
  if (cfg.useShingles && text.length < 100) {
    return extractShinglePhrases(text, cfg.shingleSize);
  }

  // For longer text, use token-based n-grams
  return extractTokenPhrases(text, cfg.minTokens, cfg.maxTokens);
}

/**
 * Extract token-based phrases (n-grams)
 */
function extractTokenPhrases(
  text: string,
  minTokens: number,
  maxTokens: number
): Phrase[] {
  const phrases: Phrase[] = [];
  const tokens = tokenize(text);

  // Generate n-grams for each size
  for (let n = minTokens; n <= maxTokens; n++) {
    if (tokens.length < n) continue;

    for (let i = 0; i <= tokens.length - n; i++) {
      const phraseTokens = tokens.slice(i, i + n);
      const phraseText = phraseTokens.map((t) => t.text).join(' ');
      const start = phraseTokens[0].start;
      const end = phraseTokens[phraseTokens.length - 1].end;

      phrases.push({
        text: phraseText,
        start,
        end,
        tokens: n,
      });
    }
  }

  return phrases;
}

/**
 * Extract character-based shingles
 */
function extractShinglePhrases(text: string, shingleSize: number): Phrase[] {
  const phrases: Phrase[] = [];

  if (text.length < shingleSize) {
    // Text is shorter than shingle size, return as single phrase
    phrases.push({
      text,
      start: 0,
      end: Buffer.byteLength(text, 'utf8'),
      tokens: 0, // Shingles don't have token count
    });
    return phrases;
  }

  for (let i = 0; i <= text.length - shingleSize; i++) {
    const shingle = text.slice(i, i + shingleSize);
    const start = Buffer.byteLength(text.slice(0, i), 'utf8');
    const end = start + Buffer.byteLength(shingle, 'utf8');

    phrases.push({
      text: shingle,
      start,
      end,
      tokens: 0, // Shingles don't have token count
    });
  }

  return phrases;
}

/**
 * Extract phrases with filtering
 *
 * Filters out:
 * - Stop words (optional)
 * - Too short phrases
 * - Punctuation-only phrases
 */
export function extractFilteredPhrases(
  text: string,
  config: Partial<PhraserConfig> & {
    removeStopWords?: boolean;
    minPhraseLength?: number;
  } = {}
): Phrase[] {
  const phrases = extractPhrases(text, config);
  const minLength = config.minPhraseLength || 3;
  const removeStopWords = config.removeStopWords || false;

  return phrases.filter((phrase) => {
    // Filter out too short
    if (phrase.text.length < minLength) return false;

    // Filter out punctuation-only
    if (/^[^\w\s]+$/.test(phrase.text)) return false;

    // Filter out stop words (if enabled)
    if (removeStopWords && isStopWord(phrase.text)) return false;

    return true;
  });
}

/**
 * Simple stop word check (expand as needed)
 */
function isStopWord(text: string): boolean {
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'can', 'could', 'may', 'might', 'must', 'shall',
  ]);

  return stopWords.has(text.toLowerCase().trim());
}

/**
 * Get most frequent phrases (candidates for cluster labels)
 */
export function getTopPhrases(
  phrases: Phrase[],
  topN: number = 10
): Array<{ phrase: string; count: number }> {
  const counts = new Map<string, number>();

  for (const phrase of phrases) {
    const normalized = phrase.text.toLowerCase().trim();
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  const sorted = Array.from(counts.entries())
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count);

  return sorted.slice(0, topN);
}

/**
 * Batch extract phrases from multiple texts
 */
export function extractPhrasesBatch(
  texts: string[],
  config: Partial<PhraserConfig> = {}
): Phrase[][] {
  return texts.map((text) => extractPhrases(text, config));
}

/**
 * Get unique phrases (deduplicated)
 */
export function getUniquePhrases(phrases: Phrase[]): Phrase[] {
  const seen = new Set<string>();
  const unique: Phrase[] = [];

  for (const phrase of phrases) {
    const normalized = phrase.text.toLowerCase().trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(phrase);
    }
  }

  return unique;
}
