// Enhanced import configuration types

export interface SourcesConfig {
  enabled?: boolean;
  roleSubset?: 'both' | 'user' | 'assistant';
  minCharsUser?: number;
  minCharsAssistant?: number;
  stitchStrategy?: 'by_chat' | 'by_title' | 'by_topic';
  preserveChatIntegrity?: boolean;
  sourcesCap?: number;
  includeAssistantContext?: boolean;
}

export interface CodeConfig {
  enabled?: boolean;
  minLength?: number;
  deduplicate?: boolean;
  extractInline?: boolean;
  languages?: string[];
}

export interface DuplicatesConfig {
  enabled?: boolean;
  algorithm?: 'jaccard' | 'levenshtein' | 'cosine';
  threshold?: number;
  normalizeTokens?: boolean;
  ignoreCase?: boolean;
  ignoreWhitespace?: boolean;
  minTokenOverlap?: number;
  lengthRatioTolerance?: number;
  crossConversation?: boolean;
}

export interface EnhancedImportConfig {
  sources?: SourcesConfig;
  code?: CodeConfig;
  duplicates?: DuplicatesConfig;
}

export const DEFAULT_ENHANCED_CONFIG: EnhancedImportConfig = {
  sources: {
    enabled: true,
    roleSubset: 'both',
    minCharsUser: 400,
    minCharsAssistant: 400,
    stitchStrategy: 'by_chat',
    preserveChatIntegrity: true,
    sourcesCap: 150,
    includeAssistantContext: false,
  },
  code: {
    enabled: true,
    minLength: 10,
    deduplicate: true,
    extractInline: false,
    languages: [],
  },
  duplicates: {
    enabled: true,
    algorithm: 'jaccard',
    threshold: 0.8,
    normalizeTokens: true,
    ignoreCase: true,
    ignoreWhitespace: true,
    minTokenOverlap: 5,
    lengthRatioTolerance: 0.2,
    crossConversation: false,
  },
};
