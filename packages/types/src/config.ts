import { z } from 'zod';
import {
  normalizeImportOptions,
  ImportConfigSchema,
  type NormalizedImportOptions,
} from './import-contract';

/**
 * Storage mode configuration
 */
export const StorageModeSchema = z.literal('local');
export type StorageMode = z.infer<typeof StorageModeSchema>;

/**
 * Grouping configuration
 */
export const GroupingConfigSchema = z.object({
  mode: z.enum(['auto', 'manual', 'hybrid']),

  // Auto-grouping settings
  auto: z
    .object({
      targetGroupCount: z.number().min(1).max(500).default(25),
      createCatchAll: z.boolean().default(true),
      minGroupSize: z.number().min(1).default(2),
      algorithm: z.enum(['keyword', 'tfidf', 'embedding']).default('tfidf'),
    })
    .optional(),

  // Manual groups
  manual: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        keywords: z.array(z.string()),
        color: z.string().optional(),
        icon: z.string().optional(),
      })
    )
    .default([]),
});

export type GroupingConfig = z.infer<typeof GroupingConfigSchema>;

/**
 * Source configuration
 */
export const SourceConfigSchema = z.object({
  // Scope
  scope: z.enum(['message', 'conversation', 'auto']).default('message'),

  // Role filtering
  roleFilter: z.object({
    user: z.boolean().default(true),
    ai: z.boolean().default(true),
    separate: z.boolean().default(true),
  }),

  // Length filters
  minLengthUser: z.number().min(0).default(400),
  minLengthAI: z.number().min(0).default(400),

  // Bundling (cross-chat relationships)
  bundling: z.object({
    enabled: z.boolean().default(false),
    method: z.enum(['keyword', 'embedding', 'none']).default('keyword'),
    similarityThreshold: z.number().min(0).max(1).default(0.75),
  }),
});

export type SourceConfig = z.infer<typeof SourceConfigSchema>;

/**
 * Code extraction configuration
 */
export const CodeConfigSchema = z.object({
  extract: z.boolean().default(true),
  removeFromSource: z.boolean().default(true),
  createEdges: z.boolean().default(true),
  minLength: z.number().min(0).default(50),
  deduplicate: z.boolean().default(true),
});

export type CodeConfig = z.infer<typeof CodeConfigSchema>;

/**
 * Duplicate detection configuration
 */
export const DuplicateConfigSchema = z.object({
  enabled: z.boolean().default(true),
  level: z.enum(['message', 'conversation', 'both']).default('message'),

  // Layer 1: Exact
  detectExact: z.boolean().default(true),

  // Layer 2: Near
  detectNear: z.boolean().default(true),
  nearThreshold: z.number().min(0).max(1).default(0.85),

  // Layer 3: Semantic (Pro feature)
  detectSemantic: z.boolean().default(false),
  semanticThreshold: z.number().min(0).max(1).default(0.9),

  // Action
  createReviewFolders: z.boolean().default(true),
  autoMergeSuggestions: z.boolean().default(false),
});

export type DuplicateConfig = z.infer<typeof DuplicateConfigSchema>;

/**
 * Spine extraction configuration (Vision V2)
 * Controls extraction of Lexeme, Phrase, and Topic nodes from imported content
 */
export const SpineConfigSchema = z.object({
  // Enable/disable spine extraction
  enabled: z.boolean().default(true),

  // Extract individual word tokens as Lexeme nodes
  extractLexemes: z.boolean().default(true),

  // Extract n-grams and named entities as Phrase nodes
  extractPhrases: z.boolean().default(true),

  // Cluster phrases into Topic nodes
  clusterTopics: z.boolean().default(true),

  // Minimum phrase frequency to create a node (filter noise)
  minPhraseFrequency: z.number().min(1).default(1),

  // Minimum number of phrases to form a topic
  minPhrasesPerTopic: z.number().min(1).default(2),
});

export type SpineConfig = z.infer<typeof SpineConfigSchema>;

/**
 * Privacy configuration
 */
export const PrivacyConfigSchema = z.object({
  storageMode: StorageModeSchema.default('local'),
  allowExternalAPIs: z.boolean().default(false),
  apiKey: z.string().nullable().default(null),
});

export type PrivacyConfig = z.infer<typeof PrivacyConfigSchema>;

/**
 * Complete import configuration
 */
export const ImportConfigurationSchema = z.object({
  grouping: GroupingConfigSchema,
  sources: SourceConfigSchema,
  code: CodeConfigSchema,
  duplicates: DuplicateConfigSchema,
  privacy: PrivacyConfigSchema,
  spine: SpineConfigSchema.optional(), // V2: Spine extraction (optional for backwards compat)
});

export type ImportConfiguration = z.infer<typeof ImportConfigurationSchema>;

export const StoredImportDefaultsSchema = z.union([ImportConfigSchema, ImportConfigurationSchema]);

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

function toNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isLegacyImportDefaults(value: unknown): boolean {
  const record = toRecord(value);
  return (
    'grouping' in record ||
    'sources' in record ||
    'code' in record ||
    'duplicates' in record ||
    'privacy' in record
  );
}

export function normalizeStoredImportDefaults(input?: unknown): NormalizedImportOptions {
  if (typeof input === 'undefined' || input === null) {
    return normalizeImportOptions();
  }

  if (!isLegacyImportDefaults(input)) {
    return normalizeImportOptions(input);
  }

  const legacy = toRecord(input);
  const grouping = toRecord(legacy.grouping);
  const sources = toRecord(legacy.sources);
  const roleFilter = toRecord(sources.roleFilter);
  const code = toRecord(legacy.code);
  const duplicates = toRecord(legacy.duplicates);
  const legacyManual = Array.isArray(grouping.manual) ? grouping.manual : [];

  const modeRaw = String(grouping.mode || 'auto').toLowerCase();
  const processingMode: 'automatic' | 'manual' | 'hybrid' =
    modeRaw === 'manual' ? 'manual' : modeRaw === 'hybrid' ? 'hybrid' : 'automatic';

  const includeUser = toBoolean(roleFilter.user, true);
  const includeAssistant = toBoolean(roleFilter.ai, false);
  const branches = toBoolean(roleFilter.separate, true) ? 'separate' : 'merged';

  const minLengthUser = toNumber(sources.minLengthUser, 400);
  const minLengthAssistant = toNumber(sources.minLengthAI, 400);
  const minMessageLength = Math.max(0, Math.min(minLengthUser, minLengthAssistant));

  const normalizedInput = {
    extraction: {
      includeUser,
      includeAssistant,
    },
    processingMode,
    branches,
    minMessageLength,
    groups:
      processingMode === 'manual' || processingMode === 'hybrid'
        ? legacyManual
            .map((entry, index) => {
              const record = toRecord(entry);
              const name = String(record.name || '').trim();
              const keywords = Array.isArray(record.keywords)
                ? record.keywords.map((keyword) => String(keyword))
                : [];
              if (!name) {
                return null;
              }
              return {
                id: String(record.id || `legacy_group_${index + 1}`),
                name,
                keywords,
              };
            })
            .filter((group): group is { id: string; name: string; keywords: string[] } => !!group)
        : [],
    extractCode: toBoolean(code.extract, true),
    codeSettings: {
      minLength: toNumber(code.minLength, 50),
      languages: [],
      groupBy: 'language' as const,
      deduplicate: toBoolean(code.deduplicate, true),
      sourceHandling: toBoolean(code.removeFromSource, true)
        ? ('extract_and_remove' as const)
        : ('keep_inline' as const),
    },
    duplicateDetection: {
      enabled: toBoolean(duplicates.enabled, true),
      exactMatch: toBoolean(duplicates.detectExact, true),
      similarityThreshold: toNumber(duplicates.nearThreshold, 0.85),
      crossConversation: String(duplicates.level || 'message') !== 'conversation',
      algorithm: toBoolean(duplicates.detectSemantic, false)
        ? ('embedding' as const)
        : ('jaccard' as const),
      normalizeTokens: true,
      minTokenOverlap: 5,
      lengthRatioTolerance: 0.2,
      ignoreWhitespace: true,
      ignoreCase: false,
      ignoreTimestamp: true,
      requireReview: toBoolean(duplicates.createReviewFolders, true),
      autoApproveExact: false,
      autoMergeThreshold: 0.95,
    },
  };

  return normalizeImportOptions(normalizedInput);
}

/**
 * Application configuration (stored in ~/.keimenon/config.json)
 */
export const AppConfigSchema = z.object({
  version: z.string().default('1.0'),
  storageMode: StorageModeSchema.default('local'),

  database: z.object({
    local: z.object({
      path: z.string(),
      autoBackup: z.boolean().default(true),
      verbose: z.boolean().default(false),
    }),
  }),

  documentStore: z.object({
    path: z.string(),
    enableDeduplication: z.boolean().default(true),
  }),

  // Default import settings
  defaults: StoredImportDefaultsSchema.optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Default configurations
 */
export const DEFAULT_GROUPING_CONFIG: GroupingConfig = {
  mode: 'auto',
  auto: {
    targetGroupCount: 25,
    createCatchAll: true,
    minGroupSize: 2,
    algorithm: 'tfidf',
  },
  manual: [],
};

export const DEFAULT_SOURCE_CONFIG: SourceConfig = {
  scope: 'message',
  roleFilter: {
    user: true,
    ai: true,
    separate: true,
  },
  minLengthUser: 400,
  minLengthAI: 400,
  bundling: {
    enabled: false,
    method: 'keyword',
    similarityThreshold: 0.75,
  },
};

export const DEFAULT_CODE_CONFIG: CodeConfig = {
  extract: true,
  removeFromSource: true,
  createEdges: true,
  minLength: 50,
  deduplicate: true,
};

export const DEFAULT_DUPLICATE_CONFIG: DuplicateConfig = {
  enabled: true,
  level: 'message',
  detectExact: true,
  detectNear: true,
  nearThreshold: 0.85,
  detectSemantic: false,
  semanticThreshold: 0.9,
  createReviewFolders: true,
  autoMergeSuggestions: false,
};

export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  storageMode: 'local',
  allowExternalAPIs: false,
  apiKey: null,
};

export const DEFAULT_IMPORT_CONFIGURATION: NormalizedImportOptions = normalizeImportOptions();
