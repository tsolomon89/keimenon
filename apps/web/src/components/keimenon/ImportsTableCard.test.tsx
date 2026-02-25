import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { ImportsTableCard, ImportJob } from './ImportsTableCard';

// Mock the contexts
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

// Mock useJobStream using relative path
vi.mock('../../hooks/useJobStream', () => ({
  useJobStream: vi.fn(),
}));

import { useJobStream } from '../../hooks/useJobStream';

describe('ImportsTableCard', () => {
  const mockUseJobStream = useJobStream as unknown as ReturnType<typeof vi.fn>;

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

  const createSSEJob = (overrides: Partial<any> = {}) => ({
    jobId: overrides.id || mockJob.id,
    type: 'import',
    status: overrides.status || mockJob.status,
    progress: { percent: overrides.progress || mockJob.progress },
    timestamp: overrides.startedAt || mockJob.startedAt,
    config: { fileName: overrides.fileName || mockJob.fileName },
    state_data: { stats: overrides.stats || mockJob.stats }, // For fetch mock compatibility
    ...overrides,
  });

  // Helper to sync Fetch and SSE mocks to avoid race conditions
  const setupMocks = (jobsList: any[]) => {
    // 1. Setup SSE Mock
    const jobsMap = new Map();
    jobsList.forEach((job) => jobsMap.set(job.jobId || job.id, job));

    mockUseJobStream.mockReturnValue({
      jobs: jobsMap,
      connected: true,
      error: null,
      removeJobs: vi.fn(),
    });

    // 2. Setup Fetch Mock (to match SSE data)
    // We need to convert SSE structure to what API returns if they differ,
    // but here we just pass the object assuming component handles overlap or we mirror structure.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        jobs: jobsList.map((j) => ({
          ...j,
          id: j.jobId,
          state_data: { stats: j.stats },
          config: j.config,
        })),
      }),
    });
  };

  beforeEach(() => {
    // Default: empty
    setupMocks([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders SSE job data correctly', async () => {
    // 1. Initial State (Empty)
    setupMocks([]);
    const { rerender } = render(<ImportsTableCard key="initial" />);
    expect(screen.queryByText('test.json')).not.toBeInTheDocument();

    // 2. Simulate SSE Update (Force Remount)
    const job = createSSEJob({ progress: 50 });
    setupMocks([job]);

    await act(async () => {
      rerender(<ImportsTableCard key="update-1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('test.json')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  it('displays correct status', async () => {
    const job = createSSEJob({ status: 'indexing' });
    setupMocks([job]);

    render(<ImportsTableCard key="status-test" />);

    await waitFor(() => {
      expect(screen.getByText('Indexing')).toBeInTheDocument();
    });
  });

  it('handles multiple jobs', async () => {
    const job1 = createSSEJob({ id: 'job1', fileName: 'file1.json' });
    const job2 = createSSEJob({ id: 'job2', fileName: 'file2.json' });
    setupMocks([job1, job2]);

    render(<ImportsTableCard key="multi-test" />);

    await waitFor(() => {
      expect(screen.getByText('file1.json')).toBeInTheDocument();
      expect(screen.getByText('file2.json')).toBeInTheDocument();
    });
  });

  it('shows completion state correctly', async () => {
    const job = createSSEJob({ status: 'succeeded', progress: 100 });
    setupMocks([job]);

    render(<ImportsTableCard key="completion-test" />);

    await waitFor(() => {
      expect(screen.getByText('Complete')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });
});
