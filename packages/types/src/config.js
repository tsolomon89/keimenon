"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_IMPORT_CONFIGURATION = exports.DEFAULT_PRIVACY_CONFIG = exports.DEFAULT_DUPLICATE_CONFIG = exports.DEFAULT_CODE_CONFIG = exports.DEFAULT_SOURCE_CONFIG = exports.DEFAULT_GROUPING_CONFIG = exports.AppConfigSchema = exports.ImportConfigurationSchema = exports.PrivacyConfigSchema = exports.DuplicateConfigSchema = exports.CodeConfigSchema = exports.SourceConfigSchema = exports.GroupingConfigSchema = exports.StorageModeSchema = void 0;
const zod_1 = require("zod");
/**
 * Storage mode configuration
 */
exports.StorageModeSchema = zod_1.z.enum(['local', 'canvas', 'hybrid']);
/**
 * Grouping configuration
 */
exports.GroupingConfigSchema = zod_1.z.object({
    mode: zod_1.z.enum(['auto', 'manual', 'hybrid']),
    // Auto-grouping settings
    auto: zod_1.z.object({
        targetGroupCount: zod_1.z.number().min(1).max(500).default(25),
        createCatchAll: zod_1.z.boolean().default(true),
        minGroupSize: zod_1.z.number().min(1).default(2),
        algorithm: zod_1.z.enum(['keyword', 'tfidf', 'embedding']).default('tfidf'),
    }).optional(),
    // Manual groups
    manual: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().min(1).max(100),
        keywords: zod_1.z.array(zod_1.z.string()),
        color: zod_1.z.string().optional(),
        icon: zod_1.z.string().optional(),
    })).default([]),
});
/**
 * Source configuration
 */
exports.SourceConfigSchema = zod_1.z.object({
    // Scope
    scope: zod_1.z.enum(['message', 'conversation', 'auto']).default('message'),
    // Role filtering
    roleFilter: zod_1.z.object({
        user: zod_1.z.boolean().default(true),
        ai: zod_1.z.boolean().default(true),
        separate: zod_1.z.boolean().default(true),
    }),
    // Length filters
    minLengthUser: zod_1.z.number().min(0).default(400),
    minLengthAI: zod_1.z.number().min(0).default(400),
    // Bundling (cross-chat relationships)
    bundling: zod_1.z.object({
        enabled: zod_1.z.boolean().default(false),
        method: zod_1.z.enum(['keyword', 'embedding', 'none']).default('keyword'),
        similarityThreshold: zod_1.z.number().min(0).max(1).default(0.75),
    }),
});
/**
 * Code extraction configuration
 */
exports.CodeConfigSchema = zod_1.z.object({
    extract: zod_1.z.boolean().default(true),
    removeFromSource: zod_1.z.boolean().default(true),
    createEdges: zod_1.z.boolean().default(true),
    minLength: zod_1.z.number().min(0).default(50),
    deduplicate: zod_1.z.boolean().default(true),
});
/**
 * Duplicate detection configuration
 */
exports.DuplicateConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(true),
    level: zod_1.z.enum(['message', 'conversation', 'both']).default('message'),
    // Layer 1: Exact
    detectExact: zod_1.z.boolean().default(true),
    // Layer 2: Near
    detectNear: zod_1.z.boolean().default(true),
    nearThreshold: zod_1.z.number().min(0).max(1).default(0.85),
    // Layer 3: Semantic (Pro feature)
    detectSemantic: zod_1.z.boolean().default(false),
    semanticThreshold: zod_1.z.number().min(0).max(1).default(0.90),
    // Action
    createReviewFolders: zod_1.z.boolean().default(true),
    autoMergeSuggestions: zod_1.z.boolean().default(false),
});
/**
 * Privacy configuration
 */
exports.PrivacyConfigSchema = zod_1.z.object({
    storageMode: exports.StorageModeSchema.default('local'),
    allowExternalAPIs: zod_1.z.boolean().default(false),
    apiKey: zod_1.z.string().nullable().default(null),
});
/**
 * Complete import configuration
 */
exports.ImportConfigurationSchema = zod_1.z.object({
    grouping: exports.GroupingConfigSchema,
    sources: exports.SourceConfigSchema,
    code: exports.CodeConfigSchema,
    duplicates: exports.DuplicateConfigSchema,
    privacy: exports.PrivacyConfigSchema,
});
/**
 * Application configuration (stored in ~/.canvas-memory/config.json)
 */
exports.AppConfigSchema = zod_1.z.object({
    version: zod_1.z.string().default('1.0'),
    storageMode: exports.StorageModeSchema.default('local'),
    database: zod_1.z.object({
        local: zod_1.z.object({
            path: zod_1.z.string(),
            autoBackup: zod_1.z.boolean().default(true),
            verbose: zod_1.z.boolean().default(false),
        }),
        cloud: zod_1.z.object({
            enabled: zod_1.z.boolean().default(false),
            neo4jUri: zod_1.z.string().nullable().default(null),
            neo4jUser: zod_1.z.string().nullable().default(null),
            neo4jPassword: zod_1.z.string().nullable().default(null),
        }),
    }),
    documentStore: zod_1.z.object({
        path: zod_1.z.string(),
        enableDeduplication: zod_1.z.boolean().default(true),
    }),
    // Default import settings
    defaults: exports.ImportConfigurationSchema.optional(),
});
/**
 * Default configurations
 */
exports.DEFAULT_GROUPING_CONFIG = {
    mode: 'auto',
    auto: {
        targetGroupCount: 25,
        createCatchAll: true,
        minGroupSize: 2,
        algorithm: 'tfidf',
    },
    manual: [],
};
exports.DEFAULT_SOURCE_CONFIG = {
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
exports.DEFAULT_CODE_CONFIG = {
    extract: true,
    removeFromSource: true,
    createEdges: true,
    minLength: 50,
    deduplicate: true,
};
exports.DEFAULT_DUPLICATE_CONFIG = {
    enabled: true,
    level: 'message',
    detectExact: true,
    detectNear: true,
    nearThreshold: 0.85,
    detectSemantic: false,
    semanticThreshold: 0.90,
    createReviewFolders: true,
    autoMergeSuggestions: false,
};
exports.DEFAULT_PRIVACY_CONFIG = {
    storageMode: 'local',
    allowExternalAPIs: false,
    apiKey: null,
};
exports.DEFAULT_IMPORT_CONFIGURATION = {
    grouping: exports.DEFAULT_GROUPING_CONFIG,
    sources: exports.DEFAULT_SOURCE_CONFIG,
    code: exports.DEFAULT_CODE_CONFIG,
    duplicates: exports.DEFAULT_DUPLICATE_CONFIG,
    privacy: exports.DEFAULT_PRIVACY_CONFIG,
};
//# sourceMappingURL=config.js.map