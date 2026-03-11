// Type exports
export * from './types';

// Parser exports
export {
  ParserRegistry,
  ChatGPTParser,
  ClaudeParser,
  GeminiParser,
  GenericParser,
} from './parsers';

// Utility exports
export { fingerprint, normalizeText, tokenize, jaccard, normalizeTitle } from './utils/fingerprint';
export {
  extractCodeBlocks,
  codeBlocksToAssets,
  deduplicateCodeAssets,
  generateCodeFilename,
} from './utils/code-extractor';

// New normalization and ID generation utilities
export {
  normalizeText as normalizeTextCanonical,
  normalizeToBuffer,
  validateCanonicalForm,
  hashCanonical,
  normalizeTexts,
  type NormalizationResult,
  type NormalizationConfig,
} from './utils/text-normalizer';

export {
  generateBlobId,
  generateNodeKey,
  generateContentId,
  generateNodeId as generateLegacyNodeId, // Alias to avoid conflict with CAS generateNodeId
  generateClusterId,
  generateHierarchicalNodeKey,
  parseBlobId,
  parseNodeKey,
  parseContentId,
  validateIdFormat,
  generateNodeKeys,
  generateContentIds,
  IdGeneratorWithStats,
  type IdGenerationStats,
} from './utils/id-generator';

// Sources Mode exports
export { SegmentExtractor } from './sources/segment-extractor';
export { SourcesStitcher } from './sources/stitcher';

// Normalizer exports
export {
  JsonNormalizer,
  normalizeJson,
  normalizeJsonBatch,
  jsonEquals,
  createNormalizerPreset,
  type JsonNormalizerConfig,
  type JsonNormalizationResult,
} from './normalizers/json-normalizer';

export {
  CodeNormalizer,
  normalizeCode,
  normalizeCodeBatch,
  type CodeNormalizerConfig,
  type CodeNormalizationResult,
} from './normalizers/code-normalizer';

export {
  MarkdownNormalizer,
  normalizeMarkdown,
  extractSemanticText,
  extractCodeBlocks as extractMarkdownCodeBlocks,
  extractHeadings,
  type MarkdownNormalizerConfig,
  type MarkdownNormalizationResult,
  type CodeIsland,
} from './normalizers/markdown-normalizer';

// Canonicalization and Content Addressing exports
export {
  canonicalize,
  areCanonicallyEqual,
  canonicalizeForNodeType,
  validateCanonicalizeProperties,
  TEST_VECTORS,
  type CanonicalizeOptions,
} from './services/canonicalization';

export {
  contentHash,
  contentHashForNodeType,
  generateNodeId,
  parseNodeId,
  areHashesEqual,
  isValidContentHash,
  isValidNodeId,
  createContentAddressedNode,
  calculateDeduplicationSavings,
  analyzeDeduplication,
  createMergePlan,
  batchContentHash,
  findDuplicatesInBatch,
  ContentAddressingMonitor,
  createMonitoredHashFunction,
  HASH_ALGORITHM,
  HASH_ENCODING,
  type ContentHash,
  type NodeId,
  type ContentAddressedNode,
  type DeduplicationResult as CASDeduplicationResult,
  type ContentAddressingStats,
} from './services/content-addressing';

// Services exports
export {
  ContentProcessor,
  createContentProcessor,
  processText,
  GroupingStorage,
  createGroupingStorage,
  DeduplicationEngine,
  createDeduplicationEngine,
  ClusteringEngine,
  createClusteringEngine,
  ClusterEvidenceComputer,
  createClusterEvidenceComputer,
  ClusterRunTracker,
  createClusterRunTracker,
  ClusterManualOps,
  createClusterManualOps,
  type Blob,
  type NodeSpan,
  type NodeSignature,
  type ProcessedContent,
  type ProcessingConfig,
  type LshBandRecord,
  type Cluster,
  type ClusterMember,
  type EvidenceWeightsConfig,
  type CanonicalStats,
  type NodeInstance,
  type DeduplicationResult,
  type ClusteringResult,
  type ClusterEvidence,
  type ClusterRun,
  type ClusterRunStats,
  type ClusterMergeResult,
  type ClusterSplitResult,
  type ClusterOperation,
  SimilarityEngineV2,
  type SimilarityEngineDocument,
  type SimilarityEngineInput,
  type SimilarityEdgeV2,
  type SimilarityClusterV2,
  type SimilarityEngineResult,
} from './services';

// Breaking Pipeline exports
export {
  // Tokenizer
  tokenize as tokenizeText,
  tokenizeBatch,
  generateNgrams,
  generateShingles,
  // Phraser
  extractPhrases,
  extractFilteredPhrases,
  extractPhrasesBatch,
  getTopPhrases,
  getUniquePhrases,
  // Sentencer
  extractSentences,
  extractSentencesBatch,
  getSentenceAtOffset,
  mergeShortSentences,
  // Blocker
  extractBlocks,
  extractBlocksBatch,
  getBlockAtOffset,
  filterBlocksByType,
  mergeAdjacentBlocks,
  // Sectioner
  extractSections,
  extractSectionsBatch,
  getSectionAtOffset as getSectionAtByteOffset,
  getSectionHierarchy,
  getSectionPath,
  generateStructuralSignature,
  filterSectionsByType,
  getTopLevelSections,
  // Signature Generator
  generateContentSignature,
  generateContentSignaturesBatch,
  calculateJaccardSimilarity,
  calculateCosineSimilarity,
  calculateTokenSketchSimilarity,
  extractLshBands,
  // Types
  type Token,
  type TokenizerConfig,
  type Phrase,
  type PhraserConfig,
  type Sentence,
  type SentencerConfig,
  type Block,
  type BlockerConfig,
  type Section,
  type SectionerConfig,
  type ContentSignature,
  type StructuralSignature,
  type TokenSketch,
  type TfIdfVector,
  type MinHashSignature,
  type SignatureConfig,
  type LshBand,
} from './breaking';
