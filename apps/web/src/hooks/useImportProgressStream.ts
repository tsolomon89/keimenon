import { useEffect, useRef, useState, useCallback } from 'react';
import { getAuthToken } from '../lib/api-client';

/**
 * Import progress stages matching backend
 */
export type ImportStage =
  | 'queued'
  | 'reading'
  | 'parsing'
  | 'normalizing'
  | 'indexing'
  | 'linking'
  | 'done'
  | 'error';

/**
 * Progress event from SSE stream
 */
export interface ImportProgressEvent {
  uploadId: string;
  stage: ImportStage;
  progress: number; // 0-100
  message: string;
  detail: string;
  stats: {
    nodesCreated: number;
    edgesCreated: number;
    sourcesCreated: number;
    conversationsProcessed: number;
    messagesProcessed: number;
  };
  recentNodes?: Array<{
    id: string;
    kind: string;
    label: string;
  }>;
  error?: string;
  timestamp: number;
}

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Hook return type
 */
export interface UseImportProgressStreamResult {
  progress: ImportProgressEvent | null;
  connectionState: ConnectionState;
  error: string | null;
  reconnect: () => void;
  disconnect: () => void;
}

/**
 * Custom hook for consuming SSE import progress stream
 *
 * Features:
 * - Real-time progress updates via Server-Sent Events (SSE)
 * - Automatic reconnection on connection loss (with backoff)
 * - Polling fallback if SSE fails after max retries
 * - Graceful cleanup on unmount
 *
 * @param uploadId - The upload ID to stream progress for
 * @param options - Configuration options
 */
export function useImportProgressStream(
  uploadId: string | null,
  options: {
    enabled?: boolean;
    onComplete?: (event: ImportProgressEvent) => void;
    onError?: (error: string) => void;
    maxRetries?: number;
    retryDelay?: number;
    pollingInterval?: number;
  } = {}
): UseImportProgressStreamResult {
  const {
    enabled = true,
    onComplete,
    onError,
    maxRetries = 3,
    retryDelay = 2000,
    pollingInterval = 2000,
  } = options;

  const [progress, setProgress] = useState<ImportProgressEvent | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  /**
   * Fetch progress via HTTP polling (fallback)
   */
  const pollProgress = useCallback(async () => {
    if (!uploadId) return;

    try {
      const token = getAuthToken();
      const response = await fetch(`/api/v1/import/progress/${uploadId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.progress) {
        setProgress(data.progress);
        setConnectionState('connected');
        setError(null);

        // Stop polling if done or error
        if (data.progress.stage === 'done' || data.progress.stage === 'error') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          if (data.progress.stage === 'done' && onComplete) {
            onComplete(data.progress);
          } else if (data.progress.stage === 'error' && onError) {
            onError(data.progress.error || 'Import failed');
          }
        }
      }
    } catch (err: any) {
      console.warn('[Import Progress] Polling error:', err.message);
      setError(err.message);
      setConnectionState('error');
    }
  }, [uploadId, onComplete, onError]);

  /**
   * Start HTTP polling as fallback
   */
  const startPolling = useCallback(() => {
    if (!uploadId || isPollingRef.current) return;

    console.log('[Import Progress] Starting HTTP polling fallback');
    isPollingRef.current = true;
    setConnectionState('connecting');

    // Poll immediately
    pollProgress();

    // Then poll at interval
    pollingIntervalRef.current = setInterval(pollProgress, pollingInterval);
  }, [uploadId, pollingInterval, pollProgress]);

  /**
   * Stop HTTP polling
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    isPollingRef.current = false;
  }, []);

  /**
   * Connect to SSE stream
   */
  const connect = useCallback(() => {
    if (!uploadId || !enabled) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnectionState('connecting');
    setError(null);

    try {
      const token = getAuthToken();
      const url = `/api/v1/import/progress/stream/${uploadId}?token=${encodeURIComponent(token)}`;

      console.log('[Import Progress] Connecting to SSE:', url);
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[Import Progress] SSE connection opened');
        setConnectionState('connected');
        setError(null);
        retryCountRef.current = 0; // Reset retry count on successful connection
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle connection acknowledgment
          if (data.type === 'connected') {
            console.log('[Import Progress] SSE connection acknowledged');
            return;
          }

          // Handle progress event
          if (data.uploadId && data.stage) {
            console.log('[Import Progress] Progress update:', data.stage, `${data.progress}%`);
            setProgress(data);

            // Handle completion
            if (data.stage === 'done' && onComplete) {
              onComplete(data);
              eventSource.close();
            }

            // Handle error
            if (data.stage === 'error') {
              const errorMsg = data.error || 'Import failed';
              setError(errorMsg);
              if (onError) {
                onError(errorMsg);
              }
              eventSource.close();
            }
          }
        } catch (err: any) {
          console.error('[Import Progress] Failed to parse SSE message:', err);
        }
      };

      eventSource.onerror = (event) => {
        console.error('[Import Progress] SSE error:', event);
        eventSource.close();
        eventSourceRef.current = null;
        setConnectionState('error');

        // Retry with exponential backoff
        retryCountRef.current++;
        if (retryCountRef.current <= maxRetries) {
          const delay = retryDelay * Math.pow(2, retryCountRef.current - 1);
          console.log(
            `[Import Progress] Retrying SSE connection in ${delay}ms (attempt ${retryCountRef.current}/${maxRetries})`
          );

          setTimeout(() => {
            connect();
          }, delay);
        } else {
          // Max retries exceeded, fall back to polling
          console.warn('[Import Progress] Max SSE retries exceeded, falling back to HTTP polling');
          setError('Connection lost, using polling fallback');
          startPolling();
        }
      };
    } catch (err: any) {
      console.error('[Import Progress] Failed to create EventSource:', err);
      setConnectionState('error');
      setError(err.message);

      // Fall back to polling immediately if SSE setup fails
      startPolling();
    }
  }, [uploadId, enabled, onComplete, onError, maxRetries, retryDelay, startPolling]);

  /**
   * Disconnect from SSE stream
   */
  const disconnect = useCallback(() => {
    console.log('[Import Progress] Disconnecting');

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    stopPolling();

    setConnectionState('disconnected');
    retryCountRef.current = 0;
  }, [stopPolling]);

  /**
   * Reconnect (manual trigger)
   */
  const reconnect = useCallback(() => {
    console.log('[Import Progress] Manual reconnect triggered');
    disconnect();
    retryCountRef.current = 0;
    connect();
  }, [connect, disconnect]);

  // Auto-connect when uploadId changes
  useEffect(() => {
    if (uploadId && enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [uploadId, enabled, connect, disconnect]);

  return {
    progress,
    connectionState,
    error,
    reconnect,
    disconnect,
  };
}
