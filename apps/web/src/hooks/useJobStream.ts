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

import { useState, useEffect, useRef } from 'react';
import { getToken } from '@/contexts/AuthContext';
import { errorCapture } from '@/services/error-capture.service';

export interface JobUpdate {
  jobId: string;
  type: 'import' | 'delete' | 'export' | 'analyze';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'blocked';
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
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

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
    const connect = () => {
      const token = getToken();
      if (!token) {
        setError('Authentication required');
        setConnected(false);
        return;
      }

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
        eventSource.addEventListener('connected', (event) => {
          if (process.env.NODE_ENV === 'development') {
            errorCapture.debug('Job stream handshake confirmed', {
              domain: 'jobs',
              operation: 'jobStream.connectedEvent',
              metadata: { data: event.data },
            });
          }
        });

        // Handle jobs.update event
        eventSource.addEventListener('jobs.update', (event) => {
          if (!mountedRef.current) return;

          try {
            const data = JSON.parse(event.data);
            const updates: JobUpdate[] = data.jobs || [];

            setJobs((prevJobs) => {
              const newJobs = new Map(prevJobs);

              // Update jobs
              for (const update of updates) {
                newJobs.set(update.jobId, update);
              }

              return newJobs;
            });

            if (process.env.NODE_ENV === 'development' && updates.length > 0) {
              errorCapture.debug('Processed job updates', {
                domain: 'jobs',
                operation: 'jobStream.jobsUpdate',
                metadata: { updateCount: updates.length },
              });
            }
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
        eventSource.addEventListener('heartbeat', () => {
          if (process.env.NODE_ENV === 'development') {
            errorCapture.debug('Job stream heartbeat received', {
              domain: 'jobs',
              operation: 'jobStream.heartbeat',
            });
          }
        });

        // Handle errors
        eventSource.addEventListener('error', (event) => {
          errorCapture.warn('Job stream encountered an error event', {
            domain: 'jobs',
            operation: 'jobStream.errorEvent',
            metadata: {
              readyState: eventSource.readyState,
              type: event.type,
            },
          });

          if (!mountedRef.current) return;

          setConnected(false);

          // Attempt reconnection with exponential backoff
          if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
            setReconnecting(true);
            reconnectAttempts.current++;

            const delay = RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts.current - 1);
            if (process.env.NODE_ENV === 'development') {
              errorCapture.debug('Job stream reconnection scheduled', {
                domain: 'jobs',
                operation: 'jobStream.reconnectScheduled',
                metadata: {
                  delayMs: delay,
                  attempt: reconnectAttempts.current,
                  maxAttempts: MAX_RECONNECT_ATTEMPTS,
                },
              });
            }

            reconnectTimer.current = setTimeout(() => {
              if (mountedRef.current) {
                connect();
              }
            }, delay);
          } else {
            setError('Failed to connect to job stream. Please refresh the page.');
            setReconnecting(false);
          }
        });
      } catch (err: any) {
        const error = err instanceof Error ? err : new Error(String(err));
        errorCapture.capture(error, {
          domain: 'jobs',
          operation: 'jobStream.connectionError',
        });
        setError(error.message || 'Failed to connect');
        setConnected(false);
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

  return {
    jobs,
    graphUpdates,
    connected,
    error,
    reconnecting,
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
