import { z } from 'zod';

/**
 * Storage mode configuration
 */
export const StorageModeSchema = z.enum(['local', 'keimenon', 'hybrid']);
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
});

export type ImportConfiguration = z.infer<typeof ImportConfigurationSchema>;

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
    cloud: z.object({
      enabled: z.boolean().default(false),
      neo4jUri: z.string().nullable().default(null),
      neo4jUser: z.string().nullable().default(null),
      neo4jPassword: z.string().nullable().default(null),
    }),
  }),

  documentStore: z.object({
    path: z.string(),
    enableDeduplication: z.boolean().default(true),
  }),

  // Default import settings
  defaults: ImportConfigurationSchema.optional(),
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

export const DEFAULT_IMPORT_CONFIGURATION: ImportConfiguration = {
  grouping: DEFAULT_GROUPING_CONFIG,
  sources: DEFAULT_SOURCE_CONFIG,
  code: DEFAULT_CODE_CONFIG,
  duplicates: DEFAULT_DUPLICATE_CONFIG,
  privacy: DEFAULT_PRIVACY_CONFIG,
};
