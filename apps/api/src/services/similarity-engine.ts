/**
 * Similarity Engine - Advanced text similarity and deduplication
 * Supports multiple algorithms: Jaccard, Levenshtein, Cosine
 */

export type SimilarityAlgorithm = 'jaccard' | 'levenshtein' | 'cosine';

export interface SimilarityOptions {
  algorithm: SimilarityAlgorithm;
  threshold: number;
  normalizeTokens: boolean;
  ignoreCase: boolean;
  ignoreWhitespace: boolean;
  minTokenOverlap: number;
  lengthRatioTolerance: number;
}

export interface SimilarityResult {
  score: number;
  algorithm: SimilarityAlgorithm;
  isDuplicate: boolean;
  metadata: {
    text1Length: number;
    text2Length: number;
    lengthRatio: number;
    tokenOverlap?: number;
    editDistance?: number;
  };
}

export class SimilarityEngine {
  private defaultOptions: SimilarityOptions = {
    algorithm: 'jaccard',
    threshold: 0.8,
    normalizeTokens: true,
    ignoreCase: true,
    ignoreWhitespace: true,
    minTokenOverlap: 5,
    lengthRatioTolerance: 0.2,
  };

  /**
   * Calculate similarity between two texts
   */
  calculateSimilarity(
    text1: string,
    text2: string,
    options?: Partial<SimilarityOptions>
  ): SimilarityResult {
    const opts = { ...this.defaultOptions, ...options };

    // Normalize texts
    let norm1 = text1;
    let norm2 = text2;

    if (opts.ignoreCase) {
      norm1 = norm1.toLowerCase();
      norm2 = norm2.toLowerCase();
    }

    if (opts.ignoreWhitespace) {
      norm1 = norm1.replace(/\s+/g, ' ').trim();
      norm2 = norm2.replace(/\s+/g, ' ').trim();
    }

    // Calculate length ratio
    const lengthRatio = Math.min(norm1.length, norm2.length) / Math.max(norm1.length, norm2.length);

    // Early exit if lengths are too different
    if (lengthRatio < (1 - opts.lengthRatioTolerance)) {
      return {
        score: 0,
        algorithm: opts.algorithm,
        isDuplicate: false,
        metadata: {
          text1Length: text1.length,
          text2Length: text2.length,
          lengthRatio,
        },
      };
    }

    let score: number;
    let metadata: SimilarityResult['metadata'] = {
      text1Length: text1.length,
      text2Length: text2.length,
      lengthRatio,
    };

    switch (opts.algorithm) {
      case 'jaccard':
        const jaccardResult = this.jaccardSimilarity(norm1, norm2, opts);
        score = jaccardResult.score;
        metadata.tokenOverlap = jaccardResult.tokenOverlap;
        break;

      case 'levenshtein':
        const levResult = this.levenshteinSimilarity(norm1, norm2);
        score = levResult.score;
        metadata.editDistance = levResult.editDistance;
        break;

      case 'cosine':
        score = this.cosineSimilarity(norm1, norm2, opts);
        break;

      default:
        throw new Error(`Unknown algorithm: ${opts.algorithm}`);
    }

    return {
      score,
      algorithm: opts.algorithm,
      isDuplicate: score >= opts.threshold,
      metadata,
    };
  }

  /**
   * Jaccard similarity based on token overlap
   */
  private jaccardSimilarity(
    text1: string,
    text2: string,
    options: SimilarityOptions
  ): { score: number; tokenOverlap: number } {
    const tokens1 = this.tokenize(text1, options.normalizeTokens);
    const tokens2 = this.tokenize(text2, options.normalizeTokens);

    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    // Check minimum token overlap
    if (intersection.size < options.minTokenOverlap) {
      return { score: 0, tokenOverlap: intersection.size };
    }

    const score = union.size > 0 ? intersection.size / union.size : 0;

    return { score, tokenOverlap: intersection.size };
  }

  /**
   * Levenshtein (edit distance) similarity
   */
  private levenshteinSimilarity(
    text1: string,
    text2: string
  ): { score: number; editDistance: number } {
    const editDistance = this.levenshteinDistance(text1, text2);
    const maxLength = Math.max(text1.length, text2.length);
    const score = maxLength > 0 ? 1 - (editDistance / maxLength) : 1;

    return { score, editDistance };
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    // Create distance matrix
    const matrix: number[][] = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));

    // Initialize first column and row
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Cosine similarity using TF (term frequency)
   */
  private cosineSimilarity(
    text1: string,
    text2: string,
    options: SimilarityOptions
  ): number {
    const tokens1 = this.tokenize(text1, options.normalizeTokens);
    const tokens2 = this.tokenize(text2, options.normalizeTokens);

    // Create term frequency vectors
    const allTokens = new Set([...tokens1, ...tokens2]);
    const vector1: number[] = [];
    const vector2: number[] = [];

    for (const token of allTokens) {
      vector1.push([...tokens1].filter(t => t === token).length);
      vector2.push([...tokens2].filter(t => t === token).length);
    }

    // Calculate dot product and magnitudes
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      magnitude1 += vector1[i] * vector1[i];
      magnitude2 += vector2[i] * vector2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    return magnitude1 > 0 && magnitude2 > 0
      ? dotProduct / (magnitude1 * magnitude2)
      : 0;
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string, normalize: boolean = true): Set<string> {
    let processed = text;

    if (normalize) {
      // Remove punctuation, split on whitespace
      processed = text
        .replace(/[^\w\s]/g, ' ')
        .toLowerCase();
    }

    return new Set(
      processed
        .split(/\s+/)
        .filter(t => t.length > 0)
    );
  }

  /**
   * Find duplicates in a list of texts
   */
  findDuplicates(
    texts: Array<{ id: string; content: string }>,
    options?: Partial<SimilarityOptions>
  ): Array<{
    primary: string;
    duplicate: string;
    similarity: SimilarityResult;
  }> {
    const duplicates: Array<{
      primary: string;
      duplicate: string;
      similarity: SimilarityResult;
    }> = [];

    const opts = { ...this.defaultOptions, ...options };

    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const similarity = this.calculateSimilarity(
          texts[i].content,
          texts[j].content,
          opts
        );

        if (similarity.isDuplicate) {
          duplicates.push({
            primary: texts[i].id,
            duplicate: texts[j].id,
            similarity,
          });
        }
      }
    }

    return duplicates;
  }

  /**
   * Find near-duplicates for a specific text
   */
  findSimilar(
    targetText: string,
    candidates: Array<{ id: string; content: string }>,
    options?: Partial<SimilarityOptions>
  ): Array<{
    id: string;
    similarity: SimilarityResult;
  }> {
    const opts = { ...this.defaultOptions, ...options };
    const results: Array<{ id: string; similarity: SimilarityResult }> = [];

    for (const candidate of candidates) {
      const similarity = this.calculateSimilarity(
        targetText,
        candidate.content,
        opts
      );

      if (similarity.score >= opts.threshold) {
        results.push({
          id: candidate.id,
          similarity,
        });
      }
    }

    // Sort by similarity score (descending)
    return results.sort((a, b) => b.similarity.score - a.similarity.score);
  }

  /**
   * Batch similarity calculation with progress
   */
  async calculateBatchSimilarity(
    texts: Array<{ id: string; content: string }>,
    options?: Partial<SimilarityOptions>,
    onProgress?: (progress: { current: number; total: number; percentage: number }) => void
  ): Promise<Map<string, Map<string, SimilarityResult>>> {
    const results = new Map<string, Map<string, SimilarityResult>>();
    const totalPairs = (texts.length * (texts.length - 1)) / 2;
    let currentPair = 0;

    for (let i = 0; i < texts.length; i++) {
      const text1 = texts[i];
      if (!results.has(text1.id)) {
        results.set(text1.id, new Map());
      }

      for (let j = i + 1; j < texts.length; j++) {
        const text2 = texts[j];

        const similarity = this.calculateSimilarity(
          text1.content,
          text2.content,
          options
        );

        results.get(text1.id)!.set(text2.id, similarity);

        if (!results.has(text2.id)) {
          results.set(text2.id, new Map());
        }
        results.get(text2.id)!.set(text1.id, similarity);

        currentPair++;

        if (onProgress && currentPair % 100 === 0) {
          onProgress({
            current: currentPair,
            total: totalPairs,
            percentage: (currentPair / totalPairs) * 100,
          });
        }
      }
    }

    return results;
  }
}

// Singleton instance
export const similarityEngine = new SimilarityEngine();
