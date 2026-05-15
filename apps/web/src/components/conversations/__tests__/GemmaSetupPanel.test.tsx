import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GemmaSetupPanel } from '../GemmaSetupPanel';
import type { GemmaLocalStatus } from '../../../utils/gemma-status-helper';

describe('GemmaSetupPanel', () => {
  const mockOnClose = vi.fn();
  const mockOnRefresh = vi.fn();

  const mockNotConfiguredStatus: GemmaLocalStatus = {
    configured: false,
    status: 'unavailable',
    guidance: {
      title: 'Gemma Not Configured',
      explanation: 'Keimenon needs a configured local runtime endpoint serving a Gemma model.',
      next_steps: ['Set GEMMA_LOCAL_BASE_URL and GEMMA_LOCAL_MODEL, then re-check status.'],
      expected_runtime_endpoint: 'http://localhost:1234/v1',
      model_requirement: 'gemma-family',
      exact_match_required: true,
      advanced_examples: [
        {
          label: 'LM Studio',
          base_url: 'http://localhost:1234/v1',
          note: 'Host software is infrastructure, not the model. Keimenon only supports Gemma-family models.',
        },
        {
          label: 'Ollama',
          base_url: 'http://localhost:11434/v1',
          note: 'Host software is infrastructure, not the model. Keimenon only supports Gemma-family models.',
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders not-configured guidance', () => {
    render(
      <GemmaSetupPanel
        status={mockNotConfiguredStatus}
        onClose={mockOnClose}
        onRefresh={mockOnRefresh}
      />
    );
    expect(screen.getByText('Gemma Not Configured')).toBeInTheDocument();
    expect(
      screen.getByText('Keimenon needs a configured local runtime endpoint serving a Gemma model.')
    ).toBeInTheDocument();
  });

  it('keeps advanced host examples collapsed by default', () => {
    render(
      <GemmaSetupPanel
        status={mockNotConfiguredStatus}
        onClose={mockOnClose}
        onRefresh={mockOnRefresh}
      />
    );
    // "LM Studio" and "Ollama" should not be visible initially
    expect(screen.queryByText('LM Studio')).not.toBeInTheDocument();
    expect(screen.queryByText('Ollama')).not.toBeInTheDocument();
  });

  it('advanced examples contain the host-software warning when expanded', () => {
    render(
      <GemmaSetupPanel
        status={mockNotConfiguredStatus}
        onClose={mockOnClose}
        onRefresh={mockOnRefresh}
      />
    );
    const expandButton = screen.getByText('Advanced Host Examples');
    fireEvent.click(expandButton);

    const warnings = screen.getAllByText(
      'Host software is infrastructure, not the model. Keimenon only supports Gemma-family models.'
    );
    expect(warnings.length).toBe(2);
    expect(screen.getByText('LM Studio')).toBeInTheDocument();
    expect(screen.getByText('Ollama')).toBeInTheDocument();
  });

  it('primary panel text does not include named host software', () => {
    const { container } = render(
      <GemmaSetupPanel
        status={mockNotConfiguredStatus}
        onClose={mockOnClose}
        onRefresh={mockOnRefresh}
      />
    );

    // Ensure LM Studio and Ollama are not in the primary text (container text content before expanding)
    const content = container.textContent || '';
    expect(content.includes('LM Studio')).toBe(false);
    expect(content.includes('Ollama')).toBe(false);
  });
});
