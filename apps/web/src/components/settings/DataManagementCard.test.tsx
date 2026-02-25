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
import { DataManagementCard, AdminDataManagementCard } from './DataManagementCard';

// Mock the contexts
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/contexts/BackgroundOperationsContext', () => ({
  useBackgroundOperations: vi.fn(),
}));

vi.mock('@/lib/env.config', () => ({
  API_BASE_URL: 'http://localhost:3000',
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
  },
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
    global.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('should render data management card', () => {
      render(<DataManagementCard />);

      expect(screen.getByText(/Clear Keimenon Data/i)).toBeInTheDocument();
    });

    it('should show warning message', () => {
      render(<DataManagementCard />);

      expect(
        screen.getByText(/This action will delete all your nodes and edges/i)
      ).toBeInTheDocument();
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
        expect(screen.getByText('115')).toBeInTheDocument(); // 100 + 10 + 5

        // Should show total edges
        expect(screen.getByText('200')).toBeInTheDocument();
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
        expect(screen.getByText('Message')).toBeInTheDocument();
        expect(screen.getByText('100')).toBeInTheDocument();

        expect(screen.getByText('Source')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument();

        expect(screen.getByText('ChatThread')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
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
        // Modal should still open even if stats fail
        expect(screen.getByText(/Are you sure/i)).toBeInTheDocument();
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
      render(<DataManagementCard />);

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      // Wait for stats to load
      try {
        await waitFor(() => {
          expect(screen.getByText('115')).toBeInTheDocument();
        });
      } catch (e) {
        screen.debug();
        throw e;
      }

      // Click confirm
      const confirmButton = screen.getByRole('button', { name: /Confirm Delete/i });
      fireEvent.click(confirmButton);

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
        expect(screen.getByText('115')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /Confirm Delete/i });
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
        expect(screen.getByText('115')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /Confirm Delete/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should show success message after job created', async () => {
      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText('115')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Confirm Delete/i }));

      await waitFor(() => {
        expect(screen.getByText(/Delete job created! Monitor progress/i)).toBeInTheDocument();
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
        expect(screen.getByText('115')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Confirm Delete/i }));

      await waitFor(() => {
        expect(screen.getByText(/Server error/i)).toBeInTheDocument();
      });

      // Modal should still be open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('Minimize Functionality', () => {
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

    it('should show minimize button after job started', async () => {
      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText('115')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Confirm Delete/i }));

      await waitFor(() => {
        expect(screen.getByText(/Minimize/i)).toBeInTheDocument();
      });
    });

    it('should add to background operations when minimized', async () => {
      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText('115')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Confirm Delete/i }));

      await waitFor(() => {
        expect(screen.getByText(/Minimize/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Minimize/i));

      expect(mockAddOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'job_123',
          type: 'deletion',
          status: 'processing',
        })
      );
    });

    it('should close modal when minimized', async () => {
      render(<DataManagementCard />);

      fireEvent.click(screen.getByRole('button', { name: /Clear Keimenon Data/i }));

      await waitFor(() => {
        expect(screen.getByText('115')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Confirm Delete/i }));

      await waitFor(() => {
        expect(screen.getByText(/Minimize/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Minimize/i));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
        expect(screen.getByText('115')).toBeInTheDocument();
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
        expect(screen.getByText('115')).toBeInTheDocument();
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
        expect(screen.getByText('0')).toBeInTheDocument();
      });

      // Should still allow deletion (edge case)
      expect(screen.getByRole('button', { name: /Confirm Delete/i })).toBeInTheDocument();
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

    it('should disable button while loading stats', async () => {
      (global.fetch as any).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<DataManagementCard />);

      const clearButton = screen.getByRole('button', { name: /Clear Keimenon Data/i });
      fireEvent.click(clearButton);

      // Button should be disabled
      await waitFor(() => {
        expect(clearButton).toBeDisabled();
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
    });

    global.fetch = vi.fn();

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

    expect(screen.getByText(/Clear All Client Data/i)).toBeInTheDocument();
  });

  it('should show admin-only warning', () => {
    render(<AdminDataManagementCard />);

    expect(screen.getByText(/This is an admin-only operation/i)).toBeInTheDocument();
  });

  it('should use correct delete scope', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/data/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ stats: { nodes: [], edges: 0 } }),
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

    render(<AdminDataManagementCard />);

    fireEvent.click(screen.getByRole('button', { name: /Clear All Client Data/i }));

    await waitFor(() => {
      const confirmButton = screen.getByRole('button', { name: /Confirm Delete/i });
      fireEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/jobs/delete'),
        expect.objectContaining({
          body: JSON.stringify({ scope: 'all-clients' }),
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
