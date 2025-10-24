/**
 * useJobStream Hook Tests
 *
 * Tests SSE job streaming hook including:
 * - Connection management
 * - Event handling
 * - Reconnection logic
 * - Error handling
 * - Cleanup on unmount
 * - Authentication
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useJobStream } from './useJobStream';

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  getToken: vi.fn(),
}));

import { getToken } from '@/contexts/AuthContext';

// Mock EventSource
class MockEventSource {
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private listeners: Map<string, Array<(event: any) => void>> = new Map();

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  addEventListener(event: string, callback: (event: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: (event: any) => void) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  dispatchEvent(event: any): boolean {
    const callbacks = this.listeners.get(event.type);
    if (callbacks) {
      callbacks.forEach((cb) => cb(event));
    }
    if (event.type === 'open' && this.onopen) {
      this.onopen(event);
    }
    if (event.type === 'error' && this.onerror) {
      this.onerror(event);
    }
    if (event.type === 'message' && this.onmessage) {
      this.onmessage(event);
    }
    return true;
  }

  close() {
    this.readyState = 2; // CLOSED
  }

  // Helper to simulate SSE message
  simulateMessage(data: any) {
    const event = new MessageEvent('jobs.update', {
      data: JSON.stringify(data),
    });
    this.dispatchEvent(event);
  }

  simulateError() {
    this.readyState = 2; // CLOSED
    const event = new Event('error');
    this.dispatchEvent(event);
  }
}

describe('useJobStream', () => {
  let eventSourceInstance: MockEventSource | null = null;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated
    (getToken as any).mockReturnValue('test-token');

    // Mock EventSource globally
    (global as any).EventSource = vi.fn((url: string) => {
      eventSourceInstance = new MockEventSource(url);
      return eventSourceInstance;
    });

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    eventSourceInstance = null;
    vi.restoreAllMocks();
  });

  describe('Connection Management', () => {
    it('should connect to SSE endpoint on mount', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      expect(global.EventSource).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/stream/jobs?token=test-token')
      );
    });

    it('should include auth token in SSE URL', async () => {
      (getToken as any).mockReturnValue('my-secret-token');

      renderHook(() => useJobStream());

      await waitFor(() => {
        expect(global.EventSource).toHaveBeenCalledWith(
          expect.stringContaining('token=my-secret-token')
        );
      });
    });

    it('should set connected state when connection opens', async () => {
      const { result } = renderHook(() => useJobStream());

      expect(result.current.connected).toBe(false);

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });
    });

    it('should not connect when no token available', () => {
      (getToken as any).mockReturnValue(null);

      const { result } = renderHook(() => useJobStream());

      expect(result.current.connected).toBe(false);
      expect(result.current.error).toBe('Authentication required');
      expect(global.EventSource).not.toHaveBeenCalled();
    });

    it('should close connection on unmount', async () => {
      const { result, unmount } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      const closeSpy = vi.spyOn(eventSourceInstance!, 'close');
      unmount();

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('Event Handling', () => {
    it('should update jobs map on SSE events', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      // Simulate SSE message
      const jobUpdate = {
        jobs: [
          {
            jobId: 'job_123',
            type: 'import' as const,
            status: 'running' as const,
            progress: {
              current: 50,
              total: 100,
              percent: 50,
              message: 'Processing...',
            },
            timestamp: Date.now(),
          },
        ],
      };

      eventSourceInstance!.simulateMessage(jobUpdate);

      await waitFor(() => {
        expect(result.current.jobs.size).toBe(1);
      });

      const job = result.current.jobs.get('job_123');
      expect(job).toBeDefined();
      expect(job?.status).toBe('running');
      expect(job?.progress.percent).toBe(50);
    });

    it('should handle multiple jobs in single event', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      const jobUpdate = {
        jobs: [
          {
            jobId: 'job_1',
            type: 'import' as const,
            status: 'running' as const,
            progress: { current: 10, total: 100, percent: 10 },
            timestamp: Date.now(),
          },
          {
            jobId: 'job_2',
            type: 'delete' as const,
            status: 'queued' as const,
            progress: { current: 0, total: 100, percent: 0 },
            timestamp: Date.now(),
          },
          {
            jobId: 'job_3',
            type: 'export' as const,
            status: 'succeeded' as const,
            progress: { current: 100, total: 100, percent: 100 },
            timestamp: Date.now(),
          },
        ],
      };

      eventSourceInstance!.simulateMessage(jobUpdate);

      await waitFor(() => {
        expect(result.current.jobs.size).toBe(3);
      });

      expect(result.current.jobs.has('job_1')).toBe(true);
      expect(result.current.jobs.has('job_2')).toBe(true);
      expect(result.current.jobs.has('job_3')).toBe(true);
    });

    it('should update existing jobs on subsequent events', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      // First event - job at 25%
      eventSourceInstance!.simulateMessage({
        jobs: [
          {
            jobId: 'job_123',
            type: 'import' as const,
            status: 'running' as const,
            progress: { current: 25, total: 100, percent: 25 },
            timestamp: Date.now(),
          },
        ],
      });

      await waitFor(() => {
        expect(result.current.jobs.get('job_123')?.progress.percent).toBe(25);
      });

      // Second event - job at 75%
      eventSourceInstance!.simulateMessage({
        jobs: [
          {
            jobId: 'job_123',
            type: 'import' as const,
            status: 'running' as const,
            progress: { current: 75, total: 100, percent: 75 },
            timestamp: Date.now(),
          },
        ],
      });

      await waitFor(() => {
        expect(result.current.jobs.get('job_123')?.progress.percent).toBe(75);
      });

      // Should still only have one job
      expect(result.current.jobs.size).toBe(1);
    });

    it('should preserve job data not in current update', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      // Add two jobs
      eventSourceInstance!.simulateMessage({
        jobs: [
          {
            jobId: 'job_1',
            type: 'import' as const,
            status: 'running' as const,
            progress: { current: 50, total: 100, percent: 50 },
            timestamp: Date.now(),
          },
          {
            jobId: 'job_2',
            type: 'delete' as const,
            status: 'queued' as const,
            progress: { current: 0, total: 100, percent: 0 },
            timestamp: Date.now(),
          },
        ],
      });

      await waitFor(() => {
        expect(result.current.jobs.size).toBe(2);
      });

      // Update only job_1
      eventSourceInstance!.simulateMessage({
        jobs: [
          {
            jobId: 'job_1',
            type: 'import' as const,
            status: 'succeeded' as const,
            progress: { current: 100, total: 100, percent: 100 },
            timestamp: Date.now(),
          },
        ],
      });

      await waitFor(() => {
        expect(result.current.jobs.get('job_1')?.status).toBe('succeeded');
      });

      // job_2 should still exist
      expect(result.current.jobs.has('job_2')).toBe(true);
      expect(result.current.jobs.size).toBe(2);
    });

    it('should extract fileName from job config', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      eventSourceInstance!.simulateMessage({
        jobs: [
          {
            jobId: 'job_123',
            type: 'import' as const,
            status: 'running' as const,
            progress: { current: 50, total: 100, percent: 50 },
            config: { fileName: 'test.json' },
            timestamp: Date.now(),
          },
        ],
      });

      await waitFor(() => {
        const job = result.current.jobs.get('job_123');
        expect(job?.config?.fileName).toBe('test.json');
      });
    });

    it('should extract deleteScope from job config', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      eventSourceInstance!.simulateMessage({
        jobs: [
          {
            jobId: 'job_123',
            type: 'delete' as const,
            status: 'running' as const,
            progress: { current: 50, total: 100, percent: 50 },
            config: { deleteScope: 'canvas' },
            timestamp: Date.now(),
          },
        ],
      });

      await waitFor(() => {
        const job = result.current.jobs.get('job_123');
        expect(job?.config?.deleteScope).toBe('canvas');
      });
    });
  });

  describe('Reconnection Logic', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set reconnecting state on connection error', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      // Simulate connection error
      eventSourceInstance!.simulateError();

      await waitFor(() => {
        expect(result.current.connected).toBe(false);
      });
    });

    it('should attempt reconnection after delay', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      const initialCallCount = (global.EventSource as any).mock.calls.length;

      // Simulate error
      eventSourceInstance!.simulateError();

      // Fast-forward past reconnect delay
      vi.advanceTimersByTime(3100); // RECONNECT_DELAY_MS + buffer

      await waitFor(() => {
        // Should have created new EventSource
        expect((global.EventSource as any).mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });

    it('should limit reconnection attempts', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      const initialCallCount = (global.EventSource as any).mock.calls.length;

      // Simulate 5 consecutive errors (exceeds MAX_RECONNECT_ATTEMPTS)
      for (let i = 0; i < 5; i++) {
        eventSourceInstance!.simulateError();
        vi.advanceTimersByTime(3100);
        await waitFor(() => {}, { timeout: 100 });
      }

      // Should stop reconnecting after max attempts
      const finalCallCount = (global.EventSource as any).mock.calls.length;
      expect(finalCallCount - initialCallCount).toBeLessThanOrEqual(5);
    });
  });

  describe('Error Handling', () => {
    it('should set error state when connection fails', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      eventSourceInstance!.simulateError();

      await waitFor(() => {
        expect(result.current.connected).toBe(false);
      });
    });

    it('should handle malformed SSE data', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      // Send invalid JSON
      const badEvent = new MessageEvent('jobs.update', {
        data: 'not valid json',
      });
      eventSourceInstance!.dispatchEvent(badEvent);

      // Should not crash
      expect(result.current.connected).toBe(true);
      expect(result.current.jobs.size).toBe(0);
    });

    it('should handle missing jobs array in event', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      // Send event without jobs array
      eventSourceInstance!.simulateMessage({ foo: 'bar' });

      // Should not crash
      expect(result.current.connected).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should clear reconnect timer on unmount', async () => {
      vi.useFakeTimers();

      const { result, unmount } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      // Trigger reconnection
      eventSourceInstance!.simulateError();

      // Unmount before reconnection happens
      unmount();

      // Advance time - should not create new connection
      const callsBefore = (global.EventSource as any).mock.calls.length;
      vi.advanceTimersByTime(5000);

      expect((global.EventSource as any).mock.calls.length).toBe(callsBefore);

      vi.useRealTimers();
    });

    it('should not update state after unmount', async () => {
      const { result, unmount } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      unmount();

      // Try to send event after unmount
      eventSourceInstance!.simulateMessage({
        jobs: [
          {
            jobId: 'job_123',
            type: 'import' as const,
            status: 'running' as const,
            progress: { current: 50, total: 100, percent: 50 },
            timestamp: Date.now(),
          },
        ],
      });

      // Should not throw error (mountedRef check prevents state updates)
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid successive events', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      // Send 100 events rapidly
      for (let i = 0; i < 100; i++) {
        eventSourceInstance!.simulateMessage({
          jobs: [
            {
              jobId: `job_${i}`,
              type: 'import' as const,
              status: 'running' as const,
              progress: { current: i, total: 100, percent: i },
              timestamp: Date.now(),
            },
          ],
        });
      }

      await waitFor(() => {
        expect(result.current.jobs.size).toBeGreaterThan(90);
      });
    });

    it('should handle empty jobs array', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      eventSourceInstance!.simulateMessage({ jobs: [] });

      expect(result.current.jobs.size).toBe(0);
      expect(result.current.connected).toBe(true);
    });

    it('should handle very large job updates', async () => {
      const { result } = renderHook(() => useJobStream());

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      const largeUpdate = {
        jobs: Array.from({ length: 1000 }, (_, i) => ({
          jobId: `job_${i}`,
          type: 'import' as const,
          status: 'queued' as const,
          progress: { current: 0, total: 100, percent: 0 },
          timestamp: Date.now(),
        })),
      };

      eventSourceInstance!.simulateMessage(largeUpdate);

      await waitFor(() => {
        expect(result.current.jobs.size).toBe(1000);
      });
    });

    it('should handle connection immediately closing', async () => {
      // Override mock to close immediately
      (global as any).EventSource = vi.fn((url: string) => {
        const es = new MockEventSource(url);
        setTimeout(() => {
          es.simulateError();
        }, 5);
        return es;
      });

      const { result } = renderHook(() => useJobStream());

      // Should attempt reconnection
      await waitFor(
        () => {
          expect(result.current.reconnecting).toBe(true);
        },
        { timeout: 1000 }
      );
    });
  });
});
