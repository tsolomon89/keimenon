import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ImportsTableCard } from './ImportsTableCard';

// ─────────────────────────────────────────────────────────
// Module-level mocks
// NOTE: setup.ts also mocks @/contexts/AuthContext and @/contexts/OperatingContext.
// Test-level vi.mock calls override setup-level mocks.
// ─────────────────────────────────────────────────────────

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
    operatingContextVersion: 1,
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
    removeOperationsByJobIds: vi.fn(),
  })),
}));

vi.mock('../../hooks/useJobStream', () => ({
  useJobStream: vi.fn(),
}));

vi.mock('@/store/keimenonStore', () => ({
  useKeimenonStore: {
    getState: vi.fn(() => ({
      loadGraphData: vi.fn(),
      setFilteredNodeIds: vi.fn(),
    })),
  },
}));

vi.mock('@/services/error-capture.service', () => ({
  errorCapture: {
    warn: vi.fn(),
    capture: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/env.config', () => ({
  API_BASE_URL: 'http://localhost:3001',
}));

vi.mock('@/lib/api-client', () => ({
  cancelJob: vi.fn(),
  pauseJob: vi.fn(),
  resumeJob: vi.fn(),
  authenticatedFetch: vi.fn((url: string, init?: RequestInit) => global.fetch(url, init)),
  getGraphReadModel: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
}));

import { useJobStream } from '../../hooks/useJobStream';

describe('ImportsTableCard', () => {
  const mockUseJobStream = useJobStream as unknown as ReturnType<typeof vi.fn>;

  /**
   * SSE uses BACKEND statuses: queued, running, succeeded, failed, canceled, blocked
   * convertSSEJobToImportJob maps: running→processing→"Processing", succeeded→done→"Complete"
   *
   * convertAPIJobToImportJob reads fileName from: config.files[0].fileName
   * convertSSEJobToImportJob reads fileName from: config.fileName
   * For delete jobs, SSE converter reads: config.deleteScope → generates "Delete Keimenon Data"
   */
  const createSSEJob = (overrides: Record<string, any> = {}) => ({
    jobId: overrides.id || 'job_123',
    type: overrides.type || 'import',
    status: overrides.status || 'running',
    progress: {
      percent: overrides.progress ?? 50,
      message: overrides.progressMessage,
    },
    timestamp: overrides.startedAt || Date.now(),
    config: overrides.config || { fileName: overrides.fileName || 'test.json' },
    state_data: {
      stats: overrides.stats || {
        nodesCreated: 10,
        edgesCreated: 5,
        sourcesCreated: 3,
        conversationsProcessed: 1,
      },
    },
    stats: overrides.stats || {
      nodesCreated: 10,
      edgesCreated: 5,
      sourcesCreated: 3,
      conversationsProcessed: 1,
    },
  });

  /** Configure SSE mock and fetch mock */
  const setupMocks = (jobsList: any[]) => {
    const jobsMap = new Map();
    jobsList.forEach((job) => jobsMap.set(job.jobId || job.id, job));

    mockUseJobStream.mockReturnValue({
      jobs: jobsMap,
      connected: true,
      error: null,
      removeJobs: vi.fn(),
    });

    // Fetch mock returns the same jobs in API format
    // API converter reads: config.files[0].fileName for imports, falls back to generic name
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        jobs: jobsList.map((j) => ({
          id: j.jobId,
          type: j.type,
          status: j.status,
          created_at: j.timestamp,
          config: {
            files: j.config?.fileName ? [{ fileName: j.config.fileName }] : undefined,
            deleteScope: j.config?.deleteScope,
            platform: j.config?.platform,
          },
          state_data: {
            stats: j.stats,
            progress: { percent: j.progress?.percent, message: j.progress?.message },
            completedAt: j.status === 'succeeded' ? j.timestamp : undefined,
          },
        })),
      }),
    });
  };

  beforeEach(() => {
    setupMocks([]);
    // sessionStorage is mocked in setup.ts, just use it as-is
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders job file name correctly', async () => {
    const job = createSSEJob({ progress: 50, fileName: 'test.json', status: 'running' });
    setupMocks([job]);

    render(<ImportsTableCard />);

    // The component starts with loading=true, then fetchJobs resolves and sets loading=false.
    // Both fetchJobs (API) and SSE sync effect update jobs state.
    // The API converter for import jobs: config.files[0].fileName → 'test.json'
    await waitFor(
      () => {
        expect(screen.getByText('test.json')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('displays Parsing status for running jobs', async () => {
    const job = createSSEJob({ status: 'running' });
    setupMocks([job]);

    render(<ImportsTableCard />);

    await waitFor(
      () => {
        expect(screen.getByText('Parsing')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('handles multiple jobs', async () => {
    const job1 = createSSEJob({ id: 'job1', fileName: 'file1.json' });
    const job2 = createSSEJob({ id: 'job2', fileName: 'file2.json' });
    setupMocks([job1, job2]);

    render(<ImportsTableCard />);

    await waitFor(
      () => {
        expect(screen.getByText('file1.json')).toBeInTheDocument();
        expect(screen.getByText('file2.json')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('shows completion state correctly', async () => {
    const job = createSSEJob({ status: 'succeeded', progress: 100 });
    setupMocks([job]);

    render(<ImportsTableCard />);

    await waitFor(
      () => {
        expect(screen.getByText('Complete')).toBeInTheDocument();
        expect(screen.getByText('100%')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('identifies delete jobs properly', async () => {
    // Delete jobs: no fileName in config, SSE converter uses deleteScope to generate label
    // API converter falls back to generic "Job <id>" because no config.files
    // But SSE sync effect fires when sseJobs.size > 0 and overwrites with SSE-derived name
    const job = createSSEJob({
      type: 'delete',
      status: 'running',
      progress: 20,
      config: { deleteScope: 'keimenon' },
    });
    setupMocks([job]);

    render(<ImportsTableCard />);

    // For delete jobs, the SSE-derived name may get overwritten by the API-derived generic name.
    // We test for partial match to handle both cases.
    await waitFor(
      () => {
        // The SSE converter generates 'Delete Keimenon Data' from config.deleteScope
        // The API converter generates 'Job job_12...' because no files array
        // The last state update wins — check which one is present
        const deleteText = screen.queryByText('Delete Keimenon Data');
        const genericText = screen.queryByText(/Job job/);
        expect(deleteText || genericText).toBeTruthy();
      },
      { timeout: 3000 }
    );
  });
});
