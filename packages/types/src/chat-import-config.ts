/**
 * Type definitions for chat import feature
 *
 * Canonical source of truth is import-contract.ts; this file layers
 * UI-specific fields (e.g. matchCount) and review state helpers.
 */

import { normalizeImportOptions, type NormalizedImportOptions } from './import-contract';

export interface ChatImportConfig extends Omit<NormalizedImportOptions, 'platform'> {
  groups: Array<{
    id: string;
    name: string;
    keywords: string[];
    matchCount?: number; // computed after analysis
  }>;
}

const IMPORT_DEFAULTS = normalizeImportOptions();

export const DEFAULT_IMPORT_CONFIG: ChatImportConfig = {
  extraction: {
    includeUser: IMPORT_DEFAULTS.extraction.includeUser,
    includeAssistant: IMPORT_DEFAULTS.extraction.includeAssistant,
  },
  branches: IMPORT_DEFAULTS.branches,
  agent: {
    bootstrap: IMPORT_DEFAULTS.agent.bootstrap,
  },
  minMessageLength: IMPORT_DEFAULTS.minMessageLength,
  processingMode: IMPORT_DEFAULTS.processingMode,
  groups: [],
  duplicateDetection: { ...IMPORT_DEFAULTS.duplicateDetection },
  spine: { ...IMPORT_DEFAULTS.spine },
  extractCode: IMPORT_DEFAULTS.extractCode,
  codeSettings: {
    minLength: IMPORT_DEFAULTS.codeSettings.minLength,
    languages: [...IMPORT_DEFAULTS.codeSettings.languages],
    groupBy: IMPORT_DEFAULTS.codeSettings.groupBy,
    deduplicate: IMPORT_DEFAULTS.codeSettings.deduplicate,
    sourceHandling: IMPORT_DEFAULTS.codeSettings.sourceHandling,
  },
};

export interface PlatformDetection {
  platform: 'chatgpt' | 'claude' | 'gemini' | 'unknown';
  conversationCount: number;
  messageCount: number;
  confidence: number;
}

export interface UploadProgress {
  stage: 'uploading' | 'detecting' | 'parsing' | 'analyzing' | 'ready' | 'error';
  percent: number;
  message: string;
}

export interface AnalysisResult {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  codeBlocks: number;
  averageMessageLength: number;
  filteredMessageCount: number; // based on minLength
}

export interface DuplicateCandidate {
  id: string;
  primary: {
    id: string;
    content: string;
    conversationTitle: string;
    timestamp: number;
    charCount: number;
    metadata: any;
  };
  duplicate: {
    id: string;
    content: string;
    conversationTitle: string;
    timestamp: number;
    charCount: number;
    metadata: any;
  };
  similarity: number;
  metrics: {
    tokenOverlap: number;
    editDistance: number;
    lengthRatio: number;
  };
  decision?: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge' | 'sequester';
}

export interface ReviewDecision {
  duplicateId: string;
  action: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge' | 'sequester';
  timestamp: number;
  userId?: string;
  primaryNodeId?: string;
  duplicateNodeId?: string;
}

// Duplicate Review UI State
export interface DuplicateGroup {
  id: string;
  candidates: DuplicateCandidate[];
  totalDuplicates: number;
  reviewed: number;
  autoResolved: number;
}

export interface DuplicateReviewState {
  groups: DuplicateGroup[];
  selectedGroupId: string | null;
  selectedCandidateId: string | null;
  decisions: Map<string, ReviewDecision>;
  viewMode: 'side-by-side' | 'unified';
}

// Import result from API
export interface ImportResult {
  conversations: Array<{
    id: string;
    title: string;
    platform: string;
    message_count: number;
  }>;
  sources: any[];
  code_assets: any[];
  duplicate_groups?: DuplicateGroup[];
  stats: {
    total_conversations: number;
    total_messages: number;
    total_sources: number;
    total_code_blocks: number;
    user_messages: number;
    assistant_messages: number;
    duplicate_candidates?: number;
  };
}
