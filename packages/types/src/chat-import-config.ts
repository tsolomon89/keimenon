/**
 * Type definitions for chat import feature
 */

export interface ChatImportConfig {
  // Extraction
  extraction: {
    includeUser: boolean;
    includeAssistant: boolean;
  };

  // Branches
  branches: 'merged' | 'separate';

  // Filtering
  minMessageLength: number;

  // Processing
  processingMode: 'automatic' | 'manual';

  // Manual groups (only if processingMode='manual')
  groups: Array<{
    id: string;
    name: string;
    keywords: string[];
    matchCount?: number; // computed after analysis
  }>;

  // Duplicate detection
  duplicateDetection: {
    enabled: boolean;
    exactMatch: boolean;
    similarityThreshold: number;
    crossConversation: boolean;

    // Advanced
    algorithm: 'jaccard' | 'levenshtein' | 'cosine' | 'embedding';
    normalizeTokens: boolean;
    minTokenOverlap: number;
    lengthRatioTolerance: number;

    // Ignore options
    ignoreWhitespace: boolean;
    ignoreCase: boolean;
    ignoreTimestamp: boolean;

    // Review
    requireReview: boolean;
    autoApproveExact: boolean;
    autoMergeThreshold: number;
  };

  // Code extraction
  extractCode: boolean;
  codeSettings: {
    minLength: number;
    languages: string[];
    groupBy: 'language' | 'conversation' | 'keyword';
    deduplicate: boolean;
  };
}

export const DEFAULT_IMPORT_CONFIG: ChatImportConfig = {
  extraction: {
    includeUser: true,
    includeAssistant: false,
  },
  branches: 'merged',
  minMessageLength: 400,
  processingMode: 'manual',
  groups: [],
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
  extractCode: true,
  codeSettings: {
    minLength: 50,
    languages: [],
    groupBy: 'language',
    deduplicate: true,
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
  decision?: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge';
}

export interface ReviewDecision {
  duplicateId: string;
  action: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge';
  timestamp: number;
  userId?: string;
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
