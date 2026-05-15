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
import { API_BASE_URL } from '@/lib/env.config';
import type { ImportJobStage } from '@keimenon/types';

export interface JobUpdate {
  jobId: string;
  type: 'import' | 'delete' | 'export' | 'analyze';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'blocked' | 'deleted';
  progress: {
    current: number;
    total: number;
    percent: number;
    message?: string;
    stage?: ImportJobStage | string;
    metadata?: Record<string, unknown>;
  };
  error?: {
    code: string;
    message: string;
    stack?: string;
    details?: Record<string, unknown>;
  };
  stats?: {
    nodesCreated?: number;
    nodesDeleted?: number;
    edgesCreated?: number;
    edgesDeleted?: number;
    sourcesCreated?: number;
    conversationsProcessed?: number;
    messagesProcessed?: number;
    manualGroups?: number;
    autoGroups?: number;
    spansCreated?: number;
    packetsCreated?: number;
    atomicUnitsCreated?: number;
    packetMassLinksCreated?: number;
  };
  config?: {
    fileName?: string; // Extracted from job config for display
    deleteScope?: string; // Extracted from delete job config
  };
  blockedReason?: string;
  blockedReasonCode?: string;
  recoverableAfterRestart?: boolean;
  interruptedReason?: string;
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

export interface UseJobStreamOptions {
  /** Callback when an import job completes successfully */
  onImportComplete?: (jobId: string) => void;
}

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
export function useJobStream(options?: UseJobStreamOptions): UseJobStreamResult {
  const [jobs, setJobs] = useState<Map<string, JobUpdate>>(new Map());
  const [graphUpdates, setGraphUpdates] = useState<GraphUpdate[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const activeConnectionIdRef = useRef(0);
  const exhaustedRetriesReportedRef = useRef(false);
  const mountedRef = useRef(true);
  // Track which jobs we've already fired completion callbacks for
  const completedJobsRef = useRef<Set<string>>(new Set());
  // Track locally deleted jobs to prevent "zombie" resurrections from SSE/API race conditions
  const deletedJobIdsRef = useRef<Set<string>>(new Set());

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
          eventSourceRef.current = null;
        }

        // Create new EventSource
        // Note: EventSource doesn't support custom headers, so we pass token as query param
        const url = new URL(`${API_BASE_URL}/api/v1/stream/jobs`);
        url.searchParams.set('token', token);

        // Pass the test DB path as a query param if it exists (for E2E tests)
        if (typeof window !== 'undefined' && (window as any).__TEST_DB_PATH__) {
          url.searchParams.set('x-test-db-path', (window as any).__TEST_DB_PATH__);
        }

        const connectionId = ++activeConnectionIdRef.current;

        // PERFORMANCE FIX: Removed blocking health check that delayed SSE connection by up to 15 seconds
        // EventSource handles reconnection natively - error handlers below manage failures
        // Connection status is visible via 'connected' and 'reconnecting' state

        const eventSource = new EventSource(url.toString());

        // Store reference
        eventSourceRef.current = eventSource;

        // Handle connection open
        eventSource.addEventListener('open', () => {
          if (connectionId !== activeConnectionIdRef.current) return;
          errorCapture.info('Job stream connected', {
            domain: 'jobs',
            operation: 'jobStream.open',
          });
          if (!mountedRef.current) return;

          setConnected(true);
          setReconnecting(false);
          setError(null);
          reconnectAttempts.current = 0;
          exhaustedRetriesReportedRef.current = false;
          if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
          }
        });

        // Handle connection event
        // Handshake confirmation - debug logging removed to reduce noise
        eventSource.addEventListener('connected', (event) => {
          // Connection confirmed - state already updated in 'open' handler
        });

        // Handle jobs.update event
        eventSource.addEventListener('jobs.update', (event) => {
          if (connectionId !== activeConnectionIdRef.current) return;
          if (!mountedRef.current) return;

          try {
            const data = JSON.parse(event.data);
            const updates: JobUpdate[] = data.jobs || [];

            // Filter out locally deleted jobs (Zombies)
            const validUpdates = updates.filter((u) => {
              if (deletedJobIdsRef.current.has(u.jobId)) {
                console.log(
                  `[useJobStream] 🧟‍♂️ Blocking zombie job update for ${u.jobId} (locally deleted)`
                );
                return false;
              }
              return true;
            });

            if (validUpdates.length !== updates.length) {
              console.log(
                `[useJobStream] Filtered ${updates.length - validUpdates.length} zombie updates`
              );
            }

            console.log(
              `[useJobStream] jobs.update event received with ${validUpdates.length} valid updates`
            );
            validUpdates.forEach((u) => {
              if (u.status === 'deleted') {
                console.log(`[useJobStream] ⚠️ Found deletion update in batch: ${u.jobId}`);
              }
            });

            setJobs((prevJobs) => {
              const newJobs = new Map(prevJobs);
              const now = Date.now();

              // Update jobs, but filter out completed jobs older than 30 seconds
              for (const update of validUpdates) {
                // Handle deleted jobs - remove them immediately from UI
                if (update.status === 'deleted') {
                  console.log(
                    `[useJobStream] 🗑️ Deletion event received for job ${update.jobId}, removing from UI`
                  );
                  newJobs.delete(update.jobId);
                  // Also add to blacklist just in case
                  deletedJobIdsRef.current.add(update.jobId);
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

                // Fire onImportComplete callback for newly completed import jobs
                if (
                  update.type === 'import' &&
                  update.status === 'succeeded' &&
                  options?.onImportComplete &&
                  !completedJobsRef.current.has(update.jobId)
                ) {
                  completedJobsRef.current.add(update.jobId);
                  // Defer callback to avoid state update during render
                  setTimeout(() => {
                    options.onImportComplete?.(update.jobId);
                  }, 0);
                }
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
          if (connectionId !== activeConnectionIdRef.current) return;
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
          if (connectionId !== activeConnectionIdRef.current) return;
          // Silently acknowledge heartbeat - connection status tracked via 'connected' state
        });

        // Handle errors
        eventSource.addEventListener('error', (event) => {
          if (connectionId !== activeConnectionIdRef.current) return;
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

          // Ensure we do not run EventSource native reconnection in parallel with our own backoff.
          if (eventSourceRef.current === eventSource) {
            eventSource.close();
            eventSourceRef.current = null;
          }

          // Attempt reconnection with exponential backoff
          if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
            setReconnecting(true);
            if (reconnectTimer.current) {
              return;
            }
            reconnectAttempts.current++;

            const delay = RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts.current - 1);

            // Reconnection scheduled - user sees 'reconnecting' state in UI
            // Debug logging removed to reduce noise

            reconnectTimer.current = setTimeout(() => {
              reconnectTimer.current = null;
              if (mountedRef.current) {
                connect();
              }
            }, delay);
          } else {
            const finalError = `Failed to establish job stream connection after ${MAX_RECONNECT_ATTEMPTS} attempts. ${detailedMessage} Please refresh the page or check your network connection.`;
            setError(finalError);
            setReconnecting(false);

            if (!exhaustedRetriesReportedRef.current) {
              exhaustedRetriesReportedRef.current = true;
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
        setReconnecting(false);
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

    // Add to blacklist to prevent resurrection
    jobIds.forEach((id) => deletedJobIdsRef.current.add(id));

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
