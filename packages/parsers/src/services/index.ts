/**
 * Services: High-level services for content processing and storage
 *
 * Provides:
 * - ContentProcessor: Apply breaking pipeline to conversations
 * - GroupingStorage: Persist blobs, spans, signatures, LSH bands
 * - DeduplicationEngine: Non-destructive canonicalization with evidence weights
 * - ClusteringEngine: NEAR_DUP detection with policy-driven decisions
 * - JmdProcessor: J+MD surface integration
 * - NearDupEdgeGenerator: Scored similarity edges
 * - ClusterEvidenceComputer: Evidence roll-up with coherence
 */

// Content Processor exports
export {
  ContentProcessor,
  createContentProcessor,
  processText,
  type Blob,
  type NodeSpan,
  type NodeSignature,
  type ProcessedContent,
  type ProcessingConfig,
} from './content-processor';

// Grouping Storage exports
export {
  GroupingStorage,
  createGroupingStorage,
  type LshBandRecord,
  type Cluster,
  type ClusterMember,
} from './grouping-storage';

// Deduplication Engine exports
export {
  DeduplicationEngine,
  createDeduplicationEngine,
  type EvidenceWeightsConfig,
  type CanonicalStats,
  type NodeInstance,
  type DeduplicationResult,
} from './deduplication-engine';

// J+MD Processor exports
export {
  JmdProcessor,
  createJmdProcessor,
  type JmdConversionResult,
  type JmdSpanMapping,
} from './jmd-processor';

// Clustering Engine exports
export {
  ClusteringEngine,
  createClusteringEngine,
  type SimilarityScore,
  type ReasonCode,
  type ReasonMetadata,
  type ClusterCandidate,
  type ClusterDecision,
  type DecisionResult,
  type ClusteringResult,
} from './clustering-engine';

// NEAR_DUP Edge exports
export {
  NearDupEdgeGenerator,
  createNearDupEdgeGenerator,
  generateReasonMetadata,
  type NearDupEdge,
  type EdgeGenerationResult,
} from './near-dup-edges';

// Cluster Evidence exports
export {
  ClusterEvidenceComputer,
  createClusterEvidenceComputer,
  type ClusterEvidence,
} from './cluster-evidence';

// Cluster Run Tracker exports
export {
  ClusterRunTracker,
  createClusterRunTracker,
  type ClusterRun,
  type ClusterRunStats,
} from './cluster-run-tracker';

// Cluster Manual Operations exports
export {
  ClusterManualOps,
  createClusterManualOps,
  type ClusterMergeResult,
  type ClusterSplitResult,
  type ClusterOperation,
} from './cluster-manual-ops';

// Similarity Engine V2 exports
export {
  SimilarityEngineV2,
  type SimilarityEngineDocument,
  type SimilarityEngineInput,
  type SimilarityEdgeV2,
  type SimilarityClusterV2,
  type SimilarityEngineResult,
} from './similarity-engine-v2';
