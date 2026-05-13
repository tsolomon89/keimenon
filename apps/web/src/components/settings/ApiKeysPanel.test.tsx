import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiKeysPanel } from './ApiKeysPanel';

vi.mock('@/lib/env.config', () => ({
  API_BASE_URL: 'http://localhost:4001',
}));

// Mock api-client — authenticatedFetch delegates to global.fetch so tests can
// control responses via global.fetch mocks without JWT decode issues.
vi.mock('@/lib/api-client', () => ({
  authenticatedFetch: vi.fn((url: string, init?: RequestInit) =>
    global.fetch(url, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string>),
        Authorization: `Bearer ${localStorage.getItem('keimenon_token') || 'test-token'}`,
      },
    })
  ),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { userId: 'test-user', accountId: 'test-account', permissionLevel: 'admin' },
  }),
  getToken: vi.fn(() => 'test-token'),
}));

describe('ApiKeysPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window.localStorage, 'getItem').mockReturnValue('test-token');
    (global.fetch as any) = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockListKeys(keys: Array<{ provider: string; hint: string }>) {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        keys: keys.map((k) => ({ ...k, createdAt: Date.now(), updatedAt: Date.now() })),
      }),
    });
  }

  it('renders all provider cards after loading', async () => {
    mockListKeys([]);

    render(<ApiKeysPanel />);

    await waitFor(() => {
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
      expect(screen.getByText('Google Gemini')).toBeInTheDocument();
      expect(screen.getByText('Groq')).toBeInTheDocument();
    });
  });

  it('fetches stored keys on mount via GET /api/v1/settings/api-keys', async () => {
    mockListKeys([]);

    render(<ApiKeysPanel />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/settings/api-keys'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });
  });

  it('shows hint badges for stored keys', async () => {
    mockListKeys([
      { provider: 'openai', hint: 'ab12' },
      { provider: 'anthropic', hint: 'cd34' },
    ]);

    render(<ApiKeysPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Stored.*ab12/)).toBeInTheDocument();
      expect(screen.getByText(/Stored.*cd34/)).toBeInTheDocument();
    });

    // Groq should show "Not Configured"
    const notConfiguredBadges = screen.getAllByText('Not Configured');
    expect(notConfiguredBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('saves key via POST /api/v1/settings/api-keys', async () => {
    mockListKeys([]);

    render(<ApiKeysPanel />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
    });

    // Type a key into the OpenAI input (found by placeholder)
    const openaiInput = screen.getByPlaceholderText(/Enter your OpenAI API Key/i);
    await userEvent.type(openaiInput, 'sk-test-key-12345');

    // Mock the save response
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        provider: 'openai',
        hint: '2345',
        message: 'API key stored successfully',
      }),
    });

    // Click the first Save button
    const saveButtons = screen.getAllByRole('button', { name: /save/i });
    await userEvent.click(saveButtons[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/settings/api-keys'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('sk-test-key-12345'),
        })
      );
    });
  });

  it('shows error state when save fails with validation error', async () => {
    mockListKeys([]);

    render(<ApiKeysPanel />);

    await waitFor(() => {
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
    });

    const openaiInput = screen.getByPlaceholderText(/Enter your OpenAI API Key/i);
    await userEvent.type(openaiInput, 'invalid-key');

    // Mock the save failure
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Invalid API key for OpenAI',
      }),
    });

    const saveButtons = screen.getAllByRole('button', { name: /save/i });
    await userEvent.click(saveButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Invalid API key for OpenAI')).toBeInTheDocument();
    });
  });

  it('deletes key via DELETE /api/v1/settings/api-keys/:provider', async () => {
    mockListKeys([{ provider: 'openai', hint: 'ab12' }]);

    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ApiKeysPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Stored.*ab12/)).toBeInTheDocument();
    });

    // Mock the delete response
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    // Click the delete button (Trash2 icon button with title "Remove Key")
    const deleteButton = screen.getByTitle('Remove Key');
    await userEvent.click(deleteButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/settings/api-keys/openai'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  it('shows loading state while fetching keys', () => {
    // Don't resolve the fetch — will show loading
    (global.fetch as any).mockReturnValue(new Promise(() => {}));

    render(<ApiKeysPanel />);

    expect(screen.getByText('Loading API keys...')).toBeInTheDocument();
  });

  it('shows error when initial fetch fails', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Server error' }),
    });

    render(<ApiKeysPanel />);

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});
