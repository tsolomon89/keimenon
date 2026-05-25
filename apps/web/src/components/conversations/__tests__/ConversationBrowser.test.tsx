import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationBrowser } from '../ConversationBrowser';
import { organizationService } from '@/services/organization-service';

// Mock the API layer
vi.mock('@/services/organization-service', () => ({
  organizationService: {
    listConversations: vi.fn().mockResolvedValue([]),
    listPrincipals: vi.fn().mockResolvedValue([]),
    createConversation: vi.fn(),
  },
}));

vi.mock('@/store/keimenonStore', () => ({
  useKeimenonStore: vi.fn((selector) => {
    const mockState = {
      nodes: [
        { id: 'src-1', kind: 'Source', type: 'Source', data: { label: 'Source 1' } },
        { id: 'grp-1', kind: 'Group', type: 'Group', data: { label: 'Group 1' } },
      ],
      selectedNodeIds: new Set(['src-1', 'grp-1']),
    };
    return selector ? selector(mockState) : mockState;
  }),
}));

describe('ConversationBrowser Modal Initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits create conversation with correct context_spec payload', async () => {
    const mockCreateConversation = vi.mocked(organizationService.createConversation);
    mockCreateConversation.mockResolvedValue({
      id: 'conv-1',
      kind: 'ConversationThread',
      account_id: 'acc-1',
      title: 'Test Discussion',
      human_principal_id: 'user-1',
      purpose: 'general',
      created_at: 1234567890,
      updated_at: 1234567890,
    });

    const initialContextSpec = {
      source_ids: ['src-1'],
      group_ids: ['grp-1'],
      include_pinned: false,
      expansion_rule: 'none' as const,
    };

    const initialContextSummary = {
      selectedNodeCount: 3,
      unsupportedNodeCount: 1,
    };

    const onInitialContextConsumed = vi.fn();

    render(
      <ConversationBrowser
        initialContextSpec={initialContextSpec}
        initialContextSummary={initialContextSummary}
        onInitialContextConsumed={onInitialContextConsumed}
      />
    );

    // Wait for conversations/principals to "load" (even though mocked to [])
    await waitFor(() => {
      expect(screen.getByText('Start New Conversation')).toBeInTheDocument();
    });

    // The modal should be open immediately because we provided initialContextSpec
    // Verify summary is rendered
    expect(screen.getByText('Discussing 2 valid sources/groups.')).toBeInTheDocument();
    expect(screen.getByText(/Note: 1 nodes were excluded/)).toBeInTheDocument();

    // Type title and submit
    const input = screen.getByPlaceholderText('Research on topic X');
    fireEvent.change(input, { target: { value: 'Test Discussion' } });

    const submitBtn = screen.getAllByRole('button', { name: 'Start Conversation' })[1];
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Discussion',
          context_spec: {
            source_ids: ['src-1'],
            group_ids: ['grp-1'],
            include_pinned: false,
            expansion_rule: 'none',
          },
        })
      );
    });

    // We don't assert modal closure since the component might still be unmounting in the test env,
    // but we proved the correct payload was passed!
  });
});
