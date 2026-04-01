import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatImportModal } from './ChatImportModal';

const mocked = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  getDuplicateReviewStatusMock: vi.fn(),
  getDuplicateReviewGroupsMock: vi.fn(),
  applyDuplicateDecisionsMock: vi.fn(),
  getMyFeaturesMock: vi.fn(),
  analyzeFilesMock: vi.fn(),
  detectPlatformMock: vi.fn(),
  completeCoreProcessReimportMock: vi.fn(),
  getCoreProcessReimportStatusMock: vi.fn(),
  listImportPresetsMock: vi.fn(),
  createImportPresetMock: vi.fn(),
  updateImportPresetMock: vi.fn(),
  deleteImportPresetMock: vi.fn(),
  jobs: new Map<string, any>(),
}));

vi.mock('@/hooks/useChunkedUpload', () => ({
  useChunkedUpload: () => ({
    upload: mocked.uploadMock,
    pause: vi.fn(),
    resume: vi.fn(),
    isPaused: false,
    progress: {
      status: 'idle',
      percentage: 0,
      chunksUploaded: 0,
      totalChunks: 0,
    },
  }),
}));

vi.mock('@/hooks/useJobStream', () => ({
  useJobStream: () => ({
    jobs: mocked.jobs,
    connected: true,
  }),
}));

vi.mock('@/lib/error-handler', () => ({
  logApiEvent: vi.fn(),
  logJobEvent: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  analyzeFiles: mocked.analyzeFilesMock,
  detectPlatform: mocked.detectPlatformMock,
  applyDuplicateDecisions: mocked.applyDuplicateDecisionsMock,
  getDuplicateReviewGroups: mocked.getDuplicateReviewGroupsMock,
  getDuplicateReviewStatus: mocked.getDuplicateReviewStatusMock,
  getMyFeatures: mocked.getMyFeaturesMock,
  completeCoreProcessReimport: mocked.completeCoreProcessReimportMock,
  getCoreProcessReimportStatus: mocked.getCoreProcessReimportStatusMock,
  listImportPresets: mocked.listImportPresetsMock,
  createImportPreset: mocked.createImportPresetMock,
  updateImportPreset: mocked.updateImportPresetMock,
  deleteImportPreset: mocked.deleteImportPresetMock,
}));

vi.mock('../import/ImportStageSelect', () => ({
  ImportStageSelect: ({ onFilesSelected }: { onFilesSelected: (files: File[]) => void }) => (
    <button
      type="button"
      data-testid="select-files"
      onClick={() =>
        onFilesSelected([new File(['{"messages":[]}'], 'chat.json', { type: 'application/json' })])
      }
    >
      Select Files
    </button>
  ),
}));

vi.mock('../import/ImportStageProcessing', () => ({
  ImportStageProcessing: () => <div data-testid="stage-processing">Processing...</div>,
}));

vi.mock('../import/ImportStageConfig', () => ({
  ImportStageConfig: () => <div data-testid="stage-config">Config...</div>,
}));

vi.mock('../import/DuplicateReviewPanel', () => ({
  DuplicateReviewPanel: ({
    onReviewComplete,
  }: {
    onReviewComplete: (decisions: Map<string, any>) => Promise<void>;
  }) => (
    <div data-testid="duplicate-review-panel">
      <button
        type="button"
        data-testid="apply-review"
        onClick={() =>
          onReviewComplete(
            new Map([
              [
                'cand_1',
                {
                  duplicateId: 'cand_1',
                  action: 'sequester',
                  timestamp: Date.now(),
                  primaryNodeId: 'node_primary',
                  duplicateNodeId: 'node_duplicate',
                },
              ],
            ])
          )
        }
      >
        Apply Review
      </button>
    </div>
  ),
}));

function succeededJob(jobId: string) {
  return {
    id: jobId,
    type: 'import',
    status: 'succeeded',
    progress: {
      percent: 100,
      message: 'Import complete',
      stage: 'SUCCEEDED',
      metadata: {},
    },
    stats: {
      conversationsProcessed: 2,
      messagesProcessed: 4,
      nodesCreated: 10,
      edgesCreated: 8,
      sourcesCreated: 2,
    },
  };
}

describe('ChatImportModal duplicate review transitions', () => {
  beforeEach(() => {
    mocked.jobs = new Map();
    mocked.uploadMock.mockResolvedValue({ success: true, jobId: 'job_123' });
    mocked.getMyFeaturesMock.mockResolvedValue({
      plan: 'professional',
      accountClass: 'professional',
      features: {
        auto_graph: true,
      },
      generatedAt: Date.now(),
    });
    mocked.detectPlatformMock.mockResolvedValue({ platform: 'chatgpt', confidence: 0.95 });
    mocked.analyzeFilesMock.mockResolvedValue({ total_conversations: 1, total_messages: 2 });
    mocked.getCoreProcessReimportStatusMock.mockResolvedValue({ requiresReimport: false });
    mocked.completeCoreProcessReimportMock.mockResolvedValue({ success: true });
    mocked.listImportPresetsMock.mockResolvedValue({
      success: true,
      presets: [],
    });
    mocked.createImportPresetMock.mockResolvedValue({
      success: true,
      preset: {
        id: 'preset_1',
        name: 'Preset',
        config: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });
    mocked.updateImportPresetMock.mockResolvedValue({
      success: true,
      preset: {
        id: 'preset_1',
        name: 'Preset',
        config: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });
    mocked.deleteImportPresetMock.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('transitions processing -> review when duplicate review is required and candidates exist', async () => {
    mocked.getDuplicateReviewStatusMock.mockResolvedValue({
      success: true,
      status: {
        review_required: true,
        pending_candidates: 1,
        total_candidates: 1,
      },
    });
    mocked.getDuplicateReviewGroupsMock.mockResolvedValue({
      success: true,
      total_groups: 1,
      total_candidates: 1,
      groups: [{ id: 'group_1', candidates: [], totalDuplicates: 1, reviewed: 0, autoResolved: 0 }],
    });

    const onDismiss = vi.fn();
    const view = render(<ChatImportModal onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId('select-files'));

    await waitFor(() => expect(screen.getByText('Configure import settings')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Import & Review' }));

    await waitFor(() => expect(mocked.uploadMock).toHaveBeenCalledTimes(1));

    mocked.jobs = new Map([['job_123', succeededJob('job_123')]]);
    view.rerender(<ChatImportModal onDismiss={onDismiss} />);

    await waitFor(() => {
      expect(mocked.getDuplicateReviewStatusMock).toHaveBeenCalledWith('job_123');
      expect(screen.getByText('Review potential duplicates')).toBeInTheDocument();
      expect(screen.getByTestId('duplicate-review-panel')).toBeInTheDocument();
    });
  });

  it('transitions review -> complete only after successful apply with no pending candidates', async () => {
    mocked.getDuplicateReviewStatusMock.mockResolvedValue({
      success: true,
      status: {
        review_required: true,
        pending_candidates: 1,
        total_candidates: 1,
      },
    });
    mocked.getDuplicateReviewGroupsMock.mockResolvedValue({
      success: true,
      total_groups: 1,
      total_candidates: 1,
      groups: [{ id: 'group_1', candidates: [], totalDuplicates: 1, reviewed: 0, autoResolved: 0 }],
    });
    mocked.applyDuplicateDecisionsMock.mockResolvedValue({
      success: true,
      result: {
        applied_decisions: 1,
        nodes_sequestered: 1,
        nodes_merged: 0,
        action_counts: { sequester: 1 },
        pending_candidates: 0,
        message: 'Duplicate review complete',
      },
    });

    const onDismiss = vi.fn();
    const view = render(<ChatImportModal onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId('select-files'));
    await waitFor(() => expect(screen.getByText('Configure import settings')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Import & Review' }));
    await waitFor(() => expect(mocked.uploadMock).toHaveBeenCalledTimes(1));

    mocked.jobs = new Map([['job_123', succeededJob('job_123')]]);
    view.rerender(<ChatImportModal onDismiss={onDismiss} />);

    await waitFor(() => expect(screen.getByTestId('duplicate-review-panel')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('apply-review'));

    await waitFor(() => {
      expect(mocked.applyDuplicateDecisionsMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Import completed successfully!')).toBeInTheDocument();
    });
  });
});
