/**
 * useJobStream Hook
 *
 * React hook to subscribe to real-time job updates via Server-Sent Events (SSE).
 *
 * Features:
 * - Auto-connect on mount
 * - Auto-reconnect on disconnect
 * - Handles authentication
 * - Provides connection status
 * - Coalesced updates (~2Hz from server)
 *
 * Usage:
 * ```tsx
 * const { jobs, connected, error } = useJobStream();
 * ```
 *
 * Related: Product Directive - "UI only subscribes to job state"
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getToken } from '@/contexts/AuthContext';
import { errorCapture } from '@/services/error-capture.service';

export interface JobUpdate {
  jobId: string;
  type: 'import' | 'delete' | 'export' | 'analyze';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'blocked' | 'deleted';
  progress: {
    current: number;
    total: number;
    percent: number;
    message?: string;
  };
  config?: {
    fileName?: string; // Extracted from job config for display
    deleteScope?: string; // Extracted from delete job config
  };
  timestamp: number;
}

export interface GraphUpdate {
  nodesAdded: number;
  edgesAdded: number;
  queueStats: {
    nodesQueued: number;
    edgesQueued: number;
    nodesFlushed: number;
    edgesFlushed: number;
  };
  timestamp: number;
  recentNodes?: Array<{
    id: string;
    kind: string;
    label?: string;
  }>;
}

export interface UseJobStreamResult {
  jobs: Map<string, JobUpdate>;
  graphUpdates: GraphUpdate[];
  connected: boolean;
  error: string | null;
  reconnecting: boolean;
  removeJobs: (jobIds: string[]) => void;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Get user-friendly error message based on HTTP status code
 */
function getHttpErrorMessage(status: number, context: string): string {
  switch (status) {
    case 401:
      return `Authentication failed during ${context}. Please log in again.`;
    case 403:
      return `Access denied during ${context}. You don't have permission to access job streams.`;
    case 404:
      return `Job stream endpoint not found during ${context}. The server may not be configured correctly.`;
    case 500:
    case 502:
    case 503:
      return `Server error during ${context}. The server may be down or overloaded.`;
    case 504:
      return `Gateway timeout during ${context}. The server took too long to respond.`;
    default:
      return `HTTP ${status} error during ${context}. Please try again.`;
  }
}

/**
 * Get detailed error message from EventSource error event
 */
function getEventSourceErrorMessage(readyState: number, context: string, attempt: number): string {
  const attemptInfo = attempt > 0 ? ` (attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS})` : '';

  switch (readyState) {
    case 0: // CONNECTING
      return `Connection attempt failed during ${context}${attemptInfo}. The server may be unreachable.`;
    case 1: // OPEN
      return `Active connection encountered an error during ${context}${attemptInfo}. The connection will be reestablished.`;
    case 2: // CLOSED
      return `Connection closed unexpectedly during ${context}${attemptInfo}. This may be due to network issues, server restart, or authentication timeout.`;
    default:
      return `Unknown connection state (${readyState}) during ${context}${attemptInfo}.`;
  }
}

/**
 * Hook to subscribe to job updates via SSE
 */
export function useJobStream(): UseJobStreamResult {
  const [jobs, setJobs] = useState<Map<string, JobUpdate>>(new Map());
  const [graphUpdates, setGraphUpdates] = useState<GraphUpdate[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Connect to SSE stream
    const connect = async () => {
      const token = getToken();
      if (!token) {
        setError('Authentication required');
        setConnected(false);
        return;
      }

      const connectionContext =
        reconnectAttempts.current > 0 ? 'reconnection' : 'initial connection';
      const urlForLogging = `${API_BASE_URL}/api/v1/stream/jobs?token=***`;

      try {
        // Close existing connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        // Create new EventSource
        // Note: EventSource doesn't support custom headers
        // We'll use a workaround with fetch + ReadableStream for now
        // Or pass token as query param
        const url = new URL(`${API_BASE_URL}/api/v1/stream/jobs`);
        url.searchParams.set('token', token);

        // Pre-flight check: Test server accessibility with /health endpoint
        // We can't use the SSE endpoint for pre-flight because it's a streaming connection
        try {
          const healthUrl = `${API_BASE_URL}/health`;
          const controller = new AbortController();
          const healthTimeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout (allows for multiple parallel checks)

          const preflightResponse = await fetch(healthUrl, {
            method: 'GET',
            signal: controller.signal,
          });

          clearTimeout(healthTimeout);

          if (!preflightResponse.ok) {
            throw new Error(
              `Server health check failed (HTTP ${preflightResponse.status}). The API server may be down.`
            );
          }

          // Server is healthy, continue with SSE connection
          // Health check debug logging removed to reduce console noise
        } catch (preflightError) {
          // If health check fails, provide clear error
          if (preflightError instanceof Error) {
            if (preflightError.name === 'AbortError') {
              throw new Error(
                `Server health check timed out during ${connectionContext}. The API server at ${API_BASE_URL} is not responding.`
              );
            }
            if (preflightError instanceof TypeError) {
              throw new Error(
                `Network error during ${connectionContext}: Unable to reach ${API_BASE_URL}. Check your connection and ensure the API server is running.`
              );
            }
          }
          throw preflightError;
        }

        // SSE connection attempt - debug logging removed to reduce noise
        // Connection status visible via 'connected' and 'reconnecting' state

        const eventSource = new EventSource(url.toString());

        // Store reference
        eventSourceRef.current = eventSource;

        // Handle connection open
        eventSource.addEventListener('open', () => {
          errorCapture.info('Job stream connected', {
            domain: 'jobs',
            operation: 'jobStream.open',
          });
          if (!mountedRef.current) return;

          setConnected(true);
          setReconnecting(false);
          setError(null);
          reconnectAttempts.current = 0;
        });

        // Handle connection event
        // Handshake confirmation - debug logging removed to reduce noise
        eventSource.addEventListener('connected', (event) => {
          // Connection confirmed - state already updated in 'open' handler
        });

        // Handle jobs.update event
        eventSource.addEventListener('jobs.update', (event) => {
          if (!mountedRef.current) return;

          try {
            const data = JSON.parse(event.data);
            const updates: JobUpdate[] = data.jobs || [];
            console.log(`[useJobStream] jobs.update event received with ${updates.length} updates`);
            updates.forEach((u) => {
              if (u.status === 'deleted') {
                console.log(`[useJobStream] ⚠️ Found deletion update in batch: ${u.jobId}`);
              }
            });

            setJobs((prevJobs) => {
              const newJobs = new Map(prevJobs);
              const now = Date.now();

              // Update jobs, but filter out completed jobs older than 30 seconds
              for (const update of updates) {
                // Handle deleted jobs - remove them immediately from UI
                if (update.status === 'deleted') {
                  console.log(
                    `[useJobStream] 🗑️ Deletion event received for job ${update.jobId}, removing from UI`
                  );
                  newJobs.delete(update.jobId);
                  console.log(
                    `[useJobStream] Jobs map size before: ${prevJobs.size}, after: ${newJobs.size}`
                  );
                  continue;
                }

                const isCompleted = update.status === 'succeeded' || update.status === 'failed';
                const jobAge = now - update.timestamp;

                // Skip adding/updating if job is completed and older than 30 seconds
                if (isCompleted && jobAge > 30000) {
                  // If it exists, remove it (cleanup)
                  newJobs.delete(update.jobId);
                  continue;
                }

                // Otherwise, add/update the job
                newJobs.set(update.jobId, update);
              }

              return newJobs;
            });

            // Job updates processed - debug logging removed to reduce noise
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            errorCapture.capture(
              error,
              {
                domain: 'jobs',
                operation: 'jobStream.jobsUpdateParseError',
              },
              'warn'
            );
          }
        });

        // Handle graph.update event
        eventSource.addEventListener('graph.update', (event) => {
          if (!mountedRef.current) return;

          try {
            const data = JSON.parse(event.data) as GraphUpdate;
            setGraphUpdates((prev) => {
              const next = [...prev, data];
              if (next.length > 25) {
                next.splice(0, next.length - 25);
              }
              return next;
            });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            errorCapture.capture(
              error,
              {
                domain: 'jobs',
                operation: 'jobStream.graphUpdateParseError',
              },
              'warn'
            );
          }
        });

        // Handle heartbeat event
        // Note: Heartbeat logging removed to reduce console noise
        // Heartbeats occur every ~5 seconds and provide minimal diagnostic value
        eventSource.addEventListener('heartbeat', () => {
          // Silently acknowledge heartbeat - connection status tracked via 'connected' state
        });

        // Handle errors
        eventSource.addEventListener('error', (event) => {
          const connectionContext = reconnectAttempts.current > 0 ? 'reconnection' : 'connection';
          const readyState = eventSource.readyState;
          const detailedMessage = getEventSourceErrorMessage(
            readyState,
            connectionContext,
            reconnectAttempts.current
          );

          // Log with enhanced diagnostics
          errorCapture.warn(detailedMessage, {
            domain: 'jobs',
            operation: 'jobStream.errorEvent',
            metadata: {
              readyState,
              readyStateLabel:
                readyState === 0 ? 'CONNECTING' : readyState === 1 ? 'OPEN' : 'CLOSED',
              eventType: event.type,
              url: urlForLogging,
              attempt: reconnectAttempts.current,
              maxAttempts: MAX_RECONNECT_ATTEMPTS,
              connectionContext,
            },
          });

          if (!mountedRef.current) return;

          setConnected(false);

          // Attempt reconnection with exponential backoff
          if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
            setReconnecting(true);
            reconnectAttempts.current++;

            const delay = RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts.current - 1);

            // Reconnection scheduled - user sees 'reconnecting' state in UI
            // Debug logging removed to reduce noise

            reconnectTimer.current = setTimeout(() => {
              if (mountedRef.current) {
                connect();
              }
            }, delay);
          } else {
            const finalError = `Failed to establish job stream connection after ${MAX_RECONNECT_ATTEMPTS} attempts. ${detailedMessage} Please refresh the page or check your network connection.`;
            setError(finalError);
            setReconnecting(false);

            errorCapture.error(finalError, {
              domain: 'jobs',
              operation: 'jobStream.exhaustedRetries',
              metadata: {
                attempts: reconnectAttempts.current,
                lastReadyState: readyState,
                url: urlForLogging,
              },
            });
          }
        });
      } catch (err: any) {
        const error = err instanceof Error ? err : new Error(String(err));
        const connectionContext =
          reconnectAttempts.current > 0 ? 'reconnection' : 'initial connection';

        errorCapture.capture(error, {
          domain: 'jobs',
          operation: 'jobStream.connectionError',
          metadata: {
            context: connectionContext,
            attempt: reconnectAttempts.current,
            url: urlForLogging,
            errorType: error.constructor.name,
          },
        });

        const userMessage = error.message || `Failed to connect during ${connectionContext}`;
        setError(userMessage);
        setConnected(false);

        // If pre-flight check failed, don't attempt reconnection (likely auth or server issue)
        // Only reconnect on EventSource errors
        if (reconnectAttempts.current > 0 && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          setReconnecting(true);
          const delay = RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts.current);

          // Reconnection after pre-flight failure - debug logging removed

          reconnectTimer.current = setTimeout(() => {
            if (mountedRef.current) {
              reconnectAttempts.current++;
              connect();
            }
          }, delay);
        } else if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
          setReconnecting(false);
          setError(`${userMessage} Maximum retry attempts reached.`);
        }
      }
    };

    // Initial connection
    connect();

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;

      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }

      if (eventSourceRef.current) {
        errorCapture.info('Job stream disconnecting', {
          domain: 'jobs',
          operation: 'jobStream.disconnect',
        });
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Remove jobs from local state (for optimistic UI updates after deletion)
  const removeJobs = useCallback((jobIds: string[]) => {
    if (jobIds.length === 0) return;

    console.log(`[useJobStream] Removing ${jobIds.length} jobs from local state:`, jobIds);

    setJobs((prev) => {
      const next = new Map(prev);
      let removed = 0;

      jobIds.forEach((jobId) => {
        if (next.delete(jobId)) {
          removed++;
        }
      });

      console.log(
        `[useJobStream] Successfully removed ${removed}/${jobIds.length} jobs. Map size: ${prev.size} → ${next.size}`
      );

      return removed > 0 ? next : prev;
    });
  }, []);

  return {
    jobs,
    graphUpdates,
    connected,
    error,
    reconnecting,
    removeJobs,
  };
}

/**
 * Hook to get a specific job by ID
 */
export function useJob(jobId: string): JobUpdate | null {
  const { jobs } = useJobStream();
  return jobs.get(jobId) || null;
}

/**
 * Hook to get jobs filtered by status
 */
export function useJobsByStatus(status: JobUpdate['status']): JobUpdate[] {
  const { jobs } = useJobStream();

  return Array.from(jobs.values()).filter((job) => job.status === status);
}

/**
 * Hook to get active jobs (queued or running)
 */
export function useActiveJobs(): JobUpdate[] {
  const { jobs } = useJobStream();

  return Array.from(jobs.values()).filter(
    (job) => job.status === 'queued' || job.status === 'running'
  );
}
