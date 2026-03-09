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
      })
      .default({
        minLength: 50,
        languages: [],
        groupBy: 'language',
        deduplicate: true,
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

    // Legacy aliases kept for migration (normalized into canonical fields)
    autoGroup: z.boolean().optional(),
    targetGroupCount: z.number().optional(),
    codeMinChars: z.number().optional(),
    duplicateThreshold: z.number().optional(),
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
  groups: Array<{ id: string; name: string; keywords: string[] }>;
  extractCode: boolean;
  codeSettings: {
    minLength: number;
    languages: string[];
    groupBy: 'language' | 'conversation' | 'keyword';
    deduplicate: boolean;
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
  autoGroup?: boolean;
  targetGroupCount?: number;
  codeMinChars?: number;
  duplicateThreshold?: number;
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
  groups: [],
  extractCode: true,
  codeSettings: {
    minLength: 50,
    languages: [],
    groupBy: 'language',
    deduplicate: true,
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

  const similarityThreshold =
    parsed.duplicateDetection?.similarityThreshold ?? parsed.duplicateThreshold;

  const minLength = parsed.codeSettings?.minLength ?? parsed.codeMinChars;

  return {
    platform: parsed.platform ?? defaults.platform,
    extraction: parsed.extraction ?? defaults.extraction,
    minMessageLength: parsed.minMessageLength ?? defaults.minMessageLength,
    processingMode: parsed.processingMode ?? defaults.processingMode,
    branches: parsed.branches ?? defaults.branches,
    groups: parsed.groups ?? defaults.groups,
    extractCode: parsed.extractCode ?? defaults.extractCode,
    codeSettings: {
      ...(parsed.codeSettings ?? defaults.codeSettings),
      minLength: minLength ?? defaults.codeSettings.minLength,
    },
    duplicateDetection: {
      ...(parsed.duplicateDetection ?? defaults.duplicateDetection),
      similarityThreshold: similarityThreshold ?? defaults.duplicateDetection.similarityThreshold,
    },
    autoGroup: parsed.autoGroup,
    targetGroupCount: parsed.targetGroupCount,
    codeMinChars: parsed.codeMinChars,
    duplicateThreshold: parsed.duplicateThreshold,
  };
}
