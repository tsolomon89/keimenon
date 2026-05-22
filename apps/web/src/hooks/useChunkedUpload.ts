/**
 * useChunkedUpload Hook
 *
 * React hook for chunked file uploads with resume capability.
 * Optimized for large files (up to 2GB) with automatic retry and progress tracking.
 *
 * Features:
 * - Automatic chunking (10MB chunks)
 * - Concurrent chunk uploads (6 parallel)
 * - Resume after browser close (localStorage)
 * - Progress tracking with ETAs
 * - Automatic retry on network errors
 * - Pause/resume/cancel support
 *
 * Usage:
 * ```tsx
 * const { upload, progress, pause, resume, cancel } = useChunkedUpload();
 * await upload(file);
 * ```
 *
 * Related: Chunked Upload System - Phase 4
 */

import { useState, useCallback, useRef } from 'react';
import { apiClient, authenticatedFetch } from '@/lib/api-client';
import { API_BASE_URL } from '@/lib/env.config';
import { getToken } from '@/contexts/AuthContext';
import { normalizeImportOptions } from '@keimenon/types';

// ============================================================================
// Types
// ============================================================================

export interface UploadProgress {
  fileName: string;
  fileSize: number;
  bytesUploaded: number;
  percentage: number; // 0-100
  chunkIndex: number;
  totalChunks: number;
  chunksUploaded: number;
  status:
    | 'idle'
    | 'uploading'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'canceled'
    | 'hashing'
    | 'initiating';
  error?: string;
  estimatedTimeRemaining?: number; // seconds
  uploadSpeed?: number; // bytes per second
}

export interface UploadSession {
  id: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  chunksUploaded: number[];
  missingChunks: number[];
  expiresAt: number;
  status: string;
  jobId: string;
}

interface UploadState {
  sessionId?: string;
  jobId?: string;
  file?: File;
  progress: UploadProgress;
  isPaused: boolean;
  isCanceled: boolean;
  uploadedChunks: Set<number>;
  startTime?: number;
  bytesUploadedAtStart: number;
}

// ============================================================================
// Constants
// ============================================================================

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB (local-optimized)
const MAX_CONCURRENT_UPLOADS = 6; // Concurrent chunk uploads
const RETRY_ATTEMPTS = 3; // Per-chunk retry attempts
const RETRY_DELAY_MS = 1000; // Initial retry delay
const STORAGE_KEY_PREFIX = 'chunked_upload_'; // LocalStorage key prefix
const SESSION_EXPIRED_MESSAGE = 'Session expired. Please log in again before uploading.';

// ============================================================================
// Hook
// ============================================================================

export function useChunkedUpload() {
  const [state, setState] = useState<UploadState>({
    progress: {
      fileName: '',
      fileSize: 0,
      bytesUploaded: 0,
      percentage: 0,
      chunkIndex: 0,
      totalChunks: 0,
      chunksUploaded: 0,
      status: 'idle',
    },
    isPaused: false,
    isCanceled: false,
    uploadedChunks: new Set(),
    bytesUploadedAtStart: 0,
  });

  const abortControllersRef = useRef<Map<number, AbortController>>(new Map());

  // Bug fix #14: Use refs for pause/cancel flags to avoid circular dependencies in useCallback
  // This prevents the upload loop from restarting when state changes
  const isPausedRef = useRef(false);
  const isCanceledRef = useRef(false);

  // ============================================================================
  // LocalStorage Persistence
  // ============================================================================

  /**
   * Save session state to localStorage for resume capability
   */
  const saveSessionToStorage = useCallback(
    (sessionId: string, file: File, uploadedChunks: Set<number>) => {
      const storageKey = `${STORAGE_KEY_PREFIX}${sessionId}`;
      const sessionData = {
        sessionId,
        fileName: file.name,
        fileSize: file.size,
        uploadedChunks: Array.from(uploadedChunks),
        timestamp: Date.now(),
      };
      localStorage.setItem(storageKey, JSON.stringify(sessionData));
    },
    []
  );

  /**
   * Load session state from localStorage
   */
  const loadSessionFromStorage = useCallback((sessionId: string) => {
    const storageKey = `${STORAGE_KEY_PREFIX}${sessionId}`;
    const data = localStorage.getItem(storageKey);
    if (!data) return null;

    try {
      const sessionData = JSON.parse(data);
      return {
        ...sessionData,
        uploadedChunks: new Set(sessionData.uploadedChunks),
      };
    } catch (error) {
      console.error('Failed to load session from storage:', error);
      return null;
    }
  }, []);

  /**
   * Clear session from localStorage after completion
   */
  const clearSessionStorage = useCallback((sessionId: string) => {
    const storageKey = `${STORAGE_KEY_PREFIX}${sessionId}`;
    localStorage.removeItem(storageKey);
  }, []);

  // ============================================================================
  // Upload Functions
  // ============================================================================

  /**
   * Upload a single chunk with retry logic
   */
  /**
   * Upload a single chunk
   * Returns { success: boolean; jobId?: string } - jobId is set on the final chunk
   */
  const uploadChunk = useCallback(
    async (
      sessionId: string,
      file: File,
      chunkIndex: number,
      retryCount = 0
    ): Promise<{ success: boolean; jobId?: string }> => {
      try {
        // Bug fix #14: Use refs for stable flag checking (avoids stale closures)
        if (isCanceledRef.current || isPausedRef.current) {
          return { success: false };
        }

        // Read chunk data
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkData = file.slice(start, end);

        // Create abort controller for this chunk
        const abortController = new AbortController();
        abortControllersRef.current.set(chunkIndex, abortController);

        // Upload chunk using raw fetch (to support AbortController)
        const headers: HeadersInit = {
          'Content-Type': 'application/octet-stream',
        };

        const token = getToken();
        if (!token) {
          throw new Error(SESSION_EXPIRED_MESSAGE);
        }

        const response = await authenticatedFetch(
          `${API_BASE_URL}/api/v1/uploads/${sessionId}/chunks/${chunkIndex}`,
          {
            method: 'POST',
            headers,
            body: chunkData,
            signal: abortController.signal,
          }
        );

        // Clean up abort controller
        abortControllersRef.current.delete(chunkIndex);

        if (response.ok) {
          const result = await response.json();
          // Return both success status and jobId (if present on final chunk)
          return {
            success: result.success === true,
            jobId: result.jobId, // Set when isComplete=true
          };
        } else {
          if (response.status === 401 || response.status === 403) {
            throw new Error(SESSION_EXPIRED_MESSAGE);
          }
          const errorData = await response.json();
          // Read message field for actual error (e.g., ENOSPC, EPERM)
          throw new Error(errorData.message || errorData.error || 'Chunk upload failed');
        }
      } catch (error: any) {
        // Handle abort (pause/cancel)
        if (error.name === 'AbortError') {
          return { success: false };
        }

        // Retry logic
        if (retryCount < RETRY_ATTEMPTS) {
          console.log(
            `Retrying chunk ${chunkIndex} (attempt ${retryCount + 1}/${RETRY_ATTEMPTS})...`
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));
          return uploadChunk(sessionId, file, chunkIndex, retryCount + 1);
        }

        // Max retries exceeded
        const finalMessage = String(error?.message || error || 'Chunk upload failed');
        if (finalMessage === SESSION_EXPIRED_MESSAGE) {
          throw new Error(finalMessage);
        }

        throw new Error(
          `Failed to upload chunk ${chunkIndex} after ${RETRY_ATTEMPTS} attempts: ${finalMessage}`
        );
      }
    },
    [] // Bug fix #14: No dependencies needed - uses refs for flags
  );

  /**
   * Upload chunks with concurrency control
   * Uses proper promise tracking to avoid memory leaks
   * Returns the jobId from the final chunk response
   */
  const uploadChunksInParallel = useCallback(
    async (
      sessionId: string,
      file: File,
      missingChunks: number[],
      totalChunks: number,
      initialUploadedChunkIndexes: number[] = []
    ): Promise<string | undefined> => {
      const startTime = Date.now();
      const uploadedChunks = new Set(initialUploadedChunkIndexes);
      const chunks = [...missingChunks];

      // Track active uploads with completion status
      const activeUploads = new Map<number, Promise<void>>();

      // Track jobId from final chunk response
      let finalJobId: string | undefined;

      // Throttle progress updates to avoid flooding React state
      let lastProgressUpdate = 0;
      const PROGRESS_UPDATE_INTERVAL = 200; // ms

      const updateProgress = (chunkIndex: number) => {
        const now = Date.now();
        if (now - lastProgressUpdate < PROGRESS_UPDATE_INTERVAL) return;
        lastProgressUpdate = now;

        const bytesUploaded = uploadedChunks.size * CHUNK_SIZE;
        const percentage = Math.round((uploadedChunks.size / totalChunks) * 100);
        const elapsed = (now - startTime) / 1000;
        const uploadSpeed = elapsed > 0 ? bytesUploaded / elapsed : 0;
        const bytesRemaining = file.size - bytesUploaded;
        const estimatedTimeRemaining =
          uploadSpeed > 0 ? Math.round(bytesRemaining / uploadSpeed) : 0;

        setState((prev) => ({
          ...prev,
          uploadedChunks,
          progress: {
            ...prev.progress,
            bytesUploaded,
            percentage,
            chunkIndex,
            chunksUploaded: uploadedChunks.size,
            uploadSpeed,
            estimatedTimeRemaining,
            status: 'uploading',
          },
        }));
      };

      while (chunks.length > 0 || activeUploads.size > 0) {
        // Bug fix #14: Use refs for stable flag checking in loop
        if (isPausedRef.current || isCanceledRef.current) {
          abortControllersRef.current.forEach((controller: AbortController) => controller.abort());
          abortControllersRef.current.clear();
          return finalJobId;
        }

        // Fill up to MAX_CONCURRENT_UPLOADS
        while (activeUploads.size < MAX_CONCURRENT_UPLOADS && chunks.length > 0) {
          const chunkIndex = chunks.shift()!;

          const uploadPromise = uploadChunk(sessionId, file, chunkIndex)
            .then((result) => {
              if (result.success) {
                uploadedChunks.add(chunkIndex);
                updateProgress(chunkIndex);
                saveSessionToStorage(sessionId, file, uploadedChunks);

                // Capture jobId from final chunk (when isComplete=true)
                if (result.jobId) {
                  console.log(`✅ Received jobId from final chunk: ${result.jobId}`);
                  finalJobId = result.jobId;
                }
              }
            })
            .finally(() => {
              // Remove this upload from active set when done
              activeUploads.delete(chunkIndex);
            });

          activeUploads.set(chunkIndex, uploadPromise);
        }

        // Wait for at least one upload to complete
        if (activeUploads.size > 0) {
          await Promise.race(activeUploads.values());
        }
      }

      // Force final progress update
      setState((prev) => ({
        ...prev,
        uploadedChunks,
        progress: {
          ...prev.progress,
          bytesUploaded: file.size,
          percentage: 100,
          chunksUploaded: totalChunks,
          status: 'uploading',
        },
      }));

      // Return the jobId captured from final chunk response
      return finalJobId;
    },
    [uploadChunk, saveSessionToStorage]
  );

  const resolveJobIdFromSession = useCallback(
    async (sessionId: string): Promise<string | undefined> => {
      try {
        const statusResponse = await apiClient.get(`/api/v1/uploads/${sessionId}`);
        if (!statusResponse?.data?.success) {
          return undefined;
        }
        const session = statusResponse.data.session as Record<string, any> | undefined;
        return typeof session?.jobId === 'string' && session.jobId.length > 0
          ? session.jobId
          : undefined;
      } catch {
        return undefined;
      }
    },
    []
  );

  /**
   * Main upload function
   *
   * @param file - File to upload
   * @param importConfig - Optional import configuration (for chat imports)
   */
  const upload = useCallback(
    async (
      file: File,
      importConfig?: any
    ): Promise<{
      success: boolean;
      jobId?: string;
      error?: string;
      code?: string;
      details?: any;
    }> => {
      try {
        const effectiveImportConfig = normalizeImportOptions(importConfig);

        console.log(
          `📤 Starting chunked upload: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
        );

        // Size ceiling guard: 200MB
        const SIZE_CEILING_MB = 200;
        const SIZE_CEILING_BYTES = SIZE_CEILING_MB * 1024 * 1024;
        if (file.size > SIZE_CEILING_BYTES) {
          const error = new Error(
            `File is too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Maximum allowed size is ${SIZE_CEILING_MB} MB.`
          );
          (error as any).code = 'FILE_TOO_LARGE';
          throw error;
        }

        // Reset state and refs with 'hashing' status
        isPausedRef.current = false;
        isCanceledRef.current = false;
        setState({
          file,
          progress: {
            fileName: file.name,
            fileSize: file.size,
            bytesUploaded: 0,
            percentage: 0,
            chunkIndex: 0,
            totalChunks: Math.ceil(file.size / CHUNK_SIZE),
            chunksUploaded: 0,
            status: 'hashing',
          },
          isPaused: false,
          isCanceled: false,
          uploadedChunks: new Set(),
          startTime: Date.now(),
          bytesUploadedAtStart: 0,
        });

        // Pre-compute SHA-256 hash using native Web Crypto API
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const uploadHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

        // Transition state to 'initiating'
        setState((prev) => ({
          ...prev,
          progress: {
            ...prev.progress,
            status: 'initiating',
          },
        }));

        // Step 1: Initiate upload session
        const initResponse = await apiClient.post('/api/v1/uploads/initiate', {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/json',
          chunkSize: CHUNK_SIZE,
          importConfig: effectiveImportConfig,
          uploadHash,
        });

        if (!initResponse.data.success) {
          throw new Error(initResponse.data.error || 'Failed to initiate upload');
        }

        const session: UploadSession = initResponse.data.session;

        console.log(`✅ Upload session created: ${session.id}`);
        console.log(`   Total chunks: ${session.totalChunks}`);

        setState((prev) => ({
          ...prev,
          sessionId: session.id,
        }));

        // Step 2: Upload all chunks (jobId is returned from final chunk response)
        const missingChunks = Array.from({ length: session.totalChunks }, (_, i) => i);
        const uploadJobId = await uploadChunksInParallel(
          session.id,
          file,
          missingChunks,
          session.totalChunks,
          []
        );

        // Check if canceled or paused
        if (isCanceledRef.current) {
          console.log('Upload canceled by user');
          return { success: false, error: 'Upload canceled by user' };
        }

        if (isPausedRef.current) {
          console.log('Upload paused by user');
          return { success: false, error: 'Upload paused by user' };
        }

        // Step 3: Upload complete
        console.log(`✅ Upload complete: ${file.name}`);
        const resolvedJobId = uploadJobId || (await resolveJobIdFromSession(session.id));

        console.log(`   Job ID: ${resolvedJobId}`);

        // Clear localStorage
        clearSessionStorage(session.id);

        // Update state with jobId
        setState((prev) => ({
          ...prev,
          jobId: resolvedJobId,
          progress: {
            ...prev.progress,
            status: 'completed',
            percentage: 100,
          },
        }));

        return { success: true, jobId: resolvedJobId };
      } catch (error: any) {
        console.error('Upload error:', error);

        setState((prev) => ({
          ...prev,
          progress: {
            ...prev.progress,
            status: 'failed',
            error: error.message,
          },
        }));

        return {
          success: false,
          error: error.message,
          code: error.code,
          details: error.details,
        };
      }
    },
    [uploadChunksInParallel, clearSessionStorage, resolveJobIdFromSession]
  );

  /**
   * Pause upload
   */
  const pause = useCallback(() => {
    console.log('Pausing upload...');
    isPausedRef.current = true; // Bug fix #14: Update ref for stable flag checking
    setState((prev) => ({ ...prev, isPaused: true }));
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
  }, []);

  /**
   * Resume upload
   */
  const resume = useCallback(async (): Promise<{
    success: boolean;
    jobId?: string;
    error?: string;
  }> => {
    if (!state.sessionId || !state.file) {
      throw new Error('No active upload session to resume');
    }

    console.log('Resuming upload...');

    // Get session status to find missing chunks
    const statusResponse = await apiClient.get(`/api/v1/uploads/${state.sessionId}`);

    if (!statusResponse.data.success) {
      throw new Error(statusResponse.data.error || 'Failed to get upload status');
    }

    const session: UploadSession = statusResponse.data.session;

    console.log(
      `📋 Resume upload: ${session.chunksUploaded.length}/${session.totalChunks} chunks already uploaded`
    );

    isPausedRef.current = false; // Bug fix #14: Update ref for stable flag checking
    setState((prev) => ({
      ...prev,
      isPaused: false,
      uploadedChunks: new Set(session.chunksUploaded),
      progress: {
        ...prev.progress,
        status: 'uploading',
        chunksUploaded: session.chunksUploaded.length,
      },
    }));

    // Resume uploading missing chunks
    const resumedJobId = await uploadChunksInParallel(
      state.sessionId,
      state.file,
      session.missingChunks,
      session.totalChunks,
      session.chunksUploaded
    );

    if (isCanceledRef.current) {
      return { success: false, error: 'Upload canceled by user' };
    }

    if (isPausedRef.current) {
      return { success: false, error: 'Upload paused by user' };
    }

    const resolvedJobId =
      resumedJobId || (await resolveJobIdFromSession(state.sessionId)) || state.jobId;
    clearSessionStorage(state.sessionId);

    setState((prev) => ({
      ...prev,
      jobId: resolvedJobId,
      progress: {
        ...prev.progress,
        status: 'completed',
        percentage: 100,
      },
    }));

    return { success: true, jobId: resolvedJobId };
  }, [
    state.sessionId,
    state.file,
    state.jobId,
    uploadChunksInParallel,
    resolveJobIdFromSession,
    clearSessionStorage,
  ]);

  /**
   * Cancel upload
   */
  const cancel = useCallback(async () => {
    if (!state.sessionId) return;

    console.log('Canceling upload...');

    isCanceledRef.current = true; // Bug fix #14: Update ref for stable flag checking
    setState((prev) => ({ ...prev, isCanceled: true }));

    // Abort all active uploads
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();

    // Delete session on server
    try {
      await apiClient.delete(`/api/v1/uploads/${state.sessionId}`);
      clearSessionStorage(state.sessionId);
    } catch (error) {
      console.error('Failed to cancel upload session:', error);
    }

    setState((prev) => ({
      ...prev,
      progress: {
        ...prev.progress,
        status: 'canceled',
      },
    }));
  }, [state.sessionId, clearSessionStorage]);

  return {
    upload,
    pause,
    resume,
    cancel,
    progress: state.progress,
    sessionId: state.sessionId,
    jobId: state.jobId,
    isPaused: state.isPaused,
    isCanceled: state.isCanceled,
  };
}
