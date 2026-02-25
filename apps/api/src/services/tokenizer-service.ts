/**
 * Tokenizer Service
 * 
 * Implements "Multi-Level Breaking" for the Data Import Pipeline.
 * 
 * Levels:
 * 1. Text -> Tokens (normalized words)
 * 2. Tokens -> N-Grams (phrases)
 * 3. Text -> Sentences
 * 4. Text -> Blocks (paragraphs/sections)
 */

export class TokenizerService {
  /**
   * Normalize and tokenize text into words
   * Removes punctuation, generic stopwords, and converts to lowercase.
   */
  tokenize(text: string): string[] {
    if (!text) return [];
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]|_/g, ' ') // Replace punctuation with space
      .replace(/\s+/g, ' ')       // Collapse whitespace
      .trim()
      .split(' ')
      .filter(t => t.length > 0);
  }

  /**
   * Generate N-Grams from tokens
   * @param n Size of n-gram (e.g., 2 for bigrams, 3 for trigrams)
   */
  generateNGrams(tokens: string[], n: number): string[][] {
    if (tokens.length < n) return [];
    
    const ngrams: string[][] = [];
    for (let i = 0; i <= tokens.length - n; i++) {
      ngrams.push(tokens.slice(i, i + n));
    }
    return ngrams;
  }

  /**
   * Break text into sentences
   * Uses a simple regex-based heuristic for sentence boundaries.
   */
  splitSentences(text: string): string[] {
    if (!text) return [];
    
    // Split on punctuation (.!?) followed by whitespace or end of string
    // This is a naive implementation but sufficient for our heuristic needs
    return text
      .split(/([.!?]+(?:\s+|$))/g)
      .reduce((acc, part, i, arr) => {
        // Re-attach punctuation to the previous sentence part
        if (i % 2 === 0) {
          if (part.trim()) acc.push(part);
        } else {
          if (acc.length > 0) acc[acc.length - 1] += part;
        }
        return acc;
      }, [] as string[])
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Break text into blocks/paragraphs
   * Splits on double newlines.
   */
  splitBlocks(text: string): string[] {
    if (!text) return [];
    
    return text
      .split(/\n\s*\n/)
      .map(b => b.trim())
      .filter(b => b.length > 0);
  }

  /**
   * Extract code blocks from text
   * Returns validation-ready code blocks and the remaining prose text
   */
  extractCodeBlocks(text: string): { prose: string; code: string[] } {
    const codeBlockRegex = /```[\s\S]*?```/g;
    const code: string[] = [];
    
    const prose = text.replace(codeBlockRegex, (match) => {
      // Strip backticks and language identifier
      const cleanCode = match.replace(/^```\w*\n?|```$/g, '');
      code.push(cleanCode);
      return ' [CODE_BLOCK] '; // Placeholder to keep sentence structure
    });

    return { prose, code };
  }
}
