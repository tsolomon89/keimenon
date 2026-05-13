/**
 * DataManagementCard Component Tests
 *
 * Tests data clearing operations including:
 * - Stats loading
 * - Confirmation modals
 * - Job creation
 * - Background operations
 * - Error handling
 * - Permission checks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { DataManagementCard, AdminDataManagementCard } from './DataManagementCard';

// Mock the contexts
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
  getToken: vi.fn(() => 'test-token'),
}));

vi.mock('@/contexts/BackgroundOperationsContext', () => ({
  useBackgroundOperations: vi.fn(),
}));

vi.mock('@/lib/env.config', () => ({
  API_BASE_URL: 'http://localhost:3000',
}));

// Mock api-client — authenticatedFetch delegates to global.fetch so tests can
// control responses via global.fetch mocks without JWT decode issues.
// Preserves the real function's token-guard behavior for auth edge-case tests.
vi.mock('@/lib/api-client', () => ({
  authenticatedFetch: vi.fn((url: string, init?: RequestInit) => {
    const token = localStorage.getItem('keimenon_token');
    if (!token) {
      return Promise.reject(new Error('Not authenticated'));
    }
    return global.fetch(url, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string>),
        Authorization: `Bearer ${token}`,
      },
    });
  }),
}));

// Mock useJobStream (relative path to avoid alias issues)
vi.mock('../../hooks/useJobStream', () => ({
  useJobStream: vi.fn(),
}));

vi.mock('@/services/error-capture.service', () => ({
  errorCapture: {
    capture: vi.fn((error) => ({
      userMessage: error.message,
      technicalMessage: error.message,
    })),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/lib/error-handler', () => ({
  logJobEvent: vi.fn(),
}));

// Import mocked modules
import { useAuth } from '@/contexts/AuthContext';
import { useBackgroundOperations } from '@/contexts/BackgroundOperationsContext';
// Import the mocked hook to manipulate it
import { useJobStream } from '../../hooks/useJobStream';

describe('DataManagementCard', () => {
  const mockUser = {
    userId: 'test-user-id',
    accountId: 'test-account-id',
    permissionLevel: 'admin',
    accountType: 'admin',
    email: 'test@example.com',
    isAuthenticated: true,
  };

  const mockAddOperation = vi.fn();
  // Cast the mock to the correct type for usage
  const mockUseJobStream = useJobStream as unknown as ReturnType<typeof vi.fn>;

  const mockStats = {
    nodes: [
      { kind: 'Message', count: 100 },
      { kind: 'Source', count: 10 },
      { kind: 'ChatThread', count: 5 },
    ],
    edges: 200,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (useAuth as any).mockReturnValue({ user: mockUser });
    (useBackgroundOperations as any).mockReturnValue({
      addOperation: mockAddOperation,
      getOperation: vi.fn(),
      updateOperation: vi.fn(),
    });

    // Default mock implementation for useJobStream
    mockUseJobStream.mockReturnValue({
      jobs: new Map(),
      connected: true,
      error: null,
      removeJobs: vi.fn(),
    });

    // Mock fetch with logging
    global.fetch = vi.fn((url: RequestInfo | URL, options?: RequestInit) => {
      console.log(`[TEST FETCH] Call to: ${url}`, options);
      return Promise.resolve({
        ok: true,
        json: async () => ({ stats: mockStats }), // Default success
      } as Response);
    });

    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(() => 'test-token'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // Mock confirm
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('should render data management card', () => {
      render(<DataManagementCard />);

      // Use getAllByText because heading and button both contain 'Clear Keimenon Data'
      expect(screen.getAllByText(/Clear Keimenon Data/i).length).toBeGreaterThan(0);
    });

    it('should show warning message', () => {
      render(<DataManagementCard />);

      expect(screen.getByText(/Delete all imported conversations/i)).toBeInTheDocument();
    });

    it('should show "Clear Keimenon Data" button', () => {
      render(<DataManagementCard />);

      const clearButton = screen.getByRole('button', { name: /Clear Keimenon Data/i });
      expect(clearButton).toBeInTheDocument();
    });
  });

  describe('Stats Loading', () => {
    it('should load stats when "Clear Keimenon Data" clicked', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stats: mockStats }),
      });

      render(<DataManagementCard />);

      const clearButton = screen.getByRole('button', { name: /Clear Keimenon Data/i });
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/data/stats'),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
            }),
          })
        );
      });
    });

    it('should display stats in confirmation modal', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stats: mockStats }),
      });

      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        // Should show total nodes
        expect(screen.getByText(/115/)).toBeInTheDocument(); // 100 + 10 + 5

        // Should show total edges
        expect(screen.getByText(/200/)).toBeInTheDocument();
      });
    });

    it('should show breakdown of node types', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stats: mockStats }),
      });

      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/Message/)).toBeInTheDocument();
        expect(screen.getByText(/100/)).toBeInTheDocument();

        expect(screen.getByText(/Source/)).toBeInTheDocument();
        expect(screen.getByText(/10/)).toBeInTheDocument();

        expect(screen.getByText(/ChatThread/)).toBeInTheDocument();
        expect(screen.getByText(/5/)).toBeInTheDocument();
      });
    });

    it('should handle stats loading error', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Failed to load stats'));

      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/Failed to load stats/i)).toBeInTheDocument();
      });
    });

    it('should still show confirmation modal on stats error', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Stats error'));

      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        // Modal should still open even if stats fail — check for modal title
        expect(screen.getByText(/Clear All Keimenon Data/i)).toBeInTheDocument();
      });
    });
  });

  describe('Delete Job Creation', () => {
    beforeEach(() => {
      // Mock stats endpoint
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/v1/data/stats')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ stats: mockStats }),
          });
        }
        if (url.includes('/api/v1/jobs/delete')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ jobId: 'job_123', message: 'Job created' }),
          });
        }
        return Promise.reject(new Error(`Unknown endpoint: ${url}`));
      });
    });

    it('should create delete job when confirmed', async () => {
      // Create user event instance for this test
      const user = userEvent.setup();
      render(<DataManagementCard />);

      // Open modal
      const clearButton = screen.getByRole('button', { name: /Clear Keimenon Data/i });
      await user.click(clearButton);

      // Wait for stats to load
      try {
        await waitFor(() => {
          expect(screen.getByText(/115/)).toBeInTheDocument();
        });
      } catch (e) {
        screen.debug();
        throw e;
      }

      // Click confirm
      const confirmButton = screen.getByRole('button', { name: /Clear Data/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/jobs/delete'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify({ scope: 'keimenon' }),
          })
        );
      });
    });

    it('should add operation to background context', async () => {
      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/115/)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /Clear Data/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockAddOperation).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'job_123',
            type: 'deletion',
            title: 'Clearing keimenon data',
            status: 'processing',
            stats: expect.objectContaining({
              nodesToDelete: 115,
              edgesToDelete: 200,
            }),
          })
        );
      });
    });

    it('should close modal after job created', async () => {
      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/115/)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /Clear Data/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should show success message after job created', async () => {
      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/115/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Clear Data/i }));

      // Component auto-minimizes and closes modal, then shows success in the card
      await waitFor(() => {
        expect(screen.getByText(/Delete job created/i)).toBeInTheDocument();
      });
    });

    it('should handle delete job creation error', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/v1/data/stats')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ stats: mockStats }),
          });
        }
        if (url.includes('/api/v1/jobs/delete')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({ error: 'Server error' }),
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/115/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Clear Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/Server error/i)).toBeInTheDocument();
      });

      // Modal should still be open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('Auto-Minimize Functionality', () => {
    beforeEach(() => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/v1/data/stats')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ stats: mockStats }),
          });
        }
        if (url.includes('/api/v1/jobs/delete')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ jobId: 'job_123' }),
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });
    });

    it('should auto-minimize and add to background operations after job created', async () => {
      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/115/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Clear Data/i }));

      // Component auto-minimizes: calls addOperation and closes modal
      await waitFor(() => {
        expect(mockAddOperation).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'job_123',
            type: 'deletion',
            status: 'processing',
          })
        );
      });
    });

    it('should close modal after auto-minimize', async () => {
      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/115/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Clear Data/i }));

      // Modal should close automatically after job creation
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should show success message after auto-minimize', async () => {
      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/115/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Clear Data/i }));

      // Success message should appear in the card after modal closes
      await waitFor(() => {
        expect(screen.getByText(/Delete job created/i)).toBeInTheDocument();
      });
    });
  });

  describe('Modal Cancel', () => {
    beforeEach(() => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stats: mockStats }),
      });
    });

    it('should close modal when Cancel clicked', async () => {
      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/115/)).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should not create job when cancelled', async () => {
      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/115/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

      // Should not call delete endpoint
      const deleteCalls = (global.fetch as any).mock.calls.filter((call: any) =>
        call[0].includes('/api/v1/jobs/delete')
      );
      expect(deleteCalls).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty stats', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stats: { nodes: [], edges: 0 } }),
      });

      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/0/)).toBeInTheDocument();
      });

      // Should still allow deletion (edge case)
      expect(screen.getByRole('button', { name: /Clear Data/i })).toBeInTheDocument();
    });

    it('should handle missing token', async () => {
      (window.localStorage.getItem as any).mockReturnValue(null);

      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/Not authenticated/i)).toBeInTheDocument();
      });
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
      });
    });

    it('should open clear confirmation when Clear button clicked', async () => {
      (global.fetch as any).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<DataManagementCard />);

      const clearButton = screen.getByRole('button', { name: /Clear Keimenon Data/i });
      fireEvent.click(clearButton);

      // Clicking the button should open the confirmation modal
      await waitFor(() => {
        expect(screen.getByText(/permanently delete/i)).toBeInTheDocument();
      });
    });
  });
});

describe('AdminDataManagementCard', () => {
  const mockAdminUser = {
    userId: 'admin-user-id',
    accountId: 'admin-account-id',
    permissionLevel: 'admin',
    accountType: 'admin',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (useAuth as any).mockReturnValue({ user: mockAdminUser });
    (useBackgroundOperations as any).mockReturnValue({
      addOperation: vi.fn(),
      getOperation: vi.fn(),
      updateOperation: vi.fn(),
    });

    // useJobStream must be mocked for AdminDataManagementCard
    (useJobStream as any).mockReturnValue({
      jobs: new Map(),
      connected: true,
      error: null,
      removeJobs: vi.fn(),
    });

    // Fetch must return a valid response (not undefined)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stats: { nodes: [], edges: 0 } }),
    });

    const localStorageMock = {
      getItem: vi.fn(() => 'admin-token'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    global.confirm = vi.fn(() => true);
  });

  it('should render admin data management card', () => {
    render(<AdminDataManagementCard />);

    expect(screen.getAllByText(/Clear All Client Data/i).length).toBeGreaterThan(0);
  });

  it('should show admin-only warning', () => {
    render(<AdminDataManagementCard />);

    expect(screen.getByText(/Delete keimenon data for ALL client accounts/i)).toBeInTheDocument();
  });

  it('should use correct delete scope', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/data/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ stats: { nodes: [], edges: 0 } }),
        });
      }
      if (url.includes('/api/v1/data/all-clients')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ jobId: 'job_123', cleared_accounts: 3 }),
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });

    render(<AdminDataManagementCard />);

    fireEvent.click(screen.getByRole('button', { name: /Clear All Client Data/i }));

    await waitFor(() => {
      // After clicking the main button, a modal opens with a confirm button.
      // There are now TWO buttons with matching text — use getAllByRole and pick the modal's one.
      const buttons = screen.getAllByRole('button', { name: /Clear All Client Data/i });
      // The second button is the modal's confirm button
      const confirmButton = buttons[buttons.length - 1];
      fireEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/data/all-clients'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  it('should only be visible to admin users', () => {
    (useAuth as any).mockReturnValue({
      user: { ...mockAdminUser, accountType: 'client' },
    });

    const { container } = render(<AdminDataManagementCard />);

    // Component should not render for non-admin
    expect(container.firstChild).toBeNull();
  });
});
