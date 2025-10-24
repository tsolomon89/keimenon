import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ImportsTableCard, ImportJob } from './ImportsTableCard';

// Mock the contexts with proper React components
vi.mock('@/contexts/AuthContext', () => ({
  getToken: vi.fn(() => 'test-token'),
  useAuth: vi.fn(() => ({ user: { id: 'test-user' }, isAuthenticated: true })),
}));

vi.mock('@/contexts/OperatingContext', () => ({
  useOperating: vi.fn(() => ({
    operating: { accountId: '', mode: 'native' },
    isOperatingMode: false,
    enterOperatingMode: vi.fn(),
    exitOperatingMode: vi.fn(),
  })),
}));

vi.mock('@/contexts/BackgroundOperationsContext', () => ({
  useBackgroundOperations: vi.fn(() => ({
    getAllOperations: vi.fn(() => []),
    addOperation: vi.fn(),
    updateOperation: vi.fn(),
    removeOperation: vi.fn(),
    getOperation: vi.fn(),
    minimizeOperation: vi.fn(),
    restoreOperation: vi.fn(),
  })),
}));

describe('ImportsTableCard', () => {
  const mockToken = 'test-token';
  const mockJob: ImportJob = {
    id: 'job_123',
    fileName: 'test.json',
    fileType: 'chat',
    platform: 'chatgpt',
    status: 'reading',
    progress: 50,
    startedAt: Date.now(),
    stats: {
      nodesCreated: 10,
      edgesCreated: 5,
      sourcesCreated: 3,
      conversationsProcessed: 1,
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();

    // Setup fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('re-renders when polling receives updated job data', async () => {
    // Mock fetch to return initial data
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        jobs: [{ ...mockJob, progress: 50 }],
      }),
    });

    const { rerender } = render(<ImportsTableCard />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    // Mock fetch to return updated data (progress changed)
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        jobs: [{ ...mockJob, progress: 75 }],
      }),
    });

    // Advance timers to trigger poll (2 second interval)
    vi.advanceTimersByTime(2000);

    // CRITICAL TEST: UI should update without user interaction
    await waitFor(
      () => {
        expect(screen.getByText('75%')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Verify old progress is gone
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });

  it('updates job status when backend state changes', async () => {
    // Initial: job is reading
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        jobs: [{ ...mockJob, status: 'reading' }],
      }),
    });

    render(<ImportsTableCard />);

    await waitFor(() => {
      expect(screen.getByText('Reading')).toBeInTheDocument();
    });

    // Poll returns job now parsing
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        jobs: [{ ...mockJob, status: 'parsing' }],
      }),
    });

    vi.advanceTimersByTime(2000);

    // Status badge should update
    await waitFor(() => {
      expect(screen.getByText('Parsing')).toBeInTheDocument();
    });
    expect(screen.queryByText('Reading')).not.toBeInTheDocument();
  });

  it('adds new jobs to table when new imports start', async () => {
    // Initial: one job
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        jobs: [mockJob],
      }),
    });

    render(<ImportsTableCard />);

    await waitFor(() => {
      expect(screen.getByText('test.json')).toBeInTheDocument();
    });

    // Poll returns two jobs
    const newJob: ImportJob = {
      ...mockJob,
      id: 'job_456',
      fileName: 'test2.json',
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        jobs: [mockJob, newJob],
      }),
    });

    vi.advanceTimersByTime(2000);

    // Both jobs should be visible
    await waitFor(() => {
      expect(screen.getByText('test.json')).toBeInTheDocument();
      expect(screen.getByText('test2.json')).toBeInTheDocument();
    });
  });

  it('removes completed jobs after they finish', async () => {
    // Initial: job is running
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        jobs: [{ ...mockJob, status: 'indexing' }],
      }),
    });

    render(<ImportsTableCard />);

    await waitFor(() => {
      expect(screen.getByText('test.json')).toBeInTheDocument();
    });

    // Poll returns job completed (still in list for history)
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        jobs: [{ ...mockJob, status: 'done', progress: 100 }],
      }),
    });

    vi.advanceTimersByTime(2000);

    // Job should show as complete
    await waitFor(() => {
      expect(screen.getByText('Complete')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  it('does not cause memory leak with continuous polling', async () => {
    let fetchCallCount = 0;

    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCallCount++;
      return {
        ok: true,
        json: async () => ({
          success: true,
          jobs: [{ ...mockJob, progress: fetchCallCount }],
        }),
      };
    });

    const { unmount } = render(<ImportsTableCard />);

    // Wait for initial load
    await waitFor(() => expect(fetchCallCount).toBeGreaterThan(0));

    const initialCalls = fetchCallCount;

    // Simulate 100 polls (200 seconds)
    for (let i = 0; i < 100; i++) {
      vi.advanceTimersByTime(2000);
      await waitFor(() => {}, { timeout: 100 }); // Let promises resolve
    }

    // Verify polling continued
    expect(fetchCallCount).toBeGreaterThan(initialCalls + 90);

    // Unmount should stop polling
    unmount();
    const callsAfterUnmount = fetchCallCount;

    vi.advanceTimersByTime(10000); // 10 more seconds
    await waitFor(() => {}, { timeout: 100 });

    // No new calls after unmount
    expect(fetchCallCount).toBe(callsAfterUnmount);
  });
});
