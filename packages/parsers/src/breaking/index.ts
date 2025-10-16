/**
 * Breaking Pipeline: Multi-level text decomposition
 *
 * Provides deterministic, modality-aware text breaking at multiple levels:
 * - Token: Individual words/tokens with byte offsets
 * - Phrase: N-grams and character shingles
 * - Sentence: Sentence boundary detection
 * - Block: Paragraphs, code fences, tables, equations
 * - Section: Heading hierarchy and structural signatures
 *
 * All modules preserve byte offsets for span-based virtual nodes.
 */

// Tokenizer: Break text into tokens
export {
  tokenize,
  tokenizeBatch,
  generateNgrams,
  generateShingles,
  type Token,
  type TokenizerConfig,
} from './tokenizer';

// Phraser: Extract phrases and n-grams
export {
  extractPhrases,
  extractFilteredPhrases,
  extractPhrasesBatch,
  getTopPhrases,
  getUniquePhrases,
  type Phrase,
  type PhraserConfig,
} from './phraser';

// Sentencer: Extract sentences
export {
  extractSentences,
  extractSentencesBatch,
  getSentenceAtOffset,
  mergeShortSentences,
  type Sentence,
  type SentencerConfig,
} from './sentencer';

// Blocker: Extract blocks
export {
  extractBlocks,
  extractBlocksBatch,
  getBlockAtOffset,
  filterBlocksByType,
  mergeAdjacentBlocks,
  type Block,
  type BlockerConfig,
} from './blocker';

// Sectioner: Extract section hierarchy
export {
  extractSections,
  extractSectionsBatch,
  getSectionAtOffset,
  getSectionHierarchy,
  getSectionPath,
  generateStructuralSignature,
  filterSectionsByType,
  getTopLevelSections,
  type Section,
  type SectionerConfig,
} from './sectioner';

// Signature Generator: Generate structural signatures
export {
  generateContentSignature,
  generateContentSignaturesBatch,
  calculateJaccardSimilarity,
  calculateCosineSimilarity,
  calculateTokenSketchSimilarity,
  extractLshBands,
  type ContentSignature,
  type StructuralSignature,
  type TokenSketch,
  type TfIdfVector,
  type MinHashSignature,
  type SignatureConfig,
  type LshBand,
} from './signature-generator';
