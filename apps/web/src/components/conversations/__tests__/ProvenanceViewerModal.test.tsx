// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { ProvenanceViewerModal } from '../ProvenanceViewerModal';
import { organizationService } from '@/services/organization-service';

// Mock the API layer
vi.mock('@/services/organization-service', () => ({
  organizationService: {
    getAgentRunProvenance: vi.fn(),
  },
}));

// Mock window.devicePixelRatio and requestAnimationFrame
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'devicePixelRatio', {
    writable: true,
    value: 1,
  });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    return setTimeout(cb, 16) as any;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    clearTimeout(id as any);
  });
});

const mockProvenanceSuccess = {
  success: true,
  runId: 'run_999',
  provider: 'local-gemma',
  model: 'gemma-4-e2b',
  skill_used: 'bounded-answer',
  duration_ms: 1500,
  status: 'success' as const,
  evidence: [
    {
      id: 'span_1',
      kind: 'SourceSpan',
      text: 'Seeded fact for component testing.',
      source_id: 'src_xyz',
      frequency: 3,
    },
  ],
  stats: {
    total_items: 1,
    spans: 1,
    phrases: 0,
    topics: 0,
  },
};

const mockProvenanceError = {
  success: false,
  runId: 'run_err_1',
  status: 'error' as const,
  evidence: [],
  stats: {
    total_items: 0,
    spans: 0,
    phrases: 0,
    topics: 0,
  },
};

describe('ProvenanceViewerModal', () => {
  it('renders loading spinner initially and then displays successfully loaded graph workspace', async () => {
    const mockGetProvenance = vi.mocked(organizationService.getAgentRunProvenance);
    mockGetProvenance.mockResolvedValue(mockProvenanceSuccess);

    render(<ProvenanceViewerModal runId="run_999" onClose={vi.fn()} />);

    // Loader should show up immediately
    expect(screen.getByText('Hydrating provenance workspace...')).toBeInTheDocument();

    // Wait for the hydration to finish
    await waitFor(() => {
      expect(screen.getByText('Evidence Provenance Workspace')).toBeInTheDocument();
    });

    // Check header metadata badges
    expect(screen.getByText('Provider: local-gemma')).toBeInTheDocument();
    expect(screen.getByText('Model: gemma-4-e2b')).toBeInTheDocument();
    expect(screen.getByText('Skill: bounded-answer')).toBeInTheDocument();
    expect(screen.getByText('1500ms')).toBeInTheDocument();

    // Check stats display
    expect(screen.getByText('Total Evidence')).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBe(2); // total items and spans counts both render 1
  });

  it('allows switching sidebar tabs and performing search on evidence', async () => {
    const mockGetProvenance = vi.mocked(organizationService.getAgentRunProvenance);
    mockGetProvenance.mockResolvedValue(mockProvenanceSuccess);

    render(<ProvenanceViewerModal runId="run_999" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Evidence Provenance Workspace')).toBeInTheDocument();
    });

    // Click "All Evidence (1)" tab
    const listTabButton = screen.getByRole('button', { name: /All Evidence/i });
    fireEvent.click(listTabButton);

    // Verify search input shows up
    const searchInput = screen.getByPlaceholderText('Search evidence...');
    expect(searchInput).toBeInTheDocument();

    // Text snippet of evidence should render in list card
    expect(screen.getByText(/"Seeded fact for component testing."/i)).toBeInTheDocument();

    // Type query that matches nothing
    fireEvent.change(searchInput, { target: { value: 'nonexistentkeyword' } });
    expect(screen.getByText('No matching evidence found.')).toBeInTheDocument();

    // Clear search
    const clearButton = screen.getByRole('button', { name: /Clear/i });
    fireEvent.click(clearButton);
    expect(screen.getByText(/"Seeded fact for component testing."/i)).toBeInTheDocument();
  });

  it('renders failed run state if status is error', async () => {
    const mockGetProvenance = vi.mocked(organizationService.getAgentRunProvenance);
    mockGetProvenance.mockResolvedValue(mockProvenanceError);

    render(<ProvenanceViewerModal runId="run_err_1" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Agent Run Execution Failed')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        'This run terminated with an error. No context evidence was bound or processed.'
      )
    ).toBeInTheDocument();
  });

  it('renders no-evidence fallback if evidence list is empty', async () => {
    const mockEmpty = {
      runId: 'run_empty',
      evidence: [],
      stats: { total_items: 0, spans: 0, phrases: 0, topics: 0 },
    };
    const mockGetProvenance = vi.mocked(organizationService.getAgentRunProvenance);
    mockGetProvenance.mockResolvedValue(mockEmpty);

    render(<ProvenanceViewerModal runId="run_empty" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('No explicit evidence was bound to this run.')).toBeInTheDocument();
    });
  });
});
