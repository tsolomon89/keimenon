/**
 * Policy System: Admin-configurable clustering and evidence parameters
 *
 * All numeric thresholds and behavioral knobs are defined here.
 * NO HARD-CODED CONSTANTS in the clustering engine.
 *
 * Policy is:
 * - Loaded from policy.yaml at runtime
 * - Editable via Admin UI
 * - Bundled in output manifests for reproducibility
 * - Versioned (changes create new configuration signatures)
 */

/**
 * Gray-band thresholds per (level × modality)
 */
export interface GrayBandThresholds {
  attach: number;       // Score >= attach → auto-attach to cluster
  review_lower: number; // attach > score >= review_lower → review queue
  reject_below: number; // score < reject_below → reject (no edge)
}

/**
 * Gray-band configuration per modality
 */
export interface ModalityThresholds {
  sentence: GrayBandThresholds;
  block: GrayBandThresholds;
  section: GrayBandThresholds;
}

/**
 * Clustering overlap policy
 */
export interface ClusteringOverlapPolicy {
  /**
   * Exclusive membership per slice (level × modality)
   * If true, node can belong to at most one cluster per slice
   */
  exclusive_per_slice: boolean;

  /**
   * Epsilon for multi-candidate detection
   * If two candidates within ε and different structural roots → review
   */
  review_epsilon: number;

  /**
   * Number of LSH bands for candidate generation
   */
  lsh_bands: number;

  /**
   * Number of rows per LSH band
   */
  lsh_rows_per_band: number;
}

/**
 * Temporal treatment in clustering
 */
export interface ClusteringTemporalPolicy {
  /**
   * Use temporal decay in membership decisions
   * If false, time only affects evidence ranking
   */
  use_in_membership: boolean;

  /**
   * Decay half-life in days (if use_in_membership=true)
   */
  decay_halflife_days?: number;
}

/**
 * Evidence weight configuration
 */
export interface EvidenceWeights {
  freq_weight: number;       // log1p(instances_count)
  diversity_weight: number;  // log1p(distinct_blobs)
  role_weight: number;       // unique_roles / 3
  temporal_weight: number;   // log1p(time_span_days)
  modality_weight: number;   // log1p(distinct_modalities)
  coherence_weight: number;  // avg(cluster_edge_scores) - for clusters
}

/**
 * Tokenization settings
 */
export interface TokenizationPolicy {
  prose: {
    case_fold: boolean;           // Lowercase tokens
    min_token_length: number;     // Min chars per token
    stop_words_enabled: boolean;  // Filter stop words
  };
  code: {
    language_aware: boolean;      // Use language-specific tokenizers
    preserve_operators: boolean;  // Keep operator tokens
    alpha_rename: boolean;        // Rename identifiers to VAR_N
  };
  math: {
    enabled: boolean;             // Extract TeX tokens
    preserve_macros: boolean;     // Keep TeX macros as tokens
  };
  /**
   * Ignore fence delimiters and math delimiters in tokenization
   */
  ignore_fences_and_delims: boolean;
}

/**
 * Tie-break rule ordering
 */
export type TieBreakRule = 'score' | 'nodekey' | 'timestamp' | 'contentid';

/**
 * Tie-break policy
 */
export interface TieBreakPolicy {
  /**
   * Ordered list of tie-break rules
   * Default: [score, nodekey, timestamp, contentid]
   */
  order: TieBreakRule[];

  /**
   * Epsilon for score equality (|Δscore| < epsilon → equal)
   */
  score_epsilon: number;
}

/**
 * Publishing policy for edges-only exports
 */
export interface PublishingPolicy {
  edges_only: {
    enabled: boolean;
    keep_last: number;           // Keep last N snapshots
    hash_algorithm: 'sha256';    // Algorithm for hashing IDs
    include_reason_codes: boolean;
  };
}

/**
 * Complete policy configuration
 */
export interface ClusteringPolicy {
  /**
   * Policy version (semver)
   */
  version: string;

  /**
   * Policy signature (hash of canonical YAML)
   */
  signature?: string;

  /**
   * Overlap and membership rules
   */
  overlap: ClusteringOverlapPolicy;

  /**
   * Temporal treatment
   */
  temporal: ClusteringTemporalPolicy;

  /**
   * Gray-band thresholds per modality
   */
  gray_band: {
    prose: ModalityThresholds;
    code: ModalityThresholds;
    math: ModalityThresholds;
    json: ModalityThresholds;
    markdown: ModalityThresholds;
  };

  /**
   * Evidence weights
   */
  evidence: EvidenceWeights;

  /**
   * Tokenization settings
   */
  tokenization: TokenizationPolicy;

  /**
   * Tie-break rules
   */
  tie_breaks: TieBreakPolicy;

  /**
   * Publishing settings
   */
  publishing: PublishingPolicy;
}

/**
 * Default policy (ships with repo)
 */
export const DEFAULT_POLICY: ClusteringPolicy = {
  version: '1.0.0',

  overlap: {
    exclusive_per_slice: true,
    review_epsilon: 0.01,
    lsh_bands: 32,
    lsh_rows_per_band: 4,
  },

  temporal: {
    use_in_membership: false,
  },

  gray_band: {
    prose: {
      sentence: { attach: 0.88, review_lower: 0.75, reject_below: 0.6 },
      block: { attach: 0.88, review_lower: 0.75, reject_below: 0.6 },
      section: { attach: 0.85, review_lower: 0.70, reject_below: 0.55 },
    },
    code: {
      sentence: { attach: 0.92, review_lower: 0.80, reject_below: 0.65 },
      block: { attach: 0.92, review_lower: 0.80, reject_below: 0.65 },
      section: { attach: 0.90, review_lower: 0.78, reject_below: 0.63 },
    },
    math: {
      sentence: { attach: 0.90, review_lower: 0.78, reject_below: 0.63 },
      block: { attach: 0.90, review_lower: 0.78, reject_below: 0.63 },
      section: { attach: 0.88, review_lower: 0.75, reject_below: 0.6 },
    },
    json: {
      sentence: { attach: 0.95, review_lower: 0.85, reject_below: 0.70 },
      block: { attach: 0.95, review_lower: 0.85, reject_below: 0.70 },
      section: { attach: 0.93, review_lower: 0.83, reject_below: 0.68 },
    },
    markdown: {
      sentence: { attach: 0.88, review_lower: 0.75, reject_below: 0.6 },
      block: { attach: 0.88, review_lower: 0.75, reject_below: 0.6 },
      section: { attach: 0.85, review_lower: 0.70, reject_below: 0.55 },
    },
  },

  evidence: {
    freq_weight: 0.5,
    diversity_weight: 0.3,
    role_weight: 0.1,
    temporal_weight: 0.05,
    modality_weight: 0.05,
    coherence_weight: 0.2, // For clusters
  },

  tokenization: {
    prose: {
      case_fold: true,
      min_token_length: 2,
      stop_words_enabled: true,
    },
    code: {
      language_aware: true,
      preserve_operators: true,
      alpha_rename: false,
    },
    math: {
      enabled: true,
      preserve_macros: true,
    },
    ignore_fences_and_delims: true,
  },

  tie_breaks: {
    order: ['score', 'nodekey', 'timestamp', 'contentid'],
    score_epsilon: 1e-6,
  },

  publishing: {
    edges_only: {
      enabled: true,
      keep_last: 10,
      hash_algorithm: 'sha256',
      include_reason_codes: true,
    },
  },
};

/**
 * Get thresholds for specific (level × modality) slice
 */
export function getThresholds(
  policy: ClusteringPolicy,
  modality: keyof ClusteringPolicy['gray_band'],
  level: keyof ModalityThresholds
): GrayBandThresholds {
  return policy.gray_band[modality][level];
}

/**
 * Validate policy (ensure thresholds are ordered correctly)
 */
export function validatePolicy(policy: ClusteringPolicy): string[] {
  const errors: string[] = [];

  // Check version
  if (!policy.version || !/^\d+\.\d+\.\d+$/.test(policy.version)) {
    errors.push('Invalid version format (expected semver)');
  }

  // Check overlap epsilon
  if (policy.overlap.review_epsilon <= 0 || policy.overlap.review_epsilon >= 1) {
    errors.push('review_epsilon must be in (0, 1)');
  }

  // Check evidence weights sum to reasonable value
  const evidenceSum =
    policy.evidence.freq_weight +
    policy.evidence.diversity_weight +
    policy.evidence.role_weight +
    policy.evidence.temporal_weight +
    policy.evidence.modality_weight;

  if (evidenceSum <= 0) {
    errors.push('Evidence weights must sum to positive value');
  }

  // Check gray-band thresholds for each modality
  for (const modality of Object.keys(policy.gray_band) as Array<keyof typeof policy.gray_band>) {
    for (const level of Object.keys(policy.gray_band[modality]) as Array<keyof ModalityThresholds>) {
      const thresholds = policy.gray_band[modality][level];

      if (thresholds.reject_below >= thresholds.review_lower) {
        errors.push(`${modality}.${level}: reject_below must be < review_lower`);
      }

      if (thresholds.review_lower >= thresholds.attach) {
        errors.push(`${modality}.${level}: review_lower must be < attach`);
      }

      if (thresholds.attach > 1.0 || thresholds.reject_below < 0) {
        errors.push(`${modality}.${level}: thresholds must be in [0, 1]`);
      }
    }
  }

  // Check tie-break order
  if (policy.tie_breaks.order.length === 0) {
    errors.push('tie_breaks.order must not be empty');
  }

  const validRules: TieBreakRule[] = ['score', 'nodekey', 'timestamp', 'contentid'];
  for (const rule of policy.tie_breaks.order) {
    if (!validRules.includes(rule)) {
      errors.push(`Invalid tie-break rule: ${rule}`);
    }
  }

  return errors;
}

/**
 * Compute policy signature (SHA-256 of canonical JSON)
 */
export function computePolicySignature(policy: ClusteringPolicy): string {
  const crypto = require('crypto');
  const canonical = JSON.stringify(policy, Object.keys(policy).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex').substring(0, 16);
}

/**
 * Clone policy with new signature
 */
export function signPolicy(policy: ClusteringPolicy): ClusteringPolicy {
  const signed = { ...policy };
  signed.signature = computePolicySignature(policy);
  return signed;
}
