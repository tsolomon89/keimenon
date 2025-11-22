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
import { apiClient } from '../lib/api-client';
import { API_BASE_URL } from '../lib/env.config';

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
  status: 'idle' | 'uploading' | 'paused' | 'completed' | 'failed' | 'canceled';
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

  // ============================================================================
  // LocalStorage Persistence
  // ============================================================================

  /**
   * Save session state to localStorage for resume capability
   */
  const saveSessionToStorage = useCallback((sessionId: string, file: File, uploadedChunks: Set<number>) => {
    const storageKey = `${STORAGE_KEY_PREFIX}${sessionId}`;
    const sessionData = {
      sessionId,
      fileName: file.name,
      fileSize: file.size,
      uploadedChunks: Array.from(uploadedChunks),
      timestamp: Date.now(),
    };
    localStorage.setItem(storageKey, JSON.stringify(sessionData));
  }, []);

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
  const uploadChunk = useCallback(
    async (
      sessionId: string,
      file: File,
      chunkIndex: number,
      retryCount = 0
    ): Promise<boolean> => {
      try {
        // Check if canceled or paused
        if (state.isCanceled || state.isPaused) {
          return false;
        }

        // Read chunk data
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkData = file.slice(start, end);

        // Create abort controller for this chunk
        const abortController = new AbortController();
        abortControllersRef.current.set(chunkIndex, abortController);

        // Upload chunk using raw fetch (to support AbortController)
        const response = await fetch(
          `${API_BASE_URL}/api/v1/uploads/${sessionId}/chunks/${chunkIndex}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
            },
            body: chunkData,
            signal: abortController.signal,
          }
        );

        // Clean up abort controller
        abortControllersRef.current.delete(chunkIndex);

        if (response.ok) {
          const result = await response.json();
          return result.success === true;
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Chunk upload failed');
        }
      } catch (error: any) {
        // Handle abort (pause/cancel)
        if (error.name === 'AbortError') {
          return false;
        }

        // Retry logic
        if (retryCount < RETRY_ATTEMPTS) {
          console.log(`Retrying chunk ${chunkIndex} (attempt ${retryCount + 1}/${RETRY_ATTEMPTS})...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));
          return uploadChunk(sessionId, file, chunkIndex, retryCount + 1);
        }

        // Max retries exceeded
        throw new Error(`Failed to upload chunk ${chunkIndex} after ${RETRY_ATTEMPTS} attempts: ${error.message}`);
      }
    },
    [state.isCanceled, state.isPaused]
  );

  /**
   * Upload chunks with concurrency control
   */
  const uploadChunksInParallel = useCallback(
    async (sessionId: string, file: File, missingChunks: number[], totalChunks: number) => {
      const startTime = Date.now();
      let completedChunks = 0;
      const uploadedChunks = new Set(state.uploadedChunks);

      // Process chunks in parallel with concurrency limit
      const chunks = [...missingChunks];
      const activeUploads: Promise<void>[] = [];

      while (chunks.length > 0 || activeUploads.length > 0) {
        // Check if paused or canceled
        if (state.isPaused || state.isCanceled) {
          // Abort all active uploads
          abortControllersRef.current.forEach((controller) => controller.abort());
          abortControllersRef.current.clear();
          return;
        }

        // Fill up to MAX_CONCURRENT_UPLOADS
        while (activeUploads.length < MAX_CONCURRENT_UPLOADS && chunks.length > 0) {
          const chunkIndex = chunks.shift()!;

          const uploadPromise = uploadChunk(sessionId, file, chunkIndex).then((success) => {
            if (success) {
              uploadedChunks.add(chunkIndex);
              completedChunks++;

              // Calculate progress
              const bytesUploaded = uploadedChunks.size * CHUNK_SIZE;
              const percentage = Math.round((uploadedChunks.size / totalChunks) * 100);
              const elapsed = (Date.now() - startTime) / 1000; // seconds
              const uploadSpeed = bytesUploaded / elapsed;
              const bytesRemaining = file.size - bytesUploaded;
              const estimatedTimeRemaining = Math.round(bytesRemaining / uploadSpeed);

              // Update progress
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

              // Save to localStorage for resume
              saveSessionToStorage(sessionId, file, uploadedChunks);
            }
          });

          activeUploads.push(uploadPromise);
        }

        // Wait for at least one upload to complete
        if (activeUploads.length > 0) {
          await Promise.race(activeUploads);
          // Remove completed uploads
          activeUploads.splice(
            0,
            activeUploads.length,
            ...activeUploads.filter((p) => {
              let resolved = false;
              p.then(() => { resolved = true; });
              return !resolved;
            })
          );
        }
      }
    },
    [state.isPaused, state.isCanceled, state.uploadedChunks, uploadChunk, saveSessionToStorage]
  );

  /**
   * Main upload function
   *
   * @param file - File to upload
   * @param importConfig - Optional import configuration (for chat imports)
   */
  const upload = useCallback(
    async (file: File, importConfig?: any): Promise<{ success: boolean; jobId?: string; error?: string }> => {
      try {
        console.log(`📤 Starting chunked upload: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

        // Reset state
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
            status: 'uploading',
          },
          isPaused: false,
          isCanceled: false,
          uploadedChunks: new Set(),
          startTime: Date.now(),
          bytesUploadedAtStart: 0,
        });

        // Step 1: Initiate upload session
        const initResponse = await apiClient.post('/uploads/initiate', {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/json',
          chunkSize: CHUNK_SIZE,
          importConfig: importConfig, // Pass import config to be stored in session metadata
        });

        if (!initResponse.data.success) {
          throw new Error(initResponse.data.error || 'Failed to initiate upload');
        }

        const session: UploadSession = initResponse.data.session;
        const { jobId } = initResponse.data;

        console.log(`✅ Upload session created: ${session.id}`);
        console.log(`   Total chunks: ${session.totalChunks}`);
        console.log(`   Job ID: ${jobId}`);

        setState((prev) => ({
          ...prev,
          sessionId: session.id,
          jobId,
        }));

        // Step 2: Upload missing chunks
        const missingChunks = Array.from({ length: session.totalChunks }, (_, i) => i);
        await uploadChunksInParallel(session.id, file, missingChunks, session.totalChunks);

        // Check if canceled or paused
        if (state.isCanceled) {
          console.log('Upload canceled by user');
          return { success: false, error: 'Upload canceled by user' };
        }

        if (state.isPaused) {
          console.log('Upload paused by user');
          return { success: false, error: 'Upload paused by user' };
        }

        // Step 3: Upload complete
        console.log(`✅ Upload complete: ${file.name}`);

        // Clear localStorage
        clearSessionStorage(session.id);

        // Update state
        setState((prev) => ({
          ...prev,
          progress: {
            ...prev.progress,
            status: 'completed',
            percentage: 100,
          },
        }));

        return { success: true, jobId };
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

        return { success: false, error: error.message };
      }
    },
    [uploadChunksInParallel, clearSessionStorage, state.isCanceled, state.isPaused]
  );

  /**
   * Pause upload
   */
  const pause = useCallback(() => {
    console.log('Pausing upload...');
    setState((prev) => ({ ...prev, isPaused: true }));
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
  }, []);

  /**
   * Resume upload
   */
  const resume = useCallback(async () => {
    if (!state.sessionId || !state.file) {
      throw new Error('No active upload session to resume');
    }

    console.log('Resuming upload...');

    // Get session status to find missing chunks
    const statusResponse = await apiClient.get(`/uploads/${state.sessionId}`);

    if (!statusResponse.data.success) {
      throw new Error(statusResponse.data.error || 'Failed to get upload status');
    }

    const session: UploadSession = statusResponse.data.session;

    console.log(`📋 Resume upload: ${session.chunksUploaded.length}/${session.totalChunks} chunks already uploaded`);

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
    await uploadChunksInParallel(state.sessionId, state.file, session.missingChunks, session.totalChunks);
  }, [state.sessionId, state.file, uploadChunksInParallel]);

  /**
   * Cancel upload
   */
  const cancel = useCallback(async () => {
    if (!state.sessionId) return;

    console.log('Canceling upload...');

    setState((prev) => ({ ...prev, isCanceled: true }));

    // Abort all active uploads
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();

    // Delete session on server
    try {
      await apiClient.delete(`/uploads/${state.sessionId}`);
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
