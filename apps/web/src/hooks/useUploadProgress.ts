/**
 * useUploadProgress Hook
 *
 * React hook for consuming Server-Sent Events (SSE) upload progress streams.
 * Provides real-time progress updates as chunks are uploaded.
 *
 * Features:
 * - Auto-connects to SSE stream when session ID is provided
 * - Real-time progress updates
 * - Automatic reconnection on disconnect
 * - Cleanup on unmount
 *
 * Usage:
 * ```tsx
 * const { progress, isConnected, error } = useUploadProgress(sessionId);
 * ```
 *
 * Related: Chunked Upload System - Phase 5 (SSE Integration)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../lib/env.config';

export interface UploadProgressEvent {
  type: 'progress' | 'completed' | 'failed' | 'expired';
  sessionId: string;
  chunkIndex?: number;
  chunksReceived: number;
  totalChunks: number;
  progress: number; // 0-100 percentage
  status: string;
  errorMessage?: string;
  timestamp: number;
}

export interface UploadProgressState {
  progress: number; // 0-100 percentage
  chunksReceived: number;
  totalChunks: number;
  status: string;
  lastChunkIndex?: number;
  error?: string;
  lastUpdate: number;
}

/**
 * Hook for consuming SSE upload progress
 */
export function useUploadProgress(sessionId: string | null | undefined) {
  const [progressState, setProgressState] = useState<UploadProgressState>({
    progress: 0,
    chunksReceived: 0,
    totalChunks: 0,
    status: 'idle',
    lastUpdate: Date.now(),
  });

  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY_MS = 2000;

  /**
   * Connect to SSE stream
   */
  const connect = useCallback(() => {
    if (!sessionId) {
      return;
    }

    console.log(`📡 Connecting to upload progress stream: ${sessionId}`);

    try {
      // Create EventSource connection
      const url = `${API_BASE_URL}/api/v1/uploads/${sessionId}/progress`;
      const eventSource = new EventSource(url);

      eventSourceRef.current = eventSource;

      // Handle connection open
      eventSource.onopen = () => {
        console.log(`✅ SSE connected: ${sessionId}`);
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttemptsRef.current = 0;
      };

      // Handle progress events
      eventSource.onmessage = (event) => {
        try {
          const progressEvent: UploadProgressEvent = JSON.parse(event.data);

          console.log(`📊 Progress update: ${progressEvent.progress}% (${progressEvent.chunksReceived}/${progressEvent.totalChunks})`);

          setProgressState({
            progress: progressEvent.progress,
            chunksReceived: progressEvent.chunksReceived,
            totalChunks: progressEvent.totalChunks,
            status: progressEvent.status,
            lastChunkIndex: progressEvent.chunkIndex,
            error: progressEvent.errorMessage,
            lastUpdate: progressEvent.timestamp,
          });

          // Close connection on completion or failure
          if (
            progressEvent.type === 'completed' ||
            progressEvent.type === 'failed' ||
            progressEvent.type === 'expired'
          ) {
            console.log(`🔌 Closing SSE connection: ${progressEvent.type}`);
            disconnect();
          }
        } catch (error) {
          console.error('Failed to parse progress event:', error);
        }
      };

      // Handle connection errors
      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);

        setIsConnected(false);

        // Attempt to reconnect
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;

          console.log(
            `🔄 Reconnecting... (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            disconnect();
            connect();
          }, RECONNECT_DELAY_MS);
        } else {
          console.error('❌ Max reconnect attempts reached');
          setConnectionError('Failed to connect to upload progress stream');
          disconnect();
        }
      };
    } catch (error: any) {
      console.error('Failed to create SSE connection:', error);
      setConnectionError(error.message);
    }
  }, [sessionId]);

  /**
   * Disconnect from SSE stream
   */
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      console.log('🔌 Disconnecting from SSE stream');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setIsConnected(false);
  }, []);

  /**
   * Connect on mount or when sessionId changes
   */
  useEffect(() => {
    if (sessionId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [sessionId, connect, disconnect]);

  return {
    progress: progressState,
    isConnected,
    error: connectionError,
    reconnect: connect,
    disconnect,
  };
}

/**
 * Hook for polling-based progress (fallback for SSE unavailable)
 */
export function useUploadProgressPolling(
  sessionId: string | null | undefined,
  intervalMs: number = 2000
) {
  const [progressState, setProgressState] = useState<UploadProgressState>({
    progress: 0,
    chunksReceived: 0,
    totalChunks: 0,
    status: 'idle',
    lastUpdate: Date.now(),
  });

  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Fetch progress from API
   */
  const fetchProgress = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/uploads/${sessionId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch upload status');
      }

      const data = await response.json();

      if (data.success && data.session) {
        setProgressState({
          progress: data.session.progress,
          chunksReceived: data.session.chunksReceived,
          totalChunks: data.session.totalChunks,
          status: data.session.status,
          error: data.session.errorMessage,
          lastUpdate: Date.now(),
        });

        setError(null);

        // Stop polling if completed or failed
        if (
          data.session.status === 'completed' ||
          data.session.status === 'failed' ||
          data.session.status === 'expired'
        ) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch upload progress:', err);
      setError(err.message);
    }
  }, [sessionId]);

  /**
   * Start polling on mount or when sessionId changes
   */
  useEffect(() => {
    if (sessionId) {
      // Fetch immediately
      fetchProgress();

      // Then poll at interval
      intervalRef.current = setInterval(fetchProgress, intervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, fetchProgress, intervalMs]);

  return {
    progress: progressState,
    error,
    refresh: fetchProgress,
  };
}
