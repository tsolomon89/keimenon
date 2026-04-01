import { z } from 'zod';

export const IMPORT_CONTRACT_VERSION = 'v3' as const;
export const IMPORT_PROCESSING_RAILS = ['multipart', 'chunked'] as const;
export type ImportProcessingRail = (typeof IMPORT_PROCESSING_RAILS)[number];

export const ImportConfigSchema = z
  .object({
    platform: z.enum(['chatgpt', 'claude', 'gemini', 'generic']).optional(),
    extraction: z
      .object({
        includeUser: z.boolean().default(true),
        includeAssistant: z.boolean().default(false),
      })
      .default({ includeUser: true, includeAssistant: false }),
    minMessageLength: z.number().min(0).default(400),
    processingMode: z.enum(['automatic', 'manual', 'hybrid']).default('automatic'),
    branches: z.enum(['merged', 'separate']).default('merged'),
    agent: z
      .object({
        bootstrap: z.enum(['manual', 'auto']).default('manual'),
      })
      .default({
        bootstrap: 'manual',
      }),
    groups: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          keywords: z.array(z.string()),
        })
      )
      .default([]),
    extractCode: z.boolean().default(true),
    codeSettings: z
      .object({
        minLength: z.number().min(0).default(50),
        languages: z.array(z.string()).default([]),
        groupBy: z.enum(['language', 'conversation', 'keyword']).default('language'),
        deduplicate: z.boolean().default(true),
        sourceHandling: z.enum(['keep_inline', 'extract_and_remove']).default('extract_and_remove'),
      })
      .default({
        minLength: 50,
        languages: [],
        groupBy: 'language',
        deduplicate: true,
        sourceHandling: 'extract_and_remove',
      }),
    duplicateDetection: z
      .object({
        enabled: z.boolean().default(true),
        exactMatch: z.boolean().default(true),
        similarityThreshold: z.number().min(0).max(1).default(0.85),
        crossConversation: z.boolean().default(true),
        algorithm: z.enum(['jaccard', 'levenshtein', 'cosine', 'embedding']).default('jaccard'),
        normalizeTokens: z.boolean().default(true),
        minTokenOverlap: z.number().min(0).default(5),
        lengthRatioTolerance: z.number().min(0).default(0.2),
        ignoreWhitespace: z.boolean().default(true),
        ignoreCase: z.boolean().default(false),
        ignoreTimestamp: z.boolean().default(true),
        requireReview: z.boolean().default(true),
        autoApproveExact: z.boolean().default(false),
        autoMergeThreshold: z.number().min(0).max(1).default(0.95),
      })
      .default({
        enabled: true,
        exactMatch: true,
        similarityThreshold: 0.85,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 5,
        lengthRatioTolerance: 0.2,
        ignoreWhitespace: true,
        ignoreCase: false,
        ignoreTimestamp: true,
        requireReview: true,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      }),
  })
  .partial();

export type ImportConfigInput = z.input<typeof ImportConfigSchema>;
export type ParsedImportConfig = z.infer<typeof ImportConfigSchema>;

export interface NormalizedImportOptions {
  platform: 'chatgpt' | 'claude' | 'gemini' | 'generic';
  extraction: {
    includeUser: boolean;
    includeAssistant: boolean;
  };
  minMessageLength: number;
  processingMode: 'automatic' | 'manual' | 'hybrid';
  branches: 'merged' | 'separate';
  agent: {
    bootstrap: 'manual' | 'auto';
  };
  groups: Array<{ id: string; name: string; keywords: string[] }>;
  extractCode: boolean;
  codeSettings: {
    minLength: number;
    languages: string[];
    groupBy: 'language' | 'conversation' | 'keyword';
    deduplicate: boolean;
    sourceHandling: 'keep_inline' | 'extract_and_remove';
  };
  duplicateDetection: {
    enabled: boolean;
    exactMatch: boolean;
    similarityThreshold: number;
    crossConversation: boolean;
    algorithm: 'jaccard' | 'levenshtein' | 'cosine' | 'embedding';
    normalizeTokens: boolean;
    minTokenOverlap: number;
    lengthRatioTolerance: number;
    ignoreWhitespace: boolean;
    ignoreCase: boolean;
    ignoreTimestamp: boolean;
    requireReview: boolean;
    autoApproveExact: boolean;
    autoMergeThreshold: number;
  };
}

const DEFAULT_IMPORT_OPTIONS: NormalizedImportOptions = {
  platform: 'generic',
  extraction: {
    includeUser: true,
    includeAssistant: false,
  },
  minMessageLength: 400,
  processingMode: 'automatic',
  branches: 'merged',
  agent: {
    bootstrap: 'manual',
  },
  groups: [],
  extractCode: true,
  codeSettings: {
    minLength: 50,
    languages: [],
    groupBy: 'language',
    deduplicate: true,
    sourceHandling: 'extract_and_remove',
  },
  duplicateDetection: {
    enabled: true,
    exactMatch: true,
    similarityThreshold: 0.85,
    crossConversation: true,
    algorithm: 'jaccard',
    normalizeTokens: true,
    minTokenOverlap: 5,
    lengthRatioTolerance: 0.2,
    ignoreWhitespace: true,
    ignoreCase: false,
    ignoreTimestamp: true,
    requireReview: true,
    autoApproveExact: false,
    autoMergeThreshold: 0.95,
  },
};

function cloneDefaults(): NormalizedImportOptions {
  return JSON.parse(JSON.stringify(DEFAULT_IMPORT_OPTIONS)) as NormalizedImportOptions;
}

export function normalizeImportOptions(input?: unknown): NormalizedImportOptions {
  if (typeof input === 'undefined' || input === null) {
    return cloneDefaults();
  }

  const parsed = ImportConfigSchema.parse(input);
  const defaults = cloneDefaults();

  return {
    platform: parsed.platform ?? defaults.platform,
    extraction: parsed.extraction ?? defaults.extraction,
    minMessageLength: parsed.minMessageLength ?? defaults.minMessageLength,
    processingMode: parsed.processingMode ?? defaults.processingMode,
    branches: parsed.branches ?? defaults.branches,
    agent: parsed.agent ?? defaults.agent,
    groups: parsed.groups ?? defaults.groups,
    extractCode: parsed.extractCode ?? defaults.extractCode,
    codeSettings: {
      ...(parsed.codeSettings ?? defaults.codeSettings),
      minLength: parsed.codeSettings?.minLength ?? defaults.codeSettings.minLength,
    },
    duplicateDetection: {
      ...(parsed.duplicateDetection ?? defaults.duplicateDetection),
      similarityThreshold:
        parsed.duplicateDetection?.similarityThreshold ??
        defaults.duplicateDetection.similarityThreshold,
    },
  };
}

export interface ImportGraphBirthMetadata {
  massStats: {
    atomicCount: number;
    packetCount: number;
    weightedMassTotal: number;
    weightedMassMean: number;
    weightedMassP95: number;
  };
  clusterCounts: {
    groups: number;
    subgroups: number;
    isolated: number;
  };
  edgeStrengthStats: {
    count: number;
    mean: number;
    p50: number;
    p95: number;
    max: number;
  };
  objectiveBuildTaskId?: string;
}

export interface GraphMaterializationSummary {
  accountId: string;
  uploadHash: string;
  counts: {
    accountNodes: number;
    principals: number;
    sources: number;
    groups: number;
  };
  links: {
    accountPrincipal: number;
    sourcePrincipal: number;
    sourceGroup: number;
  };
  createdInJob: {
    sources: number;
    groups: number;
  };
  passed: boolean;
  missing: string[];
}

export type SimilarityReviewApplyPhase = 'pending' | 'ready' | 'applying' | 'completed' | 'failed';

export type SimilarityReviewApplyReasonCode =
  | 'REVIEW_APPLY_TIMEOUT'
  | 'REVIEW_APPLY_CONFLICT'
  | 'REVIEW_APPLY_FAILED';

export interface SimilarityReviewApplySummary {
  appliedDecisions: number;
  actionCounts: Record<
    'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge' | 'sequester',
    number
  >;
  nodesSequestered: number;
  nodesMerged: number;
  edgesCreated: number;
  pendingCandidates: number;
}

export interface SimilarityReviewApplyState {
  phase: SimilarityReviewApplyPhase;
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
  reasonCode?: SimilarityReviewApplyReasonCode;
  summary?: SimilarityReviewApplySummary;
}

export interface GoldenPathSloResult {
  mode: 'pr' | 'nightly';
  timestamp: string;
  pass: boolean;
  breaches: string[];
  metrics: {
    tinyImportMs?: number;
    smallImportMs?: number;
    mediumImportMs?: number;
    realGptImportMs?: number;
    similarityApplyMs?: number;
    stalledJobsOver180s: number;
    requiredScenarioFailures: number;
    failureBudget7dPercent?: number;
    regressionPercentVsMedian?: number;
  };
}

export interface ObjectiveBuildTaskInput {
  importJobId: string;
  accountId: string;
  sourceBatchId?: string;
  targetId?: string;
  policy: {
    domain_weights: Record<string, number>;
    max_hops: number;
    max_sources: number;
    allow_full_raw_egress?: boolean;
  };
}

export interface ObjectiveBuildResult {
  taskId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  evidenceNodeIds: string[];
  objectiveNodeIds: string[];
  unifiedDocIds: string[];
  error?: string;
}
