import { tokenize, jaccard, normalizeText } from '@keimenon/parsers';

export interface DuplicateSimilarityConfig {
  exactMatch: boolean;
  similarityThreshold: number;
  algorithm: 'jaccard' | 'levenshtein' | 'cosine' | 'embedding';
  normalizeTokens: boolean;
  minTokenOverlap: number;
  lengthRatioTolerance: number;
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
}

export interface DuplicateSimilarityResult {
  isDuplicate: boolean;
  similarity: number;
  metrics: {
    tokenOverlap: number;
    editDistance: number;
    lengthRatio: number;
  };
}

export function isEmbeddingsDuplicateDetectionEnabled(): boolean {
  return process.env.DEDUP_EMBEDDINGS_ENABLED === 'true';
}

export function computeDuplicateSimilarity(
  contentA: string,
  contentB: string,
  config: DuplicateSimilarityConfig
): DuplicateSimilarityResult {
  let processedA = contentA;
  let processedB = contentB;

  if (config.ignoreWhitespace) {
    processedA = processedA.replace(/\s+/g, ' ').trim();
    processedB = processedB.replace(/\s+/g, ' ').trim();
  }

  if (config.ignoreCase) {
    processedA = processedA.toLowerCase();
    processedB = processedB.toLowerCase();
  }

  const tokensA = config.normalizeTokens
    ? tokenize(normalizeText(processedA))
    : tokenize(processedA);
  const tokensB = config.normalizeTokens
    ? tokenize(normalizeText(processedB))
    : tokenize(processedB);
  const tokenOverlap = new Set(Array.from(tokensA).filter((token) => tokensB.has(token))).size;

  if (config.exactMatch && processedA === processedB) {
    return {
      isDuplicate: true,
      similarity: 1,
      metrics: {
        tokenOverlap: tokenOverlap || tokensA.size,
        editDistance: 0,
        lengthRatio: 1,
      },
    };
  }

  let similarity = 0;
  let editDistance = 0;

  switch (config.algorithm) {
    case 'jaccard':
      similarity = jaccard(tokensA, tokensB);
      break;
    case 'levenshtein':
      editDistance = levenshteinDistance(processedA, processedB);
      similarity =
        Math.max(processedA.length, processedB.length) > 0
          ? 1 - editDistance / Math.max(processedA.length, processedB.length)
          : 1;
      break;
    case 'cosine':
      similarity = cosineSimilarity(tokensA, tokensB);
      break;
    case 'embedding':
      // Embeddings strategy is explicit and feature-flagged. When disabled, fallback is deterministic.
      if (!isEmbeddingsDuplicateDetectionEnabled()) {
        similarity = jaccard(tokensA, tokensB);
      } else {
        similarity = jaccard(tokensA, tokensB);
      }
      break;
    default:
      similarity = 0;
      break;
  }

  const maxLength = Math.max(processedA.length, processedB.length);
  const lengthRatio =
    maxLength > 0 ? Math.min(processedA.length, processedB.length) / maxLength : 1;
  const meetsLengthRatio = lengthRatio >= 1 - config.lengthRatioTolerance;
  const meetsTokenOverlap = tokenOverlap >= config.minTokenOverlap;
  const meetsSimilarity = similarity >= config.similarityThreshold;

  return {
    isDuplicate: meetsSimilarity && meetsLengthRatio && meetsTokenOverlap,
    similarity,
    metrics: {
      tokenOverlap,
      editDistance,
      lengthRatio,
    },
  };
}

export function levenshteinDistance(left: string, right: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= left.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= right.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      if (left[i - 1] === right[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }

  return matrix[left.length][right.length];
}

export function cosineSimilarity(tokensA: Set<string>, tokensB: Set<string>): number {
  const vocabulary = new Set([...Array.from(tokensA), ...Array.from(tokensB)]);
  if (vocabulary.size === 0) {
    return 0;
  }

  const vectorA: number[] = [];
  const vectorB: number[] = [];

  for (const token of Array.from(vocabulary)) {
    vectorA.push(tokensA.has(token) ? 1 : 0);
    vectorB.push(tokensB.has(token) ? 1 : 0);
  }

  let dotProduct = 0;
  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
  }

  const magnitudeA = Math.sqrt(vectorA.reduce((sum, value) => sum + value * value, 0));
  const magnitudeB = Math.sqrt(vectorB.reduce((sum, value) => sum + value * value, 0));

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}
