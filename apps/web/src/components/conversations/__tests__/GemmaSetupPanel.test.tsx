import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { GemmaSetupPanel } from '../GemmaSetupPanel';
import type { LocalInferenceStatus } from '@keimenon/types';

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
        description: 'Download the Keimenon-managed local inference engine.',
        action_type: 'download',
        requires_user_confirmation: true,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders unimplemented guidance', () => {
    render(
      <GemmaSetupPanel
        status={mockNativeMissingStatus}
        onClose={mockOnClose}
        onRefresh={mockOnRefresh}
      />
    );
    expect(screen.getByText('Local Inference Status')).toBeInTheDocument();
    expect(
      screen.getByText('Keimenon native local Gemma runtime is not yet implemented.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Native Runtime' })).toBeInTheDocument();
  });
});
