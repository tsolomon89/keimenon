/**
 * Task Types for Agent Services
 *
 * Represents units of work with deterministic inputs and auditable outputs.
 * Tasks are immutable once created - only status changes during execution.
 */

/**
 * Supported task types
 */
export type TaskType = 'GROUP_SUMMARY_BUILD' | 'DUPLICATE_SUGGEST' | 'VERIFY_SOURCE_CHAIN';

/**
 * Task execution status
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Run execution status (for individual attempts)
 */
export type RunStatus = 'running' | 'completed' | 'failed';

/**
 * Artifact types produced by tasks
 */
export type ArtifactType = 'canonical_doc' | 'cluster_json' | 'evidence_chain' | 'diff' | 'log';

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  max_attempts: number;
  backoff_ms: number;
  backoff_multiplier?: number;
}

/**
 * Task configuration - versioned for reproducibility
 */
export interface TaskConfig {
  /** Config version for backwards compatibility */
  version: string;
  /** Model policy (e.g., 'gpt-4', 'local-only', 'any') */
  model_policy?: string;
  /** Max tokens for LLM operations */
  max_tokens?: number;
  /** Retry policy for failed operations */
  retry_policy?: RetryPolicy;
  /** Timeout in milliseconds */
  timeout_ms?: number;
}

/**
 * Base Task interface
 *
 * Represents a unit of work to be executed by the agent.
 * Tasks are immutable once created - only status changes.
 */
export interface Task<TInput = Record<string, unknown>> {
  /** Unique task identifier */
  id: string;
  /** Task type determines the handler */
  type: TaskType;
  /** Account owning this task */
  account_id: string;
  /** Agent executing this task */
  agent_id: string;
  /** Current execution status */
  status: TaskStatus;
  /** Type-specific input data */
  input: TInput;
  /** Versioned configuration */
  config: TaskConfig;
  /** Creation timestamp */
  created_at: number;
  /** When execution started */
  started_at?: number;
  /** When execution completed */
  completed_at?: number;
  /** Error message if failed */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Run represents a single execution attempt of a Task
 */
export interface Run {
  /** Unique run identifier */
  id: string;
  /** Parent task ID */
  task_id: string;
  /** Attempt number (1-indexed) */
  attempt: number;
  /** Current run status */
  status: RunStatus;
  /** When this run started */
  started_at: number;
  /** When this run completed */
  completed_at?: number;
  /** Error message if failed */
  error?: string;
  /** Execution metrics */
  metrics: RunMetrics;
}

/**
 * Metrics collected during run execution
 */
export interface RunMetrics {
  /** Total duration in milliseconds */
  duration_ms: number;
  /** Tokens used (if LLM involved) */
  tokens_used?: number;
  /** Estimated cost in USD */
  cost_usd?: number;
  /** Number of API calls made */
  api_calls?: number;
  /** Memory usage in bytes */
  memory_bytes?: number;
  /** Allow additional custom metrics */
  [key: string]: number | undefined;
}

/**
 * Artifact produced by a task run
 */
export interface Artifact {
  /** Unique artifact identifier */
  id: string;
  /** Parent run ID */
  run_id: string;
  /** Artifact type */
  type: ArtifactType;
  /** Content hash for deduplication */
  content_hash: string;
  /** Local CAS storage path */
  storage_path: string;
  /** Creation timestamp */
  created_at: number;
  /** Type-specific metadata */
  metadata?: Record<string, unknown>;
}

// ============================================
// Task-specific input types
// ============================================

/**
 * Input for GROUP_SUMMARY_BUILD task
 */
export interface GroupSummaryInput {
  /** Group to summarize */
  groupId: string;
  /** How to select sources */
  selectionPolicy: 'all' | 'top_n' | 'keyword_filter';
  /** Max sources to include (for top_n) */
  maxSources?: number;
  /** Keywords to filter by (for keyword_filter) */
  filterKeywords?: string[];
  /** Max tokens for output */
  maxTokens: number;
  /** Model to use */
  modelPolicy: string;
}

/**
 * Output from GROUP_SUMMARY_BUILD task
 */
export interface GroupSummaryOutput {
  /** ID of created CanonicalDoc node */
  canonicalDocId: string;
  /** IDs of sources used */
  sourcesUsed: string[];
  /** Actual token count */
  tokenCount: number;
}

/**
 * Input for DUPLICATE_SUGGEST task
 */
export interface DuplicateSuggestInput {
  /** Scope of duplicate detection */
  scope: 'group' | 'board' | 'import_batch';
  /** ID of the scope (groupId, boardId, or batchId) */
  scopeId: string;
  /** Threshold configuration */
  thresholdPolicy: {
    min_similarity: number;
    algorithm: 'jaccard' | 'cosine' | 'levenshtein' | 'hash' | 'hybrid';
  };
  /** Whether to create DuplicateCluster nodes in the graph (default: true) */
  createNodes?: boolean;
}

/**
 * A cluster of potential duplicates
 */
export interface DuplicateCluster {
  /** Cluster identifier */
  id: string;
  /** Suggested canonical source ID */
  canonical_id: string;
  /** Cluster members with similarity scores */
  members: Array<{
    id: string;
    similarity: number;
  }>;
}

/**
 * Output from DUPLICATE_SUGGEST task
 */
export interface DuplicateSuggestOutput {
  /** Detected duplicate clusters */
  clusters: DuplicateCluster[];
  /** Path to clusters.json artifact */
  artifactPath: string;
}

/**
 * Input for VERIFY_SOURCE_CHAIN task
 */
export interface VerifySourceChainInput {
  /** Target to verify (groupId or sourceId) */
  targetId: string;
  /** Verification policy */
  policy: {
    /** Domain credibility weights */
    domain_weights: Record<string, number>;
    /** Maximum hops in evidence chain */
    max_hops: number;
    /** Maximum sources to fetch */
    max_sources: number;
    /** Explicit override for sending full raw content outside local runtime */
    allow_full_raw_egress?: boolean;
  };
}

/**
 * Output from VERIFY_SOURCE_CHAIN task
 */
export interface VerifySourceChainOutput {
  /** Created evidence node IDs */
  evidenceNodes: string[];
  /** Created objective/claim node IDs */
  objectiveNodes: string[];
  /** Overall credibility score */
  credibilityScore: number;
}

/**
 * Type-safe task with specific input type
 */
export type TypedTask<T extends TaskType> = T extends 'GROUP_SUMMARY_BUILD'
  ? Task<GroupSummaryInput>
  : T extends 'DUPLICATE_SUGGEST'
    ? Task<DuplicateSuggestInput>
    : T extends 'VERIFY_SOURCE_CHAIN'
      ? Task<VerifySourceChainInput>
      : Task;
