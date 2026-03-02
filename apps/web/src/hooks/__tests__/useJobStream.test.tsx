/**
 * Unit Tests for useJobStream Hook
 *
 * Tests SSE subscription behavior and job state management
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useJobStream } from '../useJobStream';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const jest = vi;

// Mock EventSource
class MockEventSource {
  url: string;
  listeners: Record<string, Array<(event: any) => void>> = {};
  readyState: number = 0; // 0: CONNECTING, 1: OPEN, 2: CLOSED
  static instances: MockEventSource[] = [];

  constructor(url: string, options?: any) {
    this.url = url;
    this.readyState = 1; // OPEN
    MockEventSource.instances.push(this);

    // Store globally for test access
    (global as any).lastEventSource = this;

    // Simulate connection
    setTimeout(() => {
      this.trigger('open', {});
    }, 0);
  }

  addEventListener(event: string, callback: (event: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  removeEventListener(event: string, callback: (event: any) => void) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
  }

  trigger(event: string, data: any) {
    const callbacks = this.listeners[event] || [];
    callbacks.forEach((cb) => {
      if (event === 'message' || event.startsWith('jobs.')) {
        // SSE message events have data property
        cb({ data: typeof data === 'string' ? data : JSON.stringify(data) });
      } else {
        cb(data);
      }
    });
  }

  close() {
    this.readyState = 2; // CLOSED
    this.trigger('close', {});
  }

  static resetInstances() {
    MockEventSource.instances = [];
  }
}

// Mock getToken
jest.mock('@/contexts/AuthContext', () => ({
  getToken: jest.fn(() => 'mock-token'),
}));

// Mock env config
jest.mock('@/lib/env.config', () => ({
  API_BASE_URL: 'http://localhost:3000',
}));

// Mock error capture
jest.mock('@/services/error-capture.service', () => ({
  errorCapture: {
    capture: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('useJobStream', () => {
  beforeEach(() => {
    // Install mock EventSource
    (global as any).EventSource = MockEventSource;
    MockEventSource.resetInstances();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('connects to SSE endpoint on mount', async () => {
    const { result } = renderHook(() => useJobStream());

    // Wait for connection
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect((global as any).lastEventSource).toBeDefined();
    expect((global as any).lastEventSource.url).toContain('/api/v1/stream/jobs');
    expect(result.current.connected).toBe(false); // Not connected until heartbeat
  });

  it('updates jobs Map when SSE sends jobs.update event', async () => {
    const { result } = renderHook(() => useJobStream());

    // Wait for hook to initialize
    act(() => {
      jest.advanceTimersByTime(100);
    });

    const eventSource = (global as any).lastEventSource as MockEventSource;

    // Simulate SSE event with job update
    act(() => {
      eventSource.trigger('jobs.update', {
        jobs: [
          {
            jobId: 'job_test_123',
            type: 'delete',
            status: 'succeeded',
            progress: { current: 100, total: 100, percent: 100 },
            timestamp: Date.now(),
          },
        ],
      });
    });

    // Verify jobs Map updated
    await waitFor(() => {
      expect(result.current.jobs.get('job_test_123')?.status).toBe('succeeded');
    });

    expect(result.current.jobs.get('job_test_123')?.type).toBe('delete');
    expect(result.current.jobs.get('job_test_123')?.progress.percent).toBe(100);
  });

  it('updates connection status on heartbeat', async () => {
    const { result } = renderHook(() => useJobStream());

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const eventSource = (global as any).lastEventSource as MockEventSource;

    // Simulate heartbeat event
    act(() => {
      eventSource.trigger('heartbeat', { timestamp: Date.now() });
    });

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });
  });

  it('removes completed jobs from Map after 30 seconds', async () => {
    const { result } = renderHook(() => useJobStream());

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const eventSource = (global as any).lastEventSource as MockEventSource;

    // Add completed job
    act(() => {
      eventSource.trigger('jobs.update', {
        jobs: [
          {
            jobId: 'job_completed',
            type: 'import',
            status: 'succeeded',
            progress: { current: 100, total: 100, percent: 100 },
            timestamp: Date.now(),
          },
        ],
      });
    });

    // Verify job exists
    await waitFor(() => {
      expect(result.current.jobs.has('job_completed')).toBe(true);
    });

    // Fast-forward 31 seconds
    act(() => {
      jest.advanceTimersByTime(31000);
    });

    // Verify job removed
    await waitFor(() => {
      expect(result.current.jobs.has('job_completed')).toBe(false);
    });
  });

  it('handles multiple job updates (coalescing)', async () => {
    const { result } = renderHook(() => useJobStream());

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const eventSource = (global as any).lastEventSource as MockEventSource;

    // Send initial job update
    act(() => {
      eventSource.trigger('jobs.update', {
        jobs: [
          {
            jobId: 'job_1',
            type: 'import',
            status: 'running',
            progress: { current: 50, total: 100, percent: 50 },
            timestamp: Date.now(),
          },
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.jobs.get('job_1')?.status).toBe('running');
      expect(result.current.jobs.get('job_1')?.progress.percent).toBe(50);
    });

    // Update same job to completed
    act(() => {
      eventSource.trigger('jobs.update', {
        jobs: [
          {
            jobId: 'job_1',
            type: 'import',
            status: 'succeeded',
            progress: { current: 100, total: 100, percent: 100 },
            timestamp: Date.now(),
          },
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.jobs.get('job_1')?.status).toBe('succeeded');
      expect(result.current.jobs.get('job_1')?.progress.percent).toBe(100);
    });
  });

  it('handles failed jobs', async () => {
    const { result } = renderHook(() => useJobStream());

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const eventSource = (global as any).lastEventSource as MockEventSource;

    // Simulate failed job
    act(() => {
      eventSource.trigger('jobs.update', {
        jobs: [
          {
            jobId: 'job_failed',
            type: 'delete',
            status: 'failed',
            progress: { current: 50, total: 100, percent: 50, message: 'Database error' },
            timestamp: Date.now(),
          },
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.jobs.get('job_failed')?.status).toBe('failed');
    });

    expect(result.current.jobs.get('job_failed')?.progress.message).toBe('Database error');
  });

  it('reconnects after connection drop', async () => {
    const { result } = renderHook(() => useJobStream());

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const eventSource = (global as any).lastEventSource as MockEventSource;

    // Simulate connection drop
    act(() => {
      eventSource.close();
    });

    // Verify disconnected
    await waitFor(() => {
      expect(result.current.connected).toBe(false);
    });

    // Advance time to trigger reconnection (3 second retry)
    act(() => {
      jest.advanceTimersByTime(3100);
    });

    // Verify new connection created
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(1);
    });
  });

  it('handles queued jobs', async () => {
    const { result } = renderHook(() => useJobStream());

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const eventSource = (global as any).lastEventSource as MockEventSource;

    // Simulate queued job
    act(() => {
      eventSource.trigger('jobs.update', {
        jobs: [
          {
            jobId: 'job_queued',
            type: 'import',
            status: 'queued',
            progress: { current: 0, total: 100, percent: 0 },
            timestamp: Date.now(),
          },
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.jobs.get('job_queued')?.status).toBe('queued');
    });
  });

  it('handles job cancellation', async () => {
    const { result } = renderHook(() => useJobStream());

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const eventSource = (global as any).lastEventSource as MockEventSource;

    // Simulate canceled job
    act(() => {
      eventSource.trigger('jobs.update', {
        jobs: [
          {
            jobId: 'job_canceled',
            type: 'import',
            status: 'canceled',
            progress: { current: 30, total: 100, percent: 30 },
            timestamp: Date.now(),
          },
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.jobs.get('job_canceled')?.status).toBe('canceled');
    });
  });

  it('removes jobs manually via removeJobs', async () => {
    const { result } = renderHook(() => useJobStream());

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const eventSource = (global as any).lastEventSource as MockEventSource;

    // Add job
    act(() => {
      eventSource.trigger('jobs.update', {
        jobs: [
          {
            jobId: 'job_to_remove',
            type: 'import',
            status: 'succeeded',
            progress: { current: 100, total: 100, percent: 100 },
            timestamp: Date.now(),
          },
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.jobs.has('job_to_remove')).toBe(true);
    });

    // Remove job manually
    act(() => {
      result.current.removeJobs(['job_to_remove']);
    });

    await waitFor(() => {
      expect(result.current.jobs.has('job_to_remove')).toBe(false);
    });
  });

  it('handles graph.update events', async () => {
    const { result } = renderHook(() => useJobStream());

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const eventSource = (global as any).lastEventSource as MockEventSource;

    // Simulate graph update event
    act(() => {
      eventSource.trigger('graph.update', {
        nodesAdded: 50,
        edgesAdded: 75,
        queueStats: {
          nodesQueued: 0,
          edgesQueued: 0,
          nodesFlushed: 50,
          edgesFlushed: 75,
        },
      });
    });

    // Graph updates don't affect jobs Map
    // This just verifies the event doesn't cause errors
    expect(result.current.jobs.size).toBe(0);
  });
});
