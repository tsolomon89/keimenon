import { ChatImportConfig, DuplicateGroup } from '@/types/chat-import';
import { handleApiError, withRetry, FileError } from './error-handler';
import { getToken } from '@/contexts/AuthContext';
import { API_BASE_URL } from './env.config';

/**
 * Get authorization headers with token and operating context
 * Note: Operating context is obtained from global state
 */
function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {};

  // Add auth token
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Add operating context headers if available
  // These are set by the OperatingContext when switching accounts
  // Type-safe access via global.d.ts Window interface extension
  if (typeof window !== 'undefined') {
    const operatingAccount = window.__operatingAccount;
    const operatingMode = window.__operatingMode;

    if (operatingAccount && operatingMode && operatingMode !== 'native') {
      headers['X-Operating-Account'] = operatingAccount;
      headers['X-Operating-Mode'] = operatingMode;
    }
  }

  return headers;
}

export interface ImportResponse {
  success: boolean;
  result?: {
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
  };
  error?: string;
  message?: string;
}

export interface BatchImportResponse {
  success: boolean;
  results?: Array<{
    file: string;
    success: boolean;
    result?: ImportResponse['result'];
    error?: string;
  }>;
  summary?: {
    total_files: number;
    successful: number;
    failed: number;
  };
  error?: string;
  message?: string;
}

/**
 * Convert frontend ChatImportConfig to backend ImportConfig format
 */
// TODO: Add input validation for ChatImportConfig before conversion
// Related: apps/web/src/types/chat-import.ts (ChatImportConfig type definition)
// See: docs/features/INPUT_VALIDATION.md (needs creation)
// Validate: threshold ranges (0-1), minLength >= 0, proper enum values
function convertConfig(config: ChatImportConfig): any {
  return {
    // Role & length filters
    sources_role_subset:
      config.extraction.includeUser && config.extraction.includeAssistant
        ? 'both'
        : config.extraction.includeUser
          ? 'user'
          : 'assistant',
    sources_min_chars_user: config.minMessageLength,
    sources_min_chars_assistant: config.minMessageLength,

    // Grouping strategy
    sources_stitch_strategy: config.processingMode === 'manual' ? 'by_chat' : 'by_title',
    sources_preserve_chat_integrity: config.branches === 'merged',
    sources_cap: 150,

    // Duplication policy
    sources_attach_mode: 'non-unique',
    similarity_threshold: config.duplicateDetection.similarityThreshold,

    // Code extraction
    export_code: config.extractCode,
    code_global_dedupe: config.codeSettings.deduplicate,
    code_min_chars: config.codeSettings.minLength,

    // Output format
    sources_export_format: 'md',
    include_assistant_context: config.extraction.includeAssistant,

    // Duplicate detection
    duplicate_detection_enabled: config.duplicateDetection.enabled,
    duplicate_exact_match: config.duplicateDetection.exactMatch,
    duplicate_similarity_threshold: config.duplicateDetection.similarityThreshold,
    duplicate_cross_conversation: config.duplicateDetection.crossConversation,
    duplicate_algorithm: config.duplicateDetection.algorithm,
    duplicate_normalize_tokens: config.duplicateDetection.normalizeTokens,
    duplicate_min_token_overlap: config.duplicateDetection.minTokenOverlap,
    duplicate_length_ratio_tolerance: config.duplicateDetection.lengthRatioTolerance,
    duplicate_ignore_whitespace: config.duplicateDetection.ignoreWhitespace,
    duplicate_ignore_case: config.duplicateDetection.ignoreCase,
    duplicate_ignore_timestamp: config.duplicateDetection.ignoreTimestamp,
    duplicate_require_review: config.duplicateDetection.requireReview,
    duplicate_auto_approve_exact: config.duplicateDetection.autoApproveExact,
    duplicate_auto_merge_threshold: config.duplicateDetection.autoMergeThreshold,
  };
}

/**
 * Cancel a running or queued job
 *
 * Sends a cancellation request to the backend, which updates the job status
 * and signals the worker to stop processing at the next checkpoint.
 *
 * Related:
 * - apps/api/src/modules/jobs/infrastructure/import-jobs.routes.ts:531 (cancel endpoint)
 * - apps/api/src/modules/workers/domain/WorkerPool.ts:360 (worker cancellation)
 */
export async function cancelJob(jobId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to cancel job: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Retry a failed or canceled job
 *
 * Creates a new job with the same configuration as the original job.
 * The new job will start from scratch (checkpoint resumption not yet implemented).
 *
 * Related:
 * - apps/api/src/modules/jobs/infrastructure/import-jobs.routes.ts:461 (retry endpoint)
 * - apps/api/src/modules/jobs/application/RetryJob.ts (retry use case)
 */
export async function retryJob(jobId: string): Promise<{
  success: boolean;
  jobId?: string;
  originalJobId?: string;
  message?: string;
  error?: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}/retry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to retry job: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Pause a running job
 *
 * Pauses the job at the next checkpoint. Job status becomes 'blocked'.
 * Resume the job to restart from scratch (checkpoint persistence not yet implemented).
 *
 * Related:
 * - apps/api/src/modules/jobs/infrastructure/import-jobs.routes.ts:606 (pause endpoint)
 * - apps/api/src/modules/workers/domain/WorkerPool.ts (worker signaling)
 */
export async function pauseJob(jobId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}/pause`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to pause job: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Resume a paused job
 *
 * Resumes a job from 'blocked' (paused) status back to 'queued'.
 * WorkerPool will pick it up and restart from the beginning.
 *
 * Related:
 * - apps/api/src/modules/jobs/infrastructure/import-jobs.routes.ts:676 (resume endpoint)
 * - apps/api/src/modules/jobs/application/RetryJob.ts (uses retry transition)
 */
export async function resumeJob(jobId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}/resume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to resume job: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Import chat files as a background job (unified jobs system)
 * Returns job ID immediately for SSE progress tracking
 *
 * Related: apps/api/src/modules/jobs/infrastructure/import-jobs.routes.ts:76 (POST /api/v1/jobs/import)
 * Related: apps/web/src/hooks/useJobStream.ts (SSE progress updates)
 * Related: apps/web/src/components/canvas/ImportsTableCard.tsx (job history display)
 */
export async function importChatFilesAsJob(
  files: File[],
  config: ChatImportConfig,
  detectedPlatform?: 'chatgpt' | 'claude' | 'gemini' | 'generic'
): Promise<{
  success: boolean;
  jobId: string;
  uploadIds: string[];
  message: string;
  job: any;
}> {
  const formData = new FormData();

  // Add all files
  files.forEach((file) => {
    formData.append('files', file);
  });

  // Enhanced config for job-based import - send complete configuration
  const jobConfig = {
    // Platform detection (enables platform-specific parsers)
    platform: detectedPlatform,

    // Extraction settings - which roles to include
    extraction: {
      includeUser: config.extraction.includeUser,
      includeAssistant: config.extraction.includeAssistant,
    },

    // Filtering - minimum message length
    minMessageLength: config.minMessageLength,

    // Processing mode (automatic vs manual grouping)
    processingMode: config.processingMode,

    // Branches (conversation branch handling)
    branches: config.branches,

    // Manual groups (used when processingMode is 'manual')
    groups: config.processingMode === 'manual' ? config.groups : [],

    // Code extraction - complete settings
    extractCode: config.extractCode,
    codeSettings: {
      minLength: config.codeSettings.minLength,
      languages: config.codeSettings.languages,
      groupBy: config.codeSettings.groupBy,
      deduplicate: config.codeSettings.deduplicate,
    },

    // Duplicate detection - complete configuration
    duplicateDetection: {
      enabled: config.duplicateDetection.enabled,
      exactMatch: config.duplicateDetection.exactMatch,
      similarityThreshold: config.duplicateDetection.similarityThreshold,
      crossConversation: config.duplicateDetection.crossConversation,
      algorithm: config.duplicateDetection.algorithm,
      normalizeTokens: config.duplicateDetection.normalizeTokens,
      minTokenOverlap: config.duplicateDetection.minTokenOverlap,
      lengthRatioTolerance: config.duplicateDetection.lengthRatioTolerance,
      ignoreWhitespace: config.duplicateDetection.ignoreWhitespace,
      ignoreCase: config.duplicateDetection.ignoreCase,
      ignoreTimestamp: config.duplicateDetection.ignoreTimestamp,
      requireReview: config.duplicateDetection.requireReview,
      autoApproveExact: config.duplicateDetection.autoApproveExact,
      autoMergeThreshold: config.duplicateDetection.autoMergeThreshold,
    },

    // Legacy field support (for backward compatibility with old backend versions)
    autoGroup: config.processingMode === 'automatic',
    targetGroupCount: 25,
    codeMinChars: config.codeSettings.minLength,
    duplicateThreshold: config.duplicateDetection.similarityThreshold,
  };

  formData.append('config', JSON.stringify(jobConfig));

  // Validate files before uploading
  const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

  for (const file of files) {
    if (!file.name.match(/\.(json|jsonl)$/i)) {
      throw new FileError(
        `Invalid file type: ${file.name}. Only JSON and JSONL files are supported.`
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new FileError(`File too large: ${file.name}. Maximum size is 2GB.`, {
        fileName: file.name,
        size: file.size,
        maxSize: MAX_FILE_SIZE,
      });
    }
  }

  const endpoint = `${API_BASE_URL}/api/v1/jobs/import`;

  console.log(
    `Creating import job for files:`,
    files.map((f) => f.name)
  );

  try {
    return await withRetry(
      async () => {
        console.log(`[importChatFilesAsJob] Sending POST to ${endpoint}`);
        console.log(`[importChatFilesAsJob] FormData contains:`, {
          fileCount: files.length,
          files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
          configSize: formData.get('config')?.toString().length || 0,
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => {
          controller.abort();
          console.error('[importChatFilesAsJob] Request timed out after 5 minutes');
        }, 300000); // 5 minute timeout (matches backend UPLOAD_TIMEOUT_MS)

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData,
            signal: controller.signal,
          });

          clearTimeout(timeout);

          console.log(`[importChatFilesAsJob] Response status: ${response.status}`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[importChatFilesAsJob] Error response:`, {
              status: response.status,
              statusText: response.statusText,
              body: errorText,
            });
            await handleApiError({ response });
          }

          const result = await response.json();
          console.log(`[importChatFilesAsJob] Success:`, result);
          return result;
        } catch (error) {
          clearTimeout(timeout);
          if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(
              'Import job creation timed out after 5 minutes. The file may be too large or the server is not responding.'
            );
          }
          throw error;
        }
      },
      {
        maxAttempts: 2,
        delay: 1000,
        onRetry: (attempt, error) => {
          console.warn(`Import job creation attempt ${attempt} failed, retrying...`, error);
        },
      }
    );
  } catch (error: any) {
    console.error('[importChatFilesAsJob] Final error:', error);
    throw await handleApiError(error);
  }
}

/**
 * Import chat conversations from files (legacy synchronous endpoint)
 * Automatically uses streaming endpoint for files > 10MB
 *
 * @deprecated Use importChatFilesAsJob() instead for better UX with background job processing
 */
export async function importChatFiles(
  files: File[],
  config: ChatImportConfig
): Promise<BatchImportResponse> {
  // TODO: Add validation for empty files array
  // Related: apps/web/src/components/canvas/ChatImportModal.tsx (file upload UI)
  // See: docs/features/INPUT_VALIDATION.md (needs creation)
  // Validate: files.length > 0, each file has valid size/type
  const formData = new FormData();

  // Add all files
  files.forEach((file) => {
    formData.append('files', file);
  });

  // Add configuration
  const backendConfig = convertConfig(config);
  formData.append('config', JSON.stringify(backendConfig));

  // Validate files before uploading
  const STANDARD_MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const STREAMING_MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
  let useStreaming = false;

  for (const file of files) {
    if (!file.name.match(/\.(json|jsonl)$/i)) {
      throw new FileError(
        `Invalid file type: ${file.name}. Only JSON and JSONL files are supported.`
      );
    }

    // Check if we need streaming upload
    if (file.size > STANDARD_MAX_SIZE) {
      useStreaming = true;

      // Validate against streaming max size
      if (file.size > STREAMING_MAX_SIZE) {
        throw new FileError(`File too large: ${file.name}. Maximum size is 2GB.`, {
          fileName: file.name,
          size: file.size,
          maxSize: STREAMING_MAX_SIZE,
        });
      }
    }
  }

  // Choose endpoint based on file size
  const endpoint = useStreaming
    ? `${API_BASE_URL}/api/v1/import/enhanced`
    : `${API_BASE_URL}/api/v1/import/chat/batch`;

  console.log(
    `Using ${useStreaming ? 'streaming' : 'standard'} import for files:`,
    files.map((f) => f.name)
  );

  try {
    return await withRetry(
      async () => {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });

        if (!response.ok) {
          await handleApiError({ response });
        }

        return await response.json();
      },
      {
        maxAttempts: 2,
        delay: 1000,
        onRetry: (attempt, error) => {
          console.warn(`Import attempt ${attempt} failed, retrying...`, error);
        },
      }
    );
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Detect platform from file content without importing
 */
export async function detectPlatform(file: File): Promise<{
  platform: string;
  confidence: number;
}> {
  try {
    // For large files (> 10MB), only read first 100KB to detect format
    const SAMPLE_SIZE = 100 * 1024; // 100KB
    let text: string;

    if (file.size > 10 * 1024 * 1024) {
      const blob = file.slice(0, SAMPLE_SIZE);
      text = await blob.text();
    } else {
      text = await file.text();
    }

    const data = JSON.parse(text);

    // Check for ChatGPT format
    if (Array.isArray(data) && data[0]?.mapping) {
      return { platform: 'chatgpt', confidence: 0.9 };
    }

    // Check for Claude format
    if (data.uuid && data.chat_messages) {
      return { platform: 'claude', confidence: 0.9 };
    }

    // Check for Gemini format
    if (data.conversations && Array.isArray(data.conversations)) {
      return { platform: 'gemini', confidence: 0.8 };
    }

    // Check for generic conversation array format
    if (Array.isArray(data) && data[0]?.messages) {
      return { platform: 'generic', confidence: 0.5 };
    }

    return { platform: 'unknown', confidence: 0.0 };
  } catch (error) {
    console.error('Platform detection error:', error);
    // TODO: Add user-facing error notification for platform detection failures
    // Related: apps/web/src/components/common/Toast.tsx (create toast system)
    // See: docs/features/ERROR_HANDLING.md (needs creation)
    return { platform: 'unknown', confidence: 0.0 };
  }
}

/**
 * Analyze files and return statistics
 */
export async function analyzeFiles(files: File[]): Promise<{
  total_conversations: number;
  total_messages: number;
  platforms: Record<string, number>;
}> {
  // For large files, skip detailed analysis and provide estimates
  const platforms: Record<string, number> = {};
  let totalConversations = 0;
  let totalMessages = 0;

  const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB

  for (const file of files) {
    try {
      // Quick platform detection without full parsing
      const detection = await detectPlatform(file);
      platforms[detection.platform] = (platforms[detection.platform] || 0) + 1;

      // For large files, provide rough estimates to avoid browser freeze
      if (file.size > LARGE_FILE_THRESHOLD) {
        console.log(
          `Large file detected (${(file.size / 1024 / 1024).toFixed(2)}MB), using estimates`
        );
        // Rough estimate: 1 conversation per 250KB, 10 messages per conversation
        const estimatedConvs = Math.floor(file.size / (250 * 1024));
        totalConversations += estimatedConvs;
        totalMessages += estimatedConvs * 10;
        continue;
      }

      // For smaller files, do actual analysis
      const text = await file.text();
      const data = JSON.parse(text);

      // Rough message count estimation
      if (Array.isArray(data)) {
        totalConversations += data.length;
        data.forEach((conv: any) => {
          if (conv.mapping) {
            totalMessages += Object.keys(conv.mapping).length;
          } else if (conv.messages) {
            totalMessages += conv.messages.length;
          }
        });
      } else if (data.conversations) {
        totalConversations += data.conversations.length;
        totalMessages += data.conversations.reduce(
          (sum: number, conv: any) => sum + (conv.messages?.length || 0),
          0
        );
      }
    } catch (error) {
      console.error('Error analyzing file:', file.name, error);
      // TODO: Add user-facing error notification for file analysis failures
      // Related: apps/web/src/components/common/Toast.tsx (create toast system)
      // See: docs/features/ERROR_HANDLING.md (needs creation)
      // If analysis fails, provide minimal estimate
      totalConversations += 1;
      totalMessages += 10;
    }
  }

  return {
    total_conversations: Math.max(totalConversations, 1), // Ensure at least 1
    total_messages: Math.max(totalMessages, 10), // Ensure at least 10
    platforms,
  };
}

// ==================== Content API ====================

export interface MessageContent {
  id: string;
  content: string;
  source: 'local' | 'neo4j';
  role: string;
  timestamp: number;
  char_count?: number;
}

export interface SourceContent {
  id: string;
  title: string;
  content: string;
  source: 'local' | 'neo4j';
  mime_type: string;
  size_bytes: number;
}

export interface CodeContent {
  id: string;
  code: string;
  language: string;
  source: 'local' | 'neo4j';
  line_count?: number;
  char_count?: number;
}

export interface ConversationContent {
  id: string;
  source: 'local' | 'neo4j';
  conversation: {
    id: string;
    title: string;
    messages: Array<{
      role: string;
      content: string;
      timestamp: number;
      index: number;
    }>;
    created_at: number;
  };
}

type GraphStorageStats = {
  total_nodes: number;
  message_nodes: number;
  source_nodes: number;
  code_block_nodes: number;
  total_edges?: number;
};

export interface StorageStats {
  local_storage: {
    totalDocuments: number;
    totalSize: number;
    byType: Record<string, { count: number; size: number }>;
    path: string;
  };
  database?: GraphStorageStats;
  neo4j?: GraphStorageStats;
  storage_model: string;
  storage_mode?: string;
}

/**
 * Get full message content from local storage
 */
export async function getMessageContent(messageId: string): Promise<MessageContent> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/content/message/${messageId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get source document content from local storage
 */
export async function getSourceContent(sourceId: string): Promise<SourceContent> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/content/source/${sourceId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get code block content from local storage
 */
export async function getCodeContent(codeId: string): Promise<CodeContent> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/content/code/${codeId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get full conversation from local storage
 */
export async function getConversationContent(conversationId: string): Promise<ConversationContent> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/content/conversation/${conversationId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get storage statistics
 */
export async function getStorageStats(): Promise<StorageStats> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/content/stats`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

// ==================== Groups API ====================

export interface GroupTreeNode {
  id: string;
  label: string;
  kind: 'Folder' | 'Group';
  group_kind?: 'manual' | 'smart' | 'cluster';
  icon: string;
  badge?: number | string;
  badgeColor?: string;
  isLeaf?: boolean;
  metadata?: Record<string, any>;
}

export interface AutoGroupResult {
  groups: Array<{
    id: string;
    name: string;
    keywords: string[];
    messageCount: number;
    isManual: boolean;
    confidence: number;
  }>;
  stats: {
    totalGroups: number;
    manualGroups: number;
    autoGroups: number;
    catchAllGroup: boolean;
  };
}

/**
 * Get groups tree for navigation (root level folders/groups)
 */
export async function getGroups(): Promise<{ groups: GroupTreeNode[]; count: number }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/groups`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get folder children or group members
 */
export async function getGroupById(id: string): Promise<{
  success: boolean;
  group: GraphNode;
  children?: GroupTreeNode[];
  members?: GraphNode[];
  count: number;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/groups/${id}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get member node IDs from a group (with optional recursive for folder descendants)
 */
export async function getGroupMembers(
  id: string,
  recursive = false
): Promise<{ node_ids: string[]; count: number }> {
  try {
    const url = `${API_BASE_URL}/api/v1/groups/${id}/nodes${recursive ? '?recursive=true' : ''}`;
    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Create a new folder or group
 */
export async function createGroup(data: {
  name: string;
  kind: 'Folder' | 'Group';
  group_kind?: 'manual' | 'smart' | 'cluster';
  parentId?: string;
  query?: string;
}): Promise<{ success: boolean; group: GraphNode }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/groups`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Update a folder or group
 */
export async function updateGroup(
  id: string,
  data: Partial<{ name: string; parentId: string; query: string }>
): Promise<{ success: boolean; group: GraphNode }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/groups/${id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Delete a folder or group
 */
export async function deleteGroup(id: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/groups/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Batch add/remove members from a group
 */
export async function batchUpdateMembers(
  groupId: string,
  { add, remove }: { add?: string[]; remove?: string[] }
): Promise<{ success: boolean; added: number; removed: number }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/groups/${groupId}/members:batch`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ add, remove }),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Auto-generate groups from messages using TF-IDF
 */
export async function autoGenerateGroups(
  messages: Array<{ id: string; content: string; role?: string }>,
  config: {
    mode?: 'auto' | 'manual' | 'hybrid';
    targetGroupCount?: number;
    manualGroups?: Array<{ name: string; keywords: string[] }>;
  }
): Promise<AutoGroupResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/groups/auto`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, config }),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    const data = await response.json();
    return data.result;
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get group suggestions
 */
export async function suggestGroups(
  messages: Array<{ id: string; content: string }>,
  targetCount?: number
): Promise<{ suggestions: Array<{ name: string; count: number }> }> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/groups/suggest?targetCount=${targetCount || 10}`,
      {
        method: 'GET',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

// ==================== Duplicates API ====================

export interface DuplicateResolutionResult {
  success: boolean;
  candidateId: string;
  decision: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge';
  message?: string;
}

/**
 * Resolve a duplicate with a decision
 * Creates appropriate edges based on decision type (immutable approach)
 *
 * @param candidateId - Unique identifier for this duplicate candidate
 * @param decision - Type of resolution (keep-primary, keep-duplicate, keep-both, merge)
 * @param primaryNodeId - Node ID of the primary/canonical version
 * @param duplicateNodeId - Node ID of the duplicate version
 */
export async function resolveDuplicate(
  candidateId: string,
  decision: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge',
  primaryNodeId: string,
  duplicateNodeId: string
): Promise<DuplicateResolutionResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/duplicates/resolve`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId,
        decision,
        primaryNodeId,
        duplicateNodeId,
      }),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Mark a duplicate as ignored (creates IGNORE edge instead of deleting)
 * This follows the immutability principle - nodes are never deleted
 *
 * @param duplicateId - Unique identifier for this duplicate candidate
 * @param primaryNodeId - Node ID of the primary version
 * @param duplicateNodeId - Node ID of the duplicate version
 */
export async function ignoreDuplicate(
  duplicateId: string,
  primaryNodeId: string,
  duplicateNodeId: string
): Promise<{ success: boolean; edgeId: string; message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/duplicates/${duplicateId}/ignore`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ primaryNodeId, duplicateNodeId }),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Delete a duplicate message
 * @deprecated Use ignoreDuplicate() instead - this system maintains immutability
 */
export async function deleteDuplicate(duplicateId: string): Promise<{ success: boolean }> {
  console.warn('deleteDuplicate() is deprecated - use ignoreDuplicate() instead');
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/duplicates/${duplicateId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Apply duplicate review decisions after import
 * Creates appropriate edges and removes/merges nodes based on user decisions
 *
 * @param decisions Array of review decisions
 * @param importId Optional import ID for tracking
 */
export async function applyDuplicateDecisions(
  decisions: Array<{
    duplicateId: string;
    action: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge';
    timestamp: number;
    userId?: string;
  }>,
  importId?: string
): Promise<{
  success: boolean;
  result: {
    applied_decisions: number;
    action_counts: {
      'keep-primary': number;
      'keep-duplicate': number;
      'keep-both': number;
      merge: number;
    };
    nodes_kept: number;
    nodes_removed: number;
    nodes_merged: number;
    message: string;
  };
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/import/chat/apply-decisions`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        decisions,
        import_id: importId,
      }),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

// ==================== Nodes & Edges API ====================

export interface GraphNode {
  id: string;
  kind: string;
  properties?: Record<string, any>;
  created_at?: number;
  updated_at?: number;
  [key: string]: any;
}

export interface GraphEdge {
  id: string;
  kind: string;
  from: string | { id: string };
  to: string | { id: string };
  properties?: Record<string, any>;
  created_at?: number;
  [key: string]: any;
}

/**
 * Get all nodes from the database
 */
export async function getNodes(params?: {
  kind?: string;
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<{ nodes: GraphNode[]; total: number }> {
  try {
    const queryParams = new URLSearchParams();
    if (params?.kind) queryParams.append('kind', params.kind);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.search) queryParams.append('search', params.search);

    const url = `${API_BASE_URL}/api/v1/nodes${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    const data = await response.json();
    console.log('📥 getNodes response:', {
      nodeCount: data.nodes?.length || 0,
      total: data.total,
      sampleNode: data.nodes?.[0]
        ? {
            id: data.nodes[0].id,
            kind: data.nodes[0].kind,
            hasProperties: !!data.nodes[0].properties,
          }
        : null,
    });

    return {
      nodes: data.nodes || [],
      total: data.total || data.nodes?.length || 0,
    };
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get all edges from the database
 */
export async function getEdges(params?: {
  kind?: string;
  limit?: number;
  offset?: number;
}): Promise<{ edges: GraphEdge[]; total: number }> {
  try {
    const queryParams = new URLSearchParams();
    if (params?.kind) queryParams.append('kind', params.kind);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const url = `${API_BASE_URL}/api/v1/edges${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    const data = await response.json();
    return {
      edges: data.edges || [],
      total: data.total || data.edges?.length || 0,
    };
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get a single node by ID
 */
export async function getNode(id: string): Promise<GraphNode> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/nodes/${id}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    const data = await response.json();
    return data.node || data;
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

// ==================== Admin API ====================

export interface Account {
  id: string;
  account_type: 'admin' | 'client';
  account_class: 'free' | 'professional' | 'business';
  name: string;
  mode_service?: boolean;
  parent_account_id?: string;
  rank?: number;
  overrides?: Record<string, boolean>;
  created_at: number;
  updated_at: number;
}

export interface AccountStats {
  nodes: number;
  edges: number;
  users: number;
}

/**
 * Get all accounts (admin only)
 */
export async function getAccounts(): Promise<{ accounts: Account[] }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/accounts`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get account statistics (admin or own account)
 */
export async function getAccountStats(accountId: string): Promise<AccountStats> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/accounts/${accountId}/stats`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

// ==================== Analytics API ====================

export interface AnalyticsOverview {
  accounts: {
    active: number;
    total_seats: number;
    tier_distribution: {
      free: number;
      professional: number;
      business: number;
    };
  };
  user_activity: {
    last_7_days: number;
    last_30_days: number;
    avg_session_time_minutes: number;
  };
  storage: {
    total_nodes: number;
    total_edges: number;
    total_sources: number;
    storage_size_bytes: number;
  };
  processing: {
    active: number;
    completed_today: number;
    failed: number;
  };
  billing: {
    mrr: number;
    churn_rate: number;
    customer_ltv: number;
  };
  system_health: {
    api_latency_ms: number;
    error_rate: number;
    uptime_percent: number;
  };
}

export interface TopAccount {
  id: string;
  name: string;
  account_class: string;
  activity_count?: number;
  node_count?: number;
}

export interface RecentActivity {
  id: string;
  actor_user_id: string;
  user_email: string;
  user_name: string;
  actor_account_id: string;
  account_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  metadata: Record<string, any>;
  timestamp: number; // Backend uses timestamp, not created_at
}

export interface SystemAlert {
  id: string;
  type: 'info' | 'warning' | 'error';
  severity: 'low' | 'medium' | 'high';
  message: string;
  created_at: number;
}

/**
 * Get analytics overview (admin only)
 */
export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/analytics/overview`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get top accounts by metric (admin only)
 */
export async function getTopAccounts(
  metric: 'usage' | 'storage' = 'usage',
  limit: number = 10
): Promise<{ accounts: TopAccount[] }> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/analytics/top-accounts?metric=${metric}&limit=${limit}`,
      {
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get recent system activity (admin only)
 */
export async function getRecentActivity(
  limit: number = 50
): Promise<{ activity: RecentActivity[] }> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/analytics/recent-activity?limit=${limit}`,
      {
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get system alerts (admin only)
 */
export async function getSystemAlerts(): Promise<{ alerts: SystemAlert[] }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/analytics/alerts`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

// ==================== User Management API ====================

export interface User {
  id: string;
  account_id: string;
  email: string;
  name: string;
  permission_level: 'junior' | 'senior' | 'leader' | 'admin';
  user_class: 'person' | 'agent';
  rank: number;
  overrides?: Record<string, boolean>;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

/**
 * Get all users in an account (admin or own account)
 */
export async function getAccountUsers(accountId: string): Promise<{ users: User[] }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/accounts/${accountId}/users`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get a single user by ID
 */
export async function getUser(userId: string): Promise<{ user: User }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/users/${userId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Create a new user in an account (requires admin permission)
 */
export async function createUser(
  accountId: string,
  userData: {
    email: string;
    name: string;
    password?: string;
    permission_level: 'junior' | 'senior' | 'leader' | 'admin';
    user_class: 'person' | 'agent';
  }
): Promise<{ user: User }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/accounts/${accountId}/users`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Update a user (admin permission or self for limited fields)
 */
export async function updateUser(
  userId: string,
  updates: {
    name?: string;
    password?: string;
    permission_level?: 'junior' | 'senior' | 'leader' | 'admin';
    is_active?: boolean;
  }
): Promise<{ user: User }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/users/${userId}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Delete a user (admin permission required, cannot delete self)
 */
export async function deleteUser(userId: string): Promise<{ message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

// ==================== Axios-style API Client ====================

/**
 * Get auth token for SSE and other direct requests
 */
export function getAuthToken(): string {
  return getToken() || '';
}

/**
 * Settings API functions
 */
export async function fetchSettings(accountId: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/v1/settings?accountId=${accountId}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) await handleApiError({ response });
  return response.json();
}

export async function updateSetting(id: string, value: any): Promise<any> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/v1/settings/${id}`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value }),
  });
  if (!response.ok) await handleApiError({ response });
  return response.json();
}

export async function bulkUpdateSettings(updates: Array<{ id: string; value: any }>): Promise<any> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/v1/settings/bulk`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ updates }),
  });
  if (!response.ok) await handleApiError({ response });
  return response.json();
}

/**
 * Axios-style API client for compatibility with existing code
 */
export const apiClient = {
  get: async (url: string, config?: { headers?: HeadersInit }) => {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'GET',
      headers: { ...getAuthHeaders(), ...config?.headers },
    });
    if (!response.ok) await handleApiError({ response });
    return { data: await response.json() };
  },

  post: async (url: string, data?: any, config?: { headers?: HeadersInit }) => {
    const isFormData = data instanceof FormData;
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        ...(!isFormData && { 'Content-Type': 'application/json' }),
        ...config?.headers,
      },
      body: isFormData ? data : JSON.stringify(data),
    });
    if (!response.ok) await handleApiError({ response });
    return { data: await response.json() };
  },

  patch: async (url: string, data?: any, config?: { headers?: HeadersInit }) => {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'PATCH',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
        ...config?.headers,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) await handleApiError({ response });
    return { data: await response.json() };
  },

  delete: async (url: string, config?: { headers?: HeadersInit }) => {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders(), ...config?.headers },
    });
    if (!response.ok) await handleApiError({ response });
    return { data: await response.json() };
  },
};
