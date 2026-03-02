import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { URLInputZone } from './URLInputZone';
import * as apiClient from '@/lib/api-client';

vi.mock('@/lib/env.config', () => ({
  API_BASE_URL: 'http://localhost:4001',
}));

// Mock the ingestUrl function from api-client
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual('@/lib/api-client');
  return {
    ...actual,
    ingestUrl: vi.fn(),
  };
});

const mockIngestUrl = vi.mocked(apiClient.ingestUrl);

describe('URLInputZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders URL input field', () => {
    render(<URLInputZone />);
    expect(screen.getByPlaceholderText('https://example.com/article')).toBeInTheDocument();
  });

  it('renders fetch button disabled when input is empty', () => {
    render(<URLInputZone />);
    const fetchButton = screen.getByRole('button', { name: /fetch/i });
    expect(fetchButton).toBeDisabled();
  });

  it('enables fetch button when valid URL is entered', async () => {
    render(<URLInputZone />);
    const input = screen.getByPlaceholderText('https://example.com/article');
    const fetchButton = screen.getByRole('button', { name: /fetch/i });

    await userEvent.type(input, 'https://example.com');
    expect(fetchButton).not.toBeDisabled();
  });

  it('shows error for invalid URL format', async () => {
    render(<URLInputZone />);
    const input = screen.getByPlaceholderText('https://example.com/article');
    const fetchButton = screen.getByRole('button', { name: /fetch/i });

    // Type an invalid URL
    await userEvent.type(input, 'not-a-valid-url');
    await userEvent.click(fetchButton);

    await waitFor(() => {
      expect(screen.getByText(/please enter a valid url/i)).toBeInTheDocument();
    });
  });

  it('shows loading state during fetch', async () => {
    // Create a promise that we can resolve later
    let resolveRequest: (value: apiClient.URLIngestResponse) => void = () => {};
    const pendingResponse = new Promise<apiClient.URLIngestResponse>((resolve) => {
      resolveRequest = resolve;
    });

    mockIngestUrl.mockReturnValue(pendingResponse);

    render(<URLInputZone />);
    const input = screen.getByPlaceholderText('https://example.com/article');

    await userEvent.type(input, 'https://example.com');
    await userEvent.click(screen.getByRole('button', { name: /fetch/i }));

    expect(screen.getByText('Fetching Content...')).toBeInTheDocument();

    // Clean up by resolving the pending promise
    resolveRequest({
      success: true,
      duplicate: false,
      metadata: {
        title: 'Test',
        url: 'https://example.com',
        canonicalUrl: 'https://example.com',
        fetchedAt: Date.now(),
        contentSize: 1000,
        fingerprint: 'abc123',
      },
    });
  });

  it('shows success state with metadata after successful ingest', async () => {
    mockIngestUrl.mockResolvedValue({
      success: true,
      duplicate: false,
      source: { id: 'src_123' },
      metadata: {
        title: 'Example Article',
        author: 'John Doe',
        wordCount: 1500,
        siteName: 'Example.com',
        url: 'https://example.com/article',
        canonicalUrl: 'https://example.com/article',
        fetchedAt: Date.now(),
        contentSize: 5000,
        fingerprint: 'abc123',
      },
    });

    const onSuccess = vi.fn();
    render(<URLInputZone onSuccess={onSuccess} />);

    const input = screen.getByPlaceholderText('https://example.com/article');
    await userEvent.type(input, 'https://example.com/article');
    await userEvent.click(screen.getByRole('button', { name: /fetch/i }));

    await waitFor(() => {
      expect(screen.getByText('URL Ingested Successfully')).toBeInTheDocument();
    });

    expect(screen.getByText('Example Article')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('1,500')).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows duplicate notice when content already exists', async () => {
    mockIngestUrl.mockResolvedValue({
      success: true,
      duplicate: true,
      duplicateOf: 'src_existing_123',
      metadata: {
        title: 'Duplicate Article',
        url: 'https://example.com/duplicate',
        canonicalUrl: 'https://example.com/duplicate',
        fetchedAt: Date.now(),
        contentSize: 3000,
        fingerprint: 'def456',
      },
    });

    render(<URLInputZone />);

    const input = screen.getByPlaceholderText('https://example.com/article');
    await userEvent.type(input, 'https://example.com/duplicate');
    await userEvent.click(screen.getByRole('button', { name: /fetch/i }));

    await waitFor(() => {
      expect(screen.getByText('Duplicate Content Detected')).toBeInTheDocument();
    });

    expect(screen.getByText(/this content already exists/i)).toBeInTheDocument();
    expect(screen.getByText('src_existing_123')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    mockIngestUrl.mockRejectedValue(new Error('URL validation failed'));

    const onError = vi.fn();
    render(<URLInputZone onError={onError} />);

    const input = screen.getByPlaceholderText('https://example.com/article');
    await userEvent.type(input, 'http://192.168.1.1');
    await userEvent.click(screen.getByRole('button', { name: /fetch/i }));

    await waitFor(() => {
      expect(screen.getByText(/url validation failed/i)).toBeInTheDocument();
    });

    expect(onError).toHaveBeenCalled();
  });

  it('allows submitting URL by pressing Enter', async () => {
    mockIngestUrl.mockResolvedValue({
      success: true,
      duplicate: false,
      metadata: {
        title: 'Test',
        url: 'https://example.com',
        canonicalUrl: 'https://example.com',
        fetchedAt: Date.now(),
        contentSize: 1000,
        fingerprint: 'abc123',
      },
    });

    render(<URLInputZone />);

    const input = screen.getByPlaceholderText('https://example.com/article');
    await userEvent.type(input, 'https://example.com{Enter}');

    await waitFor(() => {
      expect(mockIngestUrl).toHaveBeenCalled();
    });
  });

  it('allows ingesting another URL after success', async () => {
    mockIngestUrl.mockResolvedValue({
      success: true,
      duplicate: false,
      metadata: {
        title: 'Test Article',
        url: 'https://example.com',
        canonicalUrl: 'https://example.com',
        fetchedAt: Date.now(),
        contentSize: 1000,
        fingerprint: 'abc123',
      },
    });

    render(<URLInputZone />);

    const input = screen.getByPlaceholderText('https://example.com/article');
    await userEvent.type(input, 'https://example.com');
    await userEvent.click(screen.getByRole('button', { name: /fetch/i }));

    await waitFor(() => {
      expect(screen.getByText('URL Ingested Successfully')).toBeInTheDocument();
    });

    // Click "Ingest Another URL" button
    await userEvent.click(screen.getByRole('button', { name: /ingest another url/i }));

    // Should be back to input state
    expect(screen.getByPlaceholderText('https://example.com/article')).toBeInTheDocument();
  });

  it('passes boardId to API when provided', async () => {
    mockIngestUrl.mockResolvedValue({
      success: true,
      duplicate: false,
      metadata: {
        title: 'Test',
        url: 'https://example.com',
        canonicalUrl: 'https://example.com',
        fetchedAt: Date.now(),
        contentSize: 1000,
        fingerprint: 'abc123',
      },
    });

    render(<URLInputZone boardId="board_123" />);

    const input = screen.getByPlaceholderText('https://example.com/article');
    await userEvent.type(input, 'https://example.com');
    await userEvent.click(screen.getByRole('button', { name: /fetch/i }));

    await waitFor(() => {
      expect(mockIngestUrl).toHaveBeenCalledWith('https://example.com', 'board_123');
    });
  });
});
