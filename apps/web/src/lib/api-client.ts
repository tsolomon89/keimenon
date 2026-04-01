import { ChatImportConfig, DuplicateGroup } from '@/types/chat-import';
import { handleApiError, withRetry, FileError } from './error-handler';
import { getToken } from '@/contexts/AuthContext';
import { API_BASE_URL } from './env.config';
import { normalizeImportOptions, type FeatureManifest } from '@keimenon/types';

const AUTH_REFRESH_ENDPOINT = `${API_BASE_URL}/api/v1/auth/refresh`;
let tokenRefreshPromise: Promise<string | null> | null = null;

/**
 * Decode JWT payload (base64)
 * Returns null if invalid
 */
function decodeJWT(token: string): any {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

/**
 * Check if JWT is expired
 */
function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) return true;

  // exp is in seconds, Date.now() is in milliseconds
  // Add 30 second buffer to refresh before actual expiration
  const now = Math.floor(Date.now() / 1000);
  return payload.exp - 30 < now;
}

/**
 * Handle token expiration by clearing storage and redirecting to login
 * This is called when a token is expired or API returns 401/403
 */
function handleTokenExpiration(reason: string = 'Token expired'): void {
  console.warn(`🔒 ${reason} - logging out user`);

  // Clear token from storage
  if (typeof window !== 'undefined') {
    localStorage.removeItem('keimenon_token');

    // Show user-friendly message
    const event = new CustomEvent('auth:token-expired', {
      detail: { reason },
    });
    window.dispatchEvent(event);

    // Redirect to login after a short delay to allow error display
    setTimeout(() => {
      window.location.href = '/login?reason=expired';
    }, 1000);
  }
}

/**
 * Get authorization headers with token and operating context
 * Note: Operating context is obtained from global state
 *
 * IMPORTANT: This function now validates token expiration before returning headers
 * If token is expired, it triggers logout and throws an error
 */
function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {};

  // Add auth token. Expiry is handled by refresh flow in fetch interceptor.
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

/**
 * Wrap fetch with 401/403 error interceptor
 * Automatically handles auth failures by logging out user
 *
 * Related: apps/web/src/contexts/AuthContext.tsx:506 (logout function)
 */
async function fetchWithAuthInterceptor(
  url: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const requestUrl = String(url);
  let effectiveInit = init;

  const currentToken = getToken();
  if (
    currentToken &&
    isTokenExpired(currentToken) &&
    !requestUrl.includes('/api/v1/auth/refresh')
  ) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      effectiveInit = withAuthorizationToken(init, refreshedToken);
    }
  }

  let response = await fetch(url, effectiveInit);

  // Check for authentication errors
  if (
    (response.status === 401 || response.status === 403) &&
    !requestUrl.includes('/api/v1/auth/refresh')
  ) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      response = await fetch(url, withAuthorizationToken(init, refreshedToken));
      if (response.ok) {
        return response;
      }
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || 'Authentication failed';

    // Handle token expiration
    handleTokenExpiration(errorMessage);
    throw new Error(errorMessage);
  }

  return response;
}

async function refreshAccessToken(): Promise<string | null> {
  if (tokenRefreshPromise) {
    return tokenRefreshPromise;
  }

  tokenRefreshPromise = (async () => {
    const token = getToken();
    if (!token) {
      return null;
    }

    try {
      const response = await fetch(AUTH_REFRESH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const refreshedToken = typeof data?.token === 'string' ? data.token : null;
      if (!refreshedToken) {
        return null;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('keimenon_token', refreshedToken);
      }

      return refreshedToken;
    } catch {
      return null;
    } finally {
      tokenRefreshPromise = null;
    }
  })();

  return tokenRefreshPromise;
}

function withAuthorizationToken(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  return {
    ...init,
    headers,
  };
}

export const api = {
  get: async <T>(endpoint: string): Promise<{ data: T }> => {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1${endpoint}`);
    if (!response.ok) throw new Error(response.statusText);
    const data = await response.json();
    return { data };
  },
  post: async <T>(endpoint: string, body: any): Promise<{ data: T }> => {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(response.statusText);
    const data = await response.json();
    return { data };
  },
  put: async <T>(endpoint: string, body: any): Promise<{ data: T }> => {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(response.statusText);
    const data = await response.json();
    return { data };
  },
  delete: async <T>(endpoint: string): Promise<{ data: T }> => {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1${endpoint}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders(),
      },
    });
    if (!response.ok) throw new Error(response.statusText);
    const data = await response.json().catch(() => ({})); // Handle empty response
    return { data };
  },
};

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

export interface FeatureManifestResponse {
  plan: 'free' | 'pro' | 'business';
  accountClass: 'free' | 'professional' | 'business';
  features: FeatureManifest;
  generatedAt: number;
}

export interface SimilarityPreviewSummary {
  input: {
    messages: number;
    previewDocuments: number;
    branches: 'merged' | 'separate';
    processingMode: 'automatic' | 'manual' | 'hybrid';
  };
  predicted: {
    clusterCount: number;
    edgeCount: number;
    edgeStrength: {
      strong: number;
      medium: number;
      weak: number;
    };
    expectedReviewLoad: number;
  };
  mass: {
    min: number;
    mean: number;
    p50: number;
    p95: number;
    max: number;
  };
  anchors: Array<{ term: string; count: number }>;
  generatedAt: number;
}

export interface ImportPreset {
  id: string;
  name: string;
  config: ChatImportConfig;
  createdAt: number;
  updatedAt: number;
}

export interface ImportStatsSeriesPoint {
  index: number;
  bucketStart: number;
  bucketEnd: number;
  imports: number;
  conversations: number;
  messages: number;
  sources: number;
  nodes: number;
  edges: number;
}

export interface ImportStatsSeriesResponse {
  success: boolean;
  window: '24h' | '7d' | '30d';
  bucketCount: number;
  bucketSizeMs: number;
  range: {
    start: number;
    end: number;
  };
  series: ImportStatsSeriesPoint[];
}

export async function getSimilarityPreview(payload: {
  config: unknown;
  messages?: unknown[];
  conversations?: unknown[];
  sources?: unknown[];
}): Promise<{ success: boolean; summary: SimilarityPreviewSummary }> {
  try {
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/import/similarity-preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
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

export async function listImportPresets(): Promise<{ success: boolean; presets: ImportPreset[] }> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/import/presets`, {
      method: 'GET',
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

export async function createImportPreset(payload: {
  name: string;
  config: ChatImportConfig;
}): Promise<{ success: boolean; preset: ImportPreset }> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/import/presets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

export async function updateImportPreset(
  id: string,
  payload: { name?: string; config?: ChatImportConfig }
): Promise<{ success: boolean; preset: ImportPreset }> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/import/presets/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    return await response.json();
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

export async function deleteImportPreset(id: string): Promise<{ success: boolean }> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/import/presets/${id}`, {
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

export async function getImportStatsSeries(
  window: '24h' | '7d' | '30d' = '24h',
  buckets: number = 12
): Promise<ImportStatsSeriesResponse> {
  try {
    const params = new URLSearchParams({
      window,
      buckets: String(buckets),
    });

    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/import/stats/series?${params.toString()}`,
      {
        method: 'GET',
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

export async function getMyFeatures(): Promise<FeatureManifestResponse> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/me/features`, {
      method: 'GET',
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
  const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/jobs/${jobId}/cancel`, {
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
 * If checkpoint state exists, the backend may copy it to support resumed execution.
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
  const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/jobs/${jobId}/retry`, {
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
 * Resume continues from the latest persisted checkpoint when available.
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
  const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/jobs/${jobId}/pause`, {
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
 * WorkerPool will pick it up and continue from the latest checkpoint.
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
  const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/jobs/${jobId}/resume`, {
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
 * Related: apps/web/src/components/keimenon/ImportsTableCard.tsx (job history display)
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

  const jobConfig = normalizeImportOptions({
    platform: detectedPlatform,
    extraction: {
      includeUser: config.extraction.includeUser,
      includeAssistant: config.extraction.includeAssistant,
    },
    minMessageLength: config.minMessageLength,
    processingMode: config.processingMode,
    branches: config.branches,
    agent: {
      bootstrap: config.agent?.bootstrap || 'manual',
    },
    groups:
      config.processingMode === 'manual' || config.processingMode === 'hybrid' ? config.groups : [],
    extractCode: config.extractCode,
    codeSettings: {
      minLength: config.codeSettings.minLength,
      languages: config.codeSettings.languages,
      groupBy: config.codeSettings.groupBy,
      deduplicate: config.codeSettings.deduplicate,
      sourceHandling: config.codeSettings.sourceHandling,
    },
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
  });

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
          const response = await fetchWithAuthInterceptor(endpoint, {
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
 * Detect platform from file content without importing
 */
export async function detectPlatform(file: File): Promise<{
  platform: string;
  confidence: number;
}> {
  // Define text variable outside try block for access in catch
  let text = '';

  try {
    // For large files (> 10MB), read first 5MB to ensure we catch the keys
    const SAMPLE_SIZE = 5 * 1024 * 1024; // 5MB

    if (file.size > 10 * 1024 * 1024) {
      const blob = file.slice(0, SAMPLE_SIZE);
      text = await blob.text();
      console.log(`[detectPlatform] Read 5MB sample. Preview: ${text.substring(0, 200)}...`);
    } else {
      text = await file.text();
    }

    const data = JSON.parse(text);
    console.log('[detectPlatform] File keys:', Object.keys(data));
    if (Array.isArray(data)) {
      console.log('[detectPlatform] Array first item keys:', Object.keys(data[0] || {}));
    }

    // Check for ChatGPT format - has uuid, chat_messages, account (from actual ChatGPT exports)
    // NOTE: ChatGPT exports use uuid/chat_messages/account structure
    if (Array.isArray(data) && data[0]?.chat_messages && data[0]?.account) {
      return { platform: 'chatgpt', confidence: 0.95 };
    }
    if (data.uuid && data.chat_messages && data.account) {
      return { platform: 'chatgpt', confidence: 0.9 };
    }
    // ChatGPT array with chat_messages + uuid (without account check as fallback)
    if (Array.isArray(data) && data[0]?.chat_messages && data[0]?.uuid) {
      return { platform: 'chatgpt', confidence: 0.85 };
    }

    // Check for Claude format - has mapping with tree structure (from actual Claude exports)
    // NOTE: Claude exports use mapping/title structure with nested message tree
    if (Array.isArray(data) && data[0]?.mapping) {
      return { platform: 'claude', confidence: 0.95 };
    }
    if (!Array.isArray(data) && data.mapping) {
      return { platform: 'claude', confidence: 0.9 };
    }
    if (Array.isArray(data) && data[0]?.conversation_id) {
      return { platform: 'claude', confidence: 0.85 };
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
    // If JSON parse fails (likely due to partial read of large file), fall back to string inspection
    console.warn(
      '[detectPlatform] JSON parse failed (expected for large files), trying heuristic match:',
      error
    );

    // Fallback Heuristics (order matters - more specific first)
    // ChatGPT: Has "chat_messages" with "account" object (actual ChatGPT export format)
    if (text.includes('"chat_messages":') && text.includes('"account":')) {
      return { platform: 'chatgpt', confidence: 0.8 };
    }
    // ChatGPT fallback: just chat_messages with uuid
    if (text.includes('"chat_messages":') && text.includes('"uuid":')) {
      return { platform: 'chatgpt', confidence: 0.7 };
    }

    // Claude: Has "mapping" with nested tree structure (actual Claude export format)
    if (text.includes('"mapping":')) {
      return { platform: 'claude', confidence: 0.8 };
    }
    if (text.includes('"conversation_id":')) {
      return { platform: 'claude', confidence: 0.7 };
    }

    // Gemini: Looks for "conversations" array with specific structure
    if (text.includes('"conversations":')) {
      return { platform: 'gemini', confidence: 0.8 };
    }

    // Generic: Has messages array but unknown platform
    if (text.includes('"messages":') && text.includes('"role":')) {
      return { platform: 'generic', confidence: 0.5 };
    }

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
      // If analysis fails, provide a conservative estimate so the import UI remains usable.
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
  source: 'local' | 'database';
  role: string;
  timestamp: number;
  char_count?: number;
}

export interface SourceContent {
  id: string;
  title: string;
  content: string;
  source: 'local' | 'database';
  mime_type: string;
  size_bytes: number;
}

export interface CodeContent {
  id: string;
  code: string;
  language: string;
  source: 'local' | 'database';
  line_count?: number;
  char_count?: number;
}

export interface ConversationContent {
  id: string;
  source: 'local' | 'database';
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

// ============================================================================
// V2 Node Content Types (Vision V2: Lexeme, Phrase, Topic, Verified nodes)
// ============================================================================

export interface LexemeContent {
  id: string;
  lemma: string;
  pos?: string;
  frequency: number;
  source: 'database';
}

export interface PhraseContent {
  id: string;
  text: string;
  normalized_text: string;
  type: 'n-gram' | 'entity' | 'concept';
  entity_type?: string;
  frequency: number;
  source: 'database';
}

export interface TopicContent {
  id: string;
  name: string;
  description?: string;
  keywords: string[];
  strength: number;
  source: 'database';
}

export interface VerifiedSourceContent {
  id: string;
  url: string;
  title: string;
  publisher?: string;
  author?: string;
  published_at?: number;
  accessed_at?: number;
  trust_score: number;
  source: 'database';
}

export interface VerifiedClaimContent {
  id: string;
  claim_text: string;
  source_id: string;
  evidence_excerpt?: string;
  confidence: number;
  status: 'proposed' | 'verified' | 'disputed' | 'refuted';
  source: 'database';
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
  storage_model: string;
  storage_mode?: string;
}

/**
 * Get full message content from local storage
 */
export async function getMessageContent(messageId: string): Promise<MessageContent> {
  try {
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/content/message/${messageId}`,
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
 * Get source document content from local storage
 */
export async function getSourceContent(sourceId: string): Promise<SourceContent> {
  try {
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/content/source/${sourceId}`,
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
 * Get code block content from local storage
 */
export async function getCodeContent(codeId: string): Promise<CodeContent> {
  try {
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/content/code/${codeId}`,
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
 * Get full conversation from local storage
 */
export async function getConversationContent(conversationId: string): Promise<ConversationContent> {
  try {
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/content/conversation/${conversationId}`,
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

// ============================================================================
// V2 Node Content Fetchers (use existing /api/v1/nodes/:id endpoint)
// ============================================================================

/**
 * Get Lexeme node content from database
 */
export async function getLexemeContent(id: string): Promise<LexemeContent> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/nodes/${id}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    const node = await response.json();
    return {
      id: node.id,
      lemma: node.lemma || node.properties?.lemma || '',
      pos: node.pos || node.properties?.pos,
      frequency: node.frequency || node.properties?.frequency || 0,
      source: 'database',
    };
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get Phrase node content from database
 */
export async function getPhraseContent(id: string): Promise<PhraseContent> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/nodes/${id}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    const node = await response.json();
    return {
      id: node.id,
      text: node.text || node.properties?.text || '',
      normalized_text: node.normalized_text || node.properties?.normalized_text || '',
      type: node.type || node.properties?.type || 'n-gram',
      entity_type: node.entity_type || node.properties?.entity_type,
      frequency: node.frequency || node.properties?.frequency || 0,
      source: 'database',
    };
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get Topic node content from database
 */
export async function getTopicContent(id: string): Promise<TopicContent> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/nodes/${id}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    const node = await response.json();
    return {
      id: node.id,
      name: node.name || node.properties?.name || '',
      description: node.description || node.properties?.description,
      keywords: node.keywords || node.properties?.keywords || [],
      strength: node.strength || node.properties?.strength || 0,
      source: 'database',
    };
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get VerifiedSource node content from database
 */
export async function getVerifiedSourceContent(id: string): Promise<VerifiedSourceContent> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/nodes/${id}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    const node = await response.json();
    return {
      id: node.id,
      url: node.url || node.properties?.url || '',
      title: node.title || node.properties?.title || '',
      publisher: node.publisher || node.properties?.publisher,
      author: node.author || node.properties?.author,
      published_at: node.published_at || node.properties?.published_at,
      accessed_at: node.accessed_at || node.properties?.accessed_at,
      trust_score: node.trust_score || node.properties?.trust_score || 0,
      source: 'database',
    };
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get VerifiedClaim node content from database
 */
export async function getVerifiedClaimContent(id: string): Promise<VerifiedClaimContent> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/nodes/${id}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      await handleApiError({ response });
    }

    const node = await response.json();
    return {
      id: node.id,
      claim_text: node.claim_text || node.properties?.claim_text || '',
      source_id: node.source_id || node.properties?.source_id || '',
      evidence_excerpt: node.evidence_excerpt || node.properties?.evidence_excerpt,
      confidence: node.confidence || node.properties?.confidence || 0,
      status: node.status || node.properties?.status || 'proposed',
      source: 'database',
    };
  } catch (error: any) {
    throw await handleApiError(error);
  }
}

/**
 * Get storage statistics
 */
export async function getStorageStats(): Promise<StorageStats> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/content/stats`, {
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
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/groups`, {
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
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/groups/${id}`, {
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
    // Bug fix #25: Use fetchWithAuthInterceptor for consistent auth handling
    const url = `${API_BASE_URL}/api/v1/groups/${id}/nodes${recursive ? '?recursive=true' : ''}`;
    const response = await fetchWithAuthInterceptor(url, {
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
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/groups`, {
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
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/groups/${id}`, {
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
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/groups/${id}`, {
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
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/groups/${groupId}/members:batch`,
      {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ add, remove }),
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
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/groups/auto`, {
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
    // Bug fix #25: Use fetchWithAuthInterceptor for consistent auth handling
    const response = await fetchWithAuthInterceptor(
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
  decision: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge' | 'sequester';
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
  decision: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge' | 'sequester',
  primaryNodeId: string,
  duplicateNodeId: string
): Promise<DuplicateResolutionResult> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/duplicates/resolve`, {
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
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/duplicates/${duplicateId}/ignore`,
      {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryNodeId, duplicateNodeId }),
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
 * Delete a duplicate message
 * @deprecated Use ignoreDuplicate() instead - this system maintains immutability
 */
export async function deleteDuplicate(duplicateId: string): Promise<{ success: boolean }> {
  console.warn('deleteDuplicate() is deprecated - use ignoreDuplicate() instead');
  try {
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/duplicates/${duplicateId}`,
      {
        method: 'DELETE',
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
 * Apply duplicate review decisions after import
 * Creates appropriate edges and removes/merges nodes based on user decisions
 *
 * @param decisions Array of review decisions
 * @param jobId Required job ID for review context
 */
export async function applyDuplicateDecisions(
  decisions: Array<{
    duplicateId: string;
    action: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge' | 'sequester';
    timestamp: number;
    userId?: string;
    primaryNodeId?: string;
    duplicateNodeId?: string;
  }>,
  jobId: string
): Promise<{
  success: boolean;
  result: {
    applied_decisions: number;
    action_counts: {
      'keep-primary': number;
      'keep-duplicate': number;
      'keep-both': number;
      merge: number;
      sequester: number;
    };
    nodes_sequestered: number;
    nodes_merged: number;
    edges_created: number;
    pending_candidates: number;
    message: string;
  };
}> {
  if (!jobId) {
    throw new Error('jobId is required to apply duplicate review decisions');
  }

  try {
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/jobs/${jobId}/duplicate-review/apply`,
      {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decisions,
        }),
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

export interface DuplicateReviewStatus {
  jobId: string;
  duplicate_detection_enabled: boolean;
  require_review: boolean;
  review_required: boolean;
  stage: 'not_required' | 'pending' | 'in_progress' | 'completed';
  total_groups: number;
  total_candidates: number;
  decided_candidates: number;
  pending_candidates: number;
  completed: boolean;
  last_updated: number;
}

export interface DuplicateReviewStatusResponse {
  success: boolean;
  status: DuplicateReviewStatus;
}

export interface DuplicateReviewGroupsResponse {
  success: boolean;
  groups: DuplicateGroup[];
  total_groups: number;
  total_candidates: number;
}

export async function getDuplicateReviewStatus(
  jobId: string
): Promise<DuplicateReviewStatusResponse> {
  if (!jobId) {
    throw new Error('jobId is required to fetch duplicate review status');
  }

  try {
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/jobs/${jobId}/duplicate-review/status`,
      {
        method: 'GET',
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

export async function getDuplicateReviewGroups(
  jobId: string
): Promise<DuplicateReviewGroupsResponse> {
  if (!jobId) {
    throw new Error('jobId is required to fetch duplicate review groups');
  }

  try {
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/jobs/${jobId}/duplicate-review/groups`,
      {
        method: 'GET',
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
  skip?: number;
  cursor?: string;
  sort?: 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
}): Promise<{ edges: GraphEdge[]; total: number }> {
  try {
    const queryParams = new URLSearchParams();
    if (params?.kind) queryParams.append('kind', params.kind);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
    if (params?.cursor) queryParams.append('cursor', params.cursor);
    if (params?.sort) queryParams.append('sort', params.sort);
    if (params?.order) queryParams.append('order', params.order);

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
      total: data.total || data.metadata?.total || data.edges?.length || 0,
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
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/nodes/${id}`, {
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

/**
 * Sequester or unsequester a node for the current user principal.
 */
export async function sequesterNode(
  id: string,
  options: { sequester?: boolean } = {}
): Promise<{
  success: boolean;
  sequestered: boolean;
  edgeId?: string;
  alreadySequestered?: boolean;
  removed?: number;
}> {
  const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/nodes/${id}/sequester`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sequester: options.sequester ?? true,
    }),
  });

  if (!response.ok) {
    await handleApiError({ response });
  }

  return response.json();
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
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/accounts`, {
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
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/accounts/${accountId}/stats`,
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
    queue_depth?: number;
    running_jobs?: number;
    throughput_24h?: number;
    worker_heartbeat_age_ms?: number | null;
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
  account_id?: string | null;
  source?: string;
  type: 'info' | 'warning' | 'error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status?: 'active' | 'acknowledged' | 'resolved';
  message: string;
  metadata?: Record<string, any> | null;
  created_at: number;
  updated_at?: number;
  resolved_at?: number | null;
}

/**
 * Get analytics overview (admin only)
 */
export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/analytics/overview`, {
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
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/analytics/alerts`, {
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
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/accounts/${accountId}/users`,
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
 * Get a single user by ID
 */
export async function getUser(userId: string): Promise<{ user: User }> {
  try {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/users/${userId}`, {
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
    const response = await fetchWithAuthInterceptor(
      `${API_BASE_URL}/api/v1/accounts/${accountId}/users`,
      {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
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
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/users/${userId}`, {
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
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/users/${userId}`, {
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
  const response = await fetchWithAuthInterceptor(
    `${API_BASE_URL}/api/v1/settings?accountId=${accountId}`,
    {
      headers: getAuthHeaders(),
    }
  );
  if (!response.ok) await handleApiError({ response });
  return response.json();
}

export async function updateSetting(id: string, value: any): Promise<any> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/settings/${id}`, {
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

  const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/settings/bulk`, {
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

// ============================================================================
// URL Ingestion API
// ============================================================================

/**
 * Response from URL ingestion endpoint
 */
export interface URLIngestResponse {
  success: boolean;
  duplicate: boolean;
  duplicateOf?: string;
  source?: any;
  message?: string;
  metadata?: {
    url: string;
    canonicalUrl: string;
    finalUrl?: string;
    title?: string;
    author?: string;
    publishedDate?: string;
    siteName?: string;
    fetchedAt: number;
    contentSize: number;
    fingerprint: string;
    wordCount?: number;
    charCount?: number;
    codeBlockCount?: number;
    imageCount?: number;
  };
}

/**
 * Ingest content from a URL
 *
 * Fetches the URL, extracts readable content using Mozilla Readability,
 * generates a fingerprint, and creates a Source node in the database.
 *
 * Security: The backend has SSRF protection that blocks private/internal IPs.
 *
 * @param url - The URL to fetch and ingest
 * @param boardId - Optional board to associate the source with
 * @returns URL ingestion result including metadata and duplicate detection
 */
export async function ingestUrl(url: string, boardId?: string): Promise<URLIngestResponse> {
  const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/ingest/url`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, board_id: boardId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || errorData.message || `Failed to ingest URL: ${response.statusText}`
    );
  }

  return response.json();
}

export interface CoreProcessReimportStatus {
  requiresReimport: boolean;
  version: string | null;
  lastResetAt: string | null;
  backupPath: string | null;
}

export async function getCoreProcessReimportStatus(): Promise<CoreProcessReimportStatus> {
  const response = await fetchWithAuthInterceptor(`${API_BASE_URL}/api/v1/system/reimport-status`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw await handleApiError({ response });
  }

  return response.json();
}

export async function completeCoreProcessReimport(): Promise<{ success: boolean }> {
  const response = await fetchWithAuthInterceptor(
    `${API_BASE_URL}/api/v1/system/reimport-complete`,
    {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );

  if (!response.ok) {
    throw await handleApiError({ response });
  }

  return response.json();
}

/**
 * Axios-style API client for compatibility with existing code
 * Now includes automatic token expiration handling and 401/403 interception
 */
export const apiClient = {
  get: async (url: string, config?: { headers?: HeadersInit }) => {
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}${url}`, {
      method: 'GET',
      headers: { ...getAuthHeaders(), ...config?.headers },
    });
    if (!response.ok) await handleApiError({ response });
    return { data: await response.json() };
  },

  post: async (url: string, data?: any, config?: { headers?: HeadersInit }) => {
    const isFormData = data instanceof FormData;
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}${url}`, {
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
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}${url}`, {
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
    const response = await fetchWithAuthInterceptor(`${API_BASE_URL}${url}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders(), ...config?.headers },
    });
    if (!response.ok) await handleApiError({ response });
    return { data: await response.json() };
  },
};
