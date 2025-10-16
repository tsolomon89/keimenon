/**
 * Signature Generator: Generate structural signatures for content nodes
 *
 * Purpose: Create deterministic signatures that prevent false merges across
 * different document sections or contexts.
 *
 * Signature types:
 * 1. Structural: "h1[2]|h2[5]|p[3]" (section path with indices)
 * 2. Token sketch: "op|ident|num|..." (lightweight AST for code)
 * 3. TF-IDF vector: Term frequency for prose
 * 4. MinHash: Locality-sensitive hash for similarity
 */

import { extractSections } from './sectioner';
import { tokenize, generateNgrams, generateShingles } from './tokenizer';
import { normalizeText } from '../utils/text-normalizer';
import { generateContentId } from '../utils/id-generator';

/**
 * Structural signature for a content node
 */
export interface StructuralSignature {
  /**
   * Section path: "h1[2]|h2[5]|p[3]"
   */
  path: string;

  /**
   * Break level: token | phrase | sentence | block | section
   */
  level: 'token' | 'phrase' | 'sentence' | 'block' | 'section';

  /**
   * Byte span in original blob
   */
  byteStart: number;
  byteEnd: number;

  /**
   * Modality: code | prose | markdown | json | etc.
   */
  modality: string;

  /**
   * Parent node ID (if applicable)
   */
  parentNodeId?: string;
}

/**
 * Token sketch for code similarity
 */
export interface TokenSketch {
  /**
   * Sequence of token types: "op|ident|num|..."
   */
  sketch: string;

  /**
   * Token type counts: {ident: 5, op: 3, num: 2}
   */
  counts: Record<string, number>;

  /**
   * Unique token types
   */
  uniqueTypes: string[];
}

/**
 * TF-IDF vector for prose similarity
 */
export interface TfIdfVector {
  /**
   * Term frequencies: {word: frequency}
   */
  terms: Record<string, number>;

  /**
   * Total term count
   */
  totalTerms: number;

  /**
   * Unique terms
   */
  uniqueTerms: string[];
}

/**
 * MinHash signature for similarity detection
 */
export interface MinHashSignature {
  /**
   * Hash values (one per permutation)
   */
  hashes: number[];

  /**
   * Number of permutations
   */
  numPermutations: number;

  /**
   * Shingle size (for character-based)
   */
  shingleSize?: number;

  /**
   * N-gram size (for token-based)
   */
  ngramSize?: number;
}

/**
 * Complete signature for a content node
 */
export interface ContentSignature {
  /**
   * Content ID (canonical hash)
   */
  contentId: string;

  /**
   * Structural signature
   */
  structural: StructuralSignature;

  /**
   * Token sketch (for code)
   */
  tokenSketch?: TokenSketch;

  /**
   * TF-IDF vector (for prose)
   */
  tfIdf?: TfIdfVector;

  /**
   * MinHash signature
   */
  minHash: MinHashSignature;

  /**
   * Metadata
   */
  metadata: {
    originalSize: number;
    normalizedSize: number;
    language?: string;
  };
}

/**
 * Configuration for signature generation
 */
export interface SignatureConfig {
  /**
   * Number of MinHash permutations
   */
  numPermutations?: number;

  /**
   * Character shingle size (for short text)
   */
  shingleSize?: number;

  /**
   * N-gram size (for longer text)
   */
  ngramSize?: number;

  /**
   * Generate token sketch (for code)
   */
  generateTokenSketch?: boolean;

  /**
   * Generate TF-IDF vector (for prose)
   */
  generateTfIdf?: boolean;

  /**
   * Modality override (auto-detect if not specified)
   */
  modality?: string;
}

const DEFAULT_CONFIG: SignatureConfig = {
  numPermutations: 128,
  shingleSize: 13,
  ngramSize: 3,
  generateTokenSketch: true,
  generateTfIdf: true,
};

/**
 * Generate complete signature for a content node
 */
export function generateContentSignature(
  text: string,
  byteStart: number,
  byteEnd: number,
  level: StructuralSignature['level'],
  contextText: string, // Full document context for structural path
  config: SignatureConfig = {}
): ContentSignature {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Normalize text
  const normalized = normalizeText(text);
  const contentId = generateContentId(normalized.normalized);

  // Detect modality
  const modality = cfg.modality || detectModality(text);

  // Generate structural signature
  const structural = generateStructuralSignatureForNode(
    text,
    byteStart,
    byteEnd,
    level,
    contextText,
    modality
  );

  // Generate token sketch (for code)
  let tokenSketch: TokenSketch | undefined;
  if (cfg.generateTokenSketch && (modality === 'code' || looksLikeCode(text))) {
    tokenSketch = generateTokenSketchForText(text);
  }

  // Generate TF-IDF vector (for prose)
  let tfIdf: TfIdfVector | undefined;
  if (cfg.generateTfIdf && modality !== 'code' && !looksLikeCode(text)) {
    tfIdf = generateTfIdfVector(text);
  }

  // Generate MinHash signature
  const minHash = generateMinHash(
    text,
    cfg.numPermutations!,
    cfg.shingleSize!,
    cfg.ngramSize!
  );

  return {
    contentId,
    structural,
    tokenSketch,
    tfIdf,
    minHash,
    metadata: {
      originalSize: text.length,
      normalizedSize: normalized.normalized.length,
      language: modality,
    },
  };
}

/**
 * Generate structural signature for a node
 */
function generateStructuralSignatureForNode(
  _text: string,
  byteStart: number,
  byteEnd: number,
  level: StructuralSignature['level'],
  contextText: string,
  modality: string
): StructuralSignature {
  // Extract sections from context
  const sections = extractSections(contextText);

  // Find section containing this node
  let path = 'root';
  for (const section of sections) {
    if (byteStart >= section.start && byteEnd <= section.end) {
      path = section.path;
      break;
    }
  }

  // Append node-specific path segment
  if (level !== 'section') {
    path += `|${level}[0]`; // Index would be determined by parent context
  }

  return {
    path,
    level,
    byteStart,
    byteEnd,
    modality,
  };
}

/**
 * Generate token sketch for code
 */
function generateTokenSketchForText(text: string): TokenSketch {
  const tokens = tokenize(text, { language: 'code' });

  const sketch: string[] = [];
  const counts: Record<string, number> = {};

  for (const token of tokens) {
    const type = token.type;
    sketch.push(type);
    counts[type] = (counts[type] || 0) + 1;
  }

  return {
    sketch: sketch.join('|'),
    counts,
    uniqueTypes: Object.keys(counts),
  };
}

/**
 * Generate TF-IDF vector for prose
 */
function generateTfIdfVector(text: string): TfIdfVector {
  const tokens = tokenize(text, { language: 'prose', lowercase: true });

  const terms: Record<string, number> = {};
  let totalTerms = 0;

  for (const token of tokens) {
    if (token.type === 'word') {
      terms[token.text] = (terms[token.text] || 0) + 1;
      totalTerms++;
    }
  }

  return {
    terms,
    totalTerms,
    uniqueTerms: Object.keys(terms),
  };
}

/**
 * Generate MinHash signature
 */
function generateMinHash(
  text: string,
  numPermutations: number,
  shingleSize: number,
  ngramSize: number
): MinHashSignature {
  // For short text, use character shingles
  const useShingles = text.length < 100;

  let features: string[];
  if (useShingles) {
    features = generateShingles(text, shingleSize);
  } else {
    const tokens = tokenize(text);
    features = generateNgrams(tokens, ngramSize);
  }

  // Generate hash functions (simple hash with different seeds)
  const hashes: number[] = [];
  for (let i = 0; i < numPermutations; i++) {
    let minHash = Infinity;
    for (const feature of features) {
      const hash = simpleHash(feature, i);
      if (hash < minHash) {
        minHash = hash;
      }
    }
    hashes.push(minHash);
  }

  return {
    hashes,
    numPermutations,
    shingleSize: useShingles ? shingleSize : undefined,
    ngramSize: useShingles ? undefined : ngramSize,
  };
}

/**
 * Simple hash function with seed
 */
function simpleHash(str: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Calculate Jaccard similarity from MinHash signatures
 */
export function calculateJaccardSimilarity(
  sig1: MinHashSignature,
  sig2: MinHashSignature
): number {
  if (sig1.hashes.length !== sig2.hashes.length) {
    throw new Error('MinHash signatures must have same number of permutations');
  }

  let matches = 0;
  for (let i = 0; i < sig1.hashes.length; i++) {
    if (sig1.hashes[i] === sig2.hashes[i]) {
      matches++;
    }
  }

  return matches / sig1.hashes.length;
}

/**
 * Calculate cosine similarity from TF-IDF vectors
 */
export function calculateCosineSimilarity(
  vec1: TfIdfVector,
  vec2: TfIdfVector
): number {
  const allTerms = new Set([...vec1.uniqueTerms, ...vec2.uniqueTerms]);

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (const term of allTerms) {
    const freq1 = vec1.terms[term] || 0;
    const freq2 = vec2.terms[term] || 0;
    dotProduct += freq1 * freq2;
    norm1 += freq1 * freq1;
    norm2 += freq2 * freq2;
  }

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Calculate token sketch similarity (for code)
 */
export function calculateTokenSketchSimilarity(
  sketch1: TokenSketch,
  sketch2: TokenSketch
): number {
  // Use Jaccard similarity on token type sets
  const types1 = new Set(sketch1.uniqueTypes);
  const types2 = new Set(sketch2.uniqueTypes);

  const intersection = new Set([...types1].filter((x) => types2.has(x)));
  const union = new Set([...types1, ...types2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Detect text modality
 */
function detectModality(text: string): string {
  if (looksLikeCode(text)) return 'code';
  if (text.includes('```')) return 'markdown';
  if (text.startsWith('{') || text.startsWith('[')) return 'json';
  if (text.includes('\\section') || text.includes('\\begin{')) return 'latex';
  return 'prose';
}

/**
 * Heuristic to detect code
 */
function looksLikeCode(text: string): boolean {
  const codeIndicators = [
    /function\s+\w+/,
    /const\s+\w+\s*=/,
    /class\s+\w+/,
    /def\s+\w+/,
    /import\s+/,
  ];

  for (const pattern of codeIndicators) {
    if (pattern.test(text)) return true;
  }

  const operators = (text.match(/[{}()[\];=<>+\-*/%&|^~]/g) || []).length;
  const chars = text.length;
  return chars > 0 && operators / chars > 0.1;
}

/**
 * Batch generate signatures for multiple texts
 */
export function generateContentSignaturesBatch(
  texts: string[],
  level: StructuralSignature['level'],
  contextText: string,
  config: SignatureConfig = {}
): ContentSignature[] {
  return texts.map((_text, i) =>
    generateContentSignature(
      _text,
      i * 100, // Placeholder byte offsets
      (i + 1) * 100,
      level,
      contextText,
      config
    )
  );
}

/**
 * Extract LSH bands from MinHash signature
 * Used for incremental band persistence
 */
export interface LshBand {
  bandIndex: number;
  bandHash: string;
  signature: number[];
}

export function extractLshBands(
  minHash: MinHashSignature,
  bandsCount: number
): LshBand[] {
  const rowsPerBand = Math.ceil(minHash.hashes.length / bandsCount);
  const bands: LshBand[] = [];

  for (let b = 0; b < bandsCount; b++) {
    const start = b * rowsPerBand;
    const end = Math.min(start + rowsPerBand, minHash.hashes.length);
    const bandSignature = minHash.hashes.slice(start, end);

    // Hash the band signature
    const bandHashValue = simpleHash(bandSignature.join(','), 0);
    const bandHash = `band_${bandHashValue.toString(16)}`;

    bands.push({
      bandIndex: b,
      bandHash,
      signature: bandSignature,
    });
  }

  return bands;
}
