import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportDataCard } from './ExportDataCard';
import { errorCapture } from '@/services/error-capture.service';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
  getToken: vi.fn(() => 'test-token'),
}));

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

vi.mock('@/services/error-capture.service', () => ({
  errorCapture: {
    capture: vi.fn((error: Error) => ({
      userMessage: error.message,
      technicalMessage: error.message,
    })),
  },
}));

describe('ExportDataCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (global.fetch as any) = vi.fn();

    Object.defineProperty(window.URL, 'createObjectURL', {
      writable: true,
      value: vi.fn(() => 'blob:mock-url'),
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      writable: true,
      value: vi.fn(),
    });

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(window.localStorage, 'getItem').mockReturnValue('test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends selected format in export request URL', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({
        'Content-Disposition': 'attachment; filename="custom-export.csv"',
      }),
      blob: async () => new Blob(['x']),
    });

    render(<ExportDataCard exportFormat="csv" />);
    await userEvent.click(screen.getByRole('button', { name: /export data/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/data/export?format=csv'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });
  });

  it('shows exporting state while request is in flight and resets after completion', async () => {
    let resolveRequest: (value: any) => void = () => {};
    const pendingResponse = new Promise((resolve) => {
      resolveRequest = resolve;
    });

    (global.fetch as any).mockReturnValue(pendingResponse);

    render(<ExportDataCard exportFormat="json" />);
    const button = screen.getByRole('button', { name: /export data/i });
    await userEvent.click(button);

    expect(screen.getByText('Exporting Data...')).toBeInTheDocument();
    expect(button).toBeDisabled();

    resolveRequest({
      ok: true,
      headers: new Headers({
        'Content-Disposition': 'attachment; filename="keimenon-export.json"',
      }),
      blob: async () => new Blob(['{}']),
    });

    await waitFor(() => {
      expect(screen.getByText('Export Data (JSON)')).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });
  });

  it('renders an error message when export fails', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Failed to export data' }),
    });

    render(<ExportDataCard exportFormat="json" />);
    await userEvent.click(screen.getByRole('button', { name: /export data/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to export data')).toBeInTheDocument();
    });

    expect(errorCapture.capture).toHaveBeenCalled();
  });

  it('uses filename from Content-Disposition when provided', async () => {
    const originalCreateElement = document.createElement.bind(document);
    let createdAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: any) => {
      const element = originalCreateElement(tagName as any, options);
      if (String(tagName).toLowerCase() === 'a') {
        createdAnchor = element as HTMLAnchorElement;
      }
      return element;
    }) as any);

    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({
        'Content-Disposition': 'attachment; filename="team-export.csv"',
      }),
      blob: async () => new Blob(['csv']),
    });

    render(<ExportDataCard exportFormat="csv" />);
    await userEvent.click(screen.getByRole('button', { name: /export data/i }));

    await waitFor(() => {
      expect(createdAnchor).not.toBeNull();
    });

    expect(createdAnchor!.download).toBe('team-export.csv');
  });

  it('falls back to extension based filename when header is missing', async () => {
    const originalCreateElement = document.createElement.bind(document);
    let createdAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: any) => {
      const element = originalCreateElement(tagName as any, options);
      if (String(tagName).toLowerCase() === 'a') {
        createdAnchor = element as HTMLAnchorElement;
      }
      return element;
    }) as any);

    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      blob: async () => new Blob(['graphml']),
    });

    render(<ExportDataCard exportFormat="graphml" />);
    await userEvent.click(screen.getByRole('button', { name: /export data/i }));

    await waitFor(() => {
      expect(createdAnchor).not.toBeNull();
    });

    expect(createdAnchor!.download).toBe('keimenon-export.graphml');
  });
});
