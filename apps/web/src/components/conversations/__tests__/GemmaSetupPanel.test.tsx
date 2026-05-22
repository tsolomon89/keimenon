import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { GemmaSetupPanel } from '../GemmaSetupPanel';
import type { LocalInferenceStatus } from '@keimenon/types';

// Mock the API service layer to avoid real API calls and import resolution failures
vi.mock('@/services/organization-service', () => ({
  organizationService: {
    getLocalInferenceSources: vi.fn().mockResolvedValue([
      {
        id: 'candidate-1',
        display_name: 'Gemma 4 Candidate',
        source_verified: true,
        artifact_verified: true,
        runtime_compatibility_verified: true,
        source_url: 'https://huggingface.co/google/gemma-4',
      },
    ]),
    getActiveLocalInferenceModel: vi.fn().mockResolvedValue({
      candidate_id: 'candidate-1',
      verification_status: 'presence_verified',
      license_required: true,
      license_accepted: true,
    }),
    getLocalInferenceDirectory: vi.fn().mockResolvedValue({ path: '/mock/models/dir' }),
    getHelperStatus: vi.fn().mockResolvedValue({
      state: 'runtime_unimplemented',
      message: 'Keimenon native local Gemma runtime is not yet implemented.',
    }),
    createPendingLocalInferenceModel: vi.fn().mockResolvedValue({}),
    acceptGemmaTerms: vi.fn().mockResolvedValue({}),
    verifyLocalModel: vi.fn().mockResolvedValue({}),
    validateHelperModel: vi.fn().mockResolvedValue({}),
    loadHelperModel: vi.fn().mockResolvedValue({}),
  },
}));

describe('GemmaSetupPanel', () => {
  const mockOnClose = vi.fn();
  const mockOnRefresh = vi.fn();

  const mockNativeMissingStatus: LocalInferenceStatus = {
    model_family: 'gemma',
    preferred_backend: 'native-gemma',
    state: 'runtime_unimplemented',
    can_run_offline: true,
    requires_admin: false,
    message: 'Keimenon native local Gemma runtime is not yet implemented.',
    next_actions: [
      {
        id: 'download_runtime',
        label: 'Download Native Runtime',
        description: 'Download and install the native Gemma inference runtime',
        action_type: 'download',
        requires_user_confirmation: true,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders unimplemented guidance', async () => {
    render(
      <GemmaSetupPanel
        status={mockNativeMissingStatus}
        onClose={mockOnClose}
        onRefresh={mockOnRefresh}
      />
    );

    // Check main panel title
    expect(screen.getByText('Local Inference Setup')).toBeInTheDocument();

    // Wait for the async candidates to load and render
    const candidateName = await screen.findByText('Gemma 4 Candidate');
    expect(candidateName).toBeInTheDocument();

    // Check that helperStatus message is rendered
    expect(
      screen.getByText('Keimenon native local Gemma runtime is not yet implemented.')
    ).toBeInTheDocument();

    // Check that the model download button is rendered
    expect(screen.getByRole('button', { name: 'Download Model' })).toBeInTheDocument();
  });
});
