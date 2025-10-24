/**
 * Settings Workflow E2E Test
 *
 * Tests complete settings management workflow:
 * - Load settings from API (multi-scope: user, account, system)
 * - Edit settings → Preview changes → Apply/Revert
 * - Unsaved changes tracking and warnings
 * - Settings validation (types, constraints)
 * - Scope-based permission checks
 * - Settings categories (General, Notifications, Privacy, etc.)
 * - Bulk updates and atomicity
 * - Error handling and rollback
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsPage } from '../settings/SettingsPage';
import { AuthContext } from '../../contexts/AuthContext';
import { OperatingContext } from '../../contexts/OperatingContext';
import * as apiClient from '../../lib/api-client';

// Mock API client
vi.mock('../../lib/api-client');

describe('Settings Workflow E2E', () => {
  const mockAdminUser = {
    userId: 'admin-user-id',
    accountId: 'admin-account-id',
    email: 'admin@admin.com',
    name: 'Admin User',
    permissionLevel: 'admin' as const,
    accountType: 'admin' as const,
    accountClass: 'business' as const,
    rank: 4,
    isActive: true,
  };

  const mockRegularUser = {
    userId: 'regular-user-id',
    accountId: 'regular-account-id',
    email: 'user@example.com',
    name: 'Regular User',
    permissionLevel: 'junior' as const,
    accountType: 'client' as const,
    accountClass: 'free' as const,
    rank: 1,
    isActive: true,
  };

  const mockSettings = [
    {
      id: 'setting-1',
      key: 'notifications.email',
      value: 'true',
      scope: 'user',
      category: 'notifications',
      description: 'Receive email notifications',
    },
    {
      id: 'setting-2',
      key: 'notifications.browser',
      value: 'false',
      scope: 'user',
      category: 'notifications',
      description: 'Receive browser notifications',
    },
    {
      id: 'setting-3',
      key: 'theme.mode',
      value: 'light',
      scope: 'user',
      category: 'appearance',
      description: 'Color theme',
    },
    {
      id: 'setting-4',
      key: 'account.name',
      value: 'My Organization',
      scope: 'account',
      category: 'general',
      description: 'Organization name',
    },
    {
      id: 'setting-5',
      key: 'account.retention_days',
      value: '90',
      scope: 'account',
      category: 'data',
      description: 'Data retention period',
    },
  ];

  const defaultAuthContext = {
    user: mockAdminUser,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    selectAccount: vi.fn(),
    switchAccount: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };

  const defaultOperatingContext = {
    operating: {
      mode: 'native' as const,
      accountId: mockAdminUser.accountId,
      accountType: mockAdminUser.accountType,
      accountName: 'Test Account',
      serviceMode: false,
    },
    switchAccount: vi.fn(),
    exitOperatingMode: vi.fn(),
    getOperatingHeaders: vi.fn(() => ({})),
    isOperatingMode: false,
  };

  const renderWithProviders = (
    user: typeof mockAdminUser | typeof mockRegularUser = mockAdminUser,
    operatingOverrides = {}
  ) => {
    const authContext = { ...defaultAuthContext, user };
    const operatingContext = { ...defaultOperatingContext, ...operatingOverrides };

    return render(
      <AuthContext.Provider value={authContext}>
        <OperatingContext.Provider value={operatingContext}>
          <SettingsPage />
        </OperatingContext.Provider>
      </AuthContext.Provider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default API mocks
    vi.mocked(apiClient.fetchSettings).mockResolvedValue(mockSettings);
    vi.mocked(apiClient.updateSetting).mockImplementation(async (id, value) => ({
      ...mockSettings.find((s) => s.id === id)!,
      value,
    }));
    vi.mocked(apiClient.bulkUpdateSettings).mockImplementation(async (updates) => {
      return updates.map((u) => ({
        ...mockSettings.find((s) => s.id === u.id)!,
        value: u.value,
      }));
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Complete Settings Edit Workflow', () => {
    it('should complete full Edit → Preview → Apply workflow', async () => {
      renderWithProviders();

      // 1. Wait for settings to load
      await waitFor(() => {
        expect(apiClient.fetchSettings).toHaveBeenCalled();
      });

      // 2. Verify settings displayed
      await waitFor(() => {
        expect(screen.getByText(/Receive email notifications/i)).toBeInTheDocument();
      });

      // 3. Toggle email notifications setting
      const emailToggle = screen.getByLabelText(/Receive email notifications/i);
      expect(emailToggle).toBeChecked(); // Initial value is 'true'

      fireEvent.click(emailToggle);

      // 4. Verify toggle changed
      expect(emailToggle).not.toBeChecked();

      // 5. Verify unsaved changes indicator appears
      await waitFor(() => {
        expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
      });

      // 6. Click "Preview Changes" button
      const previewButton = screen.getByRole('button', { name: /Preview Changes/i });
      fireEvent.click(previewButton);

      // 7. Verify preview modal shows changes
      await waitFor(() => {
        expect(screen.getByText(/notifications\.email/i)).toBeInTheDocument();
        expect(screen.getByText(/true → false/i)).toBeInTheDocument();
      });

      // 8. Click "Apply Changes" button
      const applyButton = screen.getByRole('button', { name: /Apply Changes/i });
      fireEvent.click(applyButton);

      // 9. Verify API called with updates
      await waitFor(() => {
        expect(apiClient.updateSetting).toHaveBeenCalledWith('setting-1', 'false');
      });

      // 10. Verify success message shown
      await waitFor(() => {
        expect(screen.getByText(/successfully/i)).toBeInTheDocument();
      });

      // 11. Verify unsaved changes indicator removed
      expect(screen.queryByText(/Unsaved changes/i)).not.toBeInTheDocument();
    });

    it('should revert changes when Revert clicked', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText(/Receive email notifications/i)).toBeInTheDocument();
      });

      // Toggle setting
      const emailToggle = screen.getByLabelText(/Receive email notifications/i);
      fireEvent.click(emailToggle);

      // Verify changed
      expect(emailToggle).not.toBeChecked();

      // Click Revert
      const revertButton = screen.getByRole('button', { name: /Revert/i });
      fireEvent.click(revertButton);

      // Verify reverted to original value
      await waitFor(() => {
        expect(emailToggle).toBeChecked();
      });

      // Unsaved changes indicator should be gone
      expect(screen.queryByText(/Unsaved changes/i)).not.toBeInTheDocument();

      // API should not have been called
      expect(apiClient.updateSetting).not.toHaveBeenCalled();
    });

    it('should handle bulk settings update', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText(/Receive email notifications/i)).toBeInTheDocument();
      });

      // Change multiple settings
      const emailToggle = screen.getByLabelText(/Receive email notifications/i);
      const browserToggle = screen.getByLabelText(/Receive browser notifications/i);

      fireEvent.click(emailToggle);
      fireEvent.click(browserToggle);

      // Verify unsaved changes count
      await waitFor(() => {
        expect(screen.getByText(/2 unsaved changes/i)).toBeInTheDocument();
      });

      // Apply changes
      const applyButton = screen.getByRole('button', { name: /Apply Changes/i });
      fireEvent.click(applyButton);

      // Verify bulk update API called
      await waitFor(() => {
        expect(apiClient.bulkUpdateSettings).toHaveBeenCalledWith([
          { id: 'setting-1', value: 'false' },
          { id: 'setting-2', value: 'true' },
        ]);
      });
    });
  });

  describe('Settings Categories', () => {
    it('should organize settings by category', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText(/Notifications/i)).toBeInTheDocument();
        expect(screen.getByText(/Appearance/i)).toBeInTheDocument();
        expect(screen.getByText(/General/i)).toBeInTheDocument();
        expect(screen.getByText(/Data/i)).toBeInTheDocument();
      });
    });

    it('should expand/collapse category sections', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText(/Receive email notifications/i)).toBeInTheDocument();
      });

      // Find Notifications category header
      const notificationsHeader = screen.getByText(/Notifications/i).closest('button');
      expect(notificationsHeader).toBeTruthy();

      // Click to collapse
      fireEvent.click(notificationsHeader!);

      // Settings should be hidden
      await waitFor(() => {
        expect(screen.queryByText(/Receive email notifications/i)).not.toBeVisible();
      });

      // Click to expand
      fireEvent.click(notificationsHeader!);

      // Settings should be visible again
      await waitFor(() => {
        expect(screen.getByText(/Receive email notifications/i)).toBeVisible();
      });
    });
  });

  describe('Scope-Based Permissions', () => {
    it('should allow users to edit user-scoped settings', async () => {
      renderWithProviders(mockRegularUser);

      await waitFor(() => {
        expect(screen.getByText(/Receive email notifications/i)).toBeInTheDocument();
      });

      // User-scoped setting should be editable
      const emailToggle = screen.getByLabelText(/Receive email notifications/i);
      expect(emailToggle).not.toBeDisabled();
    });

    it('should prevent non-admins from editing account-scoped settings', async () => {
      renderWithProviders(mockRegularUser);

      await waitFor(() => {
        expect(screen.getByText(/Organization name/i)).toBeInTheDocument();
      });

      // Account-scoped setting should be disabled for non-admin
      const orgNameInput = screen.getByLabelText(/Organization name/i);
      expect(orgNameInput).toBeDisabled();
    });

    it('should allow admins to edit all settings', async () => {
      renderWithProviders(mockAdminUser);

      await waitFor(() => {
        expect(screen.getByText(/Organization name/i)).toBeInTheDocument();
      });

      // Admin should be able to edit account-scoped settings
      const orgNameInput = screen.getByLabelText(/Organization name/i);
      expect(orgNameInput).not.toBeDisabled();
    });
  });

  describe('Settings Validation', () => {
    it('should validate number type settings', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByLabelText(/Data retention period/i)).toBeInTheDocument();
      });

      // Enter invalid number
      const retentionInput = screen.getByLabelText(/Data retention period/i);
      fireEvent.change(retentionInput, { target: { value: 'invalid' } });

      // Try to apply
      const applyButton = screen.getByRole('button', { name: /Apply Changes/i });
      fireEvent.click(applyButton);

      // Validation error should appear
      await waitFor(() => {
        expect(screen.getByText(/must be a number/i)).toBeInTheDocument();
      });

      // API should not be called
      expect(apiClient.updateSetting).not.toHaveBeenCalled();
    });

    it('should validate range constraints', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByLabelText(/Data retention period/i)).toBeInTheDocument();
      });

      // Enter number outside valid range (assume 1-365)
      const retentionInput = screen.getByLabelText(/Data retention period/i);
      fireEvent.change(retentionInput, { target: { value: '999' } });

      // Try to apply
      const applyButton = screen.getByRole('button', { name: /Apply Changes/i });
      fireEvent.click(applyButton);

      // Validation error should appear
      await waitFor(() => {
        expect(screen.getByText(/between 1 and 365/i)).toBeInTheDocument();
      });
    });

    it('should validate required fields', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByLabelText(/Organization name/i)).toBeInTheDocument();
      });

      // Clear required field
      const orgNameInput = screen.getByLabelText(/Organization name/i);
      fireEvent.change(orgNameInput, { target: { value: '' } });

      // Try to apply
      const applyButton = screen.getByRole('button', { name: /Apply Changes/i });
      fireEvent.click(applyButton);

      // Validation error should appear
      await waitFor(() => {
        expect(screen.getByText(/required/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when update fails', async () => {
      vi.mocked(apiClient.updateSetting).mockRejectedValue(new Error('Failed to update setting'));

      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText(/Receive email notifications/i)).toBeInTheDocument();
      });

      // Toggle setting
      const emailToggle = screen.getByLabelText(/Receive email notifications/i);
      fireEvent.click(emailToggle);

      // Apply changes
      const applyButton = screen.getByRole('button', { name: /Apply Changes/i });
      fireEvent.click(applyButton);

      // Error message should appear
      await waitFor(() => {
        expect(screen.getByText(/Failed to update setting/i)).toBeInTheDocument();
      });

      // Unsaved changes should still be shown
      expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
    });

    it('should rollback on partial bulk update failure', async () => {
      vi.mocked(apiClient.bulkUpdateSettings).mockRejectedValue(new Error('Partial update failed'));

      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText(/Receive email notifications/i)).toBeInTheDocument();
      });

      // Change multiple settings
      const emailToggle = screen.getByLabelText(/Receive email notifications/i);
      const browserToggle = screen.getByLabelText(/Receive browser notifications/i);

      fireEvent.click(emailToggle);
      fireEvent.click(browserToggle);

      // Apply changes
      const applyButton = screen.getByRole('button', { name: /Apply Changes/i });
      fireEvent.click(applyButton);

      // Error message should appear
      await waitFor(() => {
        expect(screen.getByText(/failed/i)).toBeInTheDocument();
      });

      // Settings should be reverted to original values
      expect(emailToggle).toBeChecked(); // Original value
      expect(browserToggle).not.toBeChecked(); // Original value
    });

    it('should handle API errors when loading settings', async () => {
      vi.mocked(apiClient.fetchSettings).mockRejectedValue(new Error('Failed to load settings'));

      renderWithProviders();

      // Error message should appear
      await waitFor(() => {
        expect(screen.getByText(/Failed to load settings/i)).toBeInTheDocument();
      });
    });
  });

  describe('Unsaved Changes Warning', () => {
    it('should warn when navigating away with unsaved changes', async () => {
      const mockSetActiveView = vi.fn();

      renderWithProviders(mockAdminUser, {
        setActiveView: mockSetActiveView,
      });

      await waitFor(() => {
        expect(screen.getByText(/Receive email notifications/i)).toBeInTheDocument();
      });

      // Toggle setting
      const emailToggle = screen.getByLabelText(/Receive email notifications/i);
      fireEvent.click(emailToggle);

      // Try to navigate away (simulate clicking on Canvas view)
      const canvasButton = screen.getByRole('button', { name: /Canvas/i });
      fireEvent.click(canvasButton);

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
        expect(screen.getByText(/Are you sure/i)).toBeInTheDocument();
      });

      // Cancel navigation
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      // Should stay on Settings page
      expect(mockSetActiveView).not.toHaveBeenCalled();
    });

    it('should allow navigation after discarding changes', async () => {
      const mockSetActiveView = vi.fn();

      renderWithProviders(mockAdminUser, {
        setActiveView: mockSetActiveView,
      });

      await waitFor(() => {
        expect(screen.getByText(/Receive email notifications/i)).toBeInTheDocument();
      });

      // Toggle setting
      const emailToggle = screen.getByLabelText(/Receive email notifications/i);
      fireEvent.click(emailToggle);

      // Try to navigate away
      const canvasButton = screen.getByRole('button', { name: /Canvas/i });
      fireEvent.click(canvasButton);

      // Confirm discard
      await waitFor(() => {
        const discardButton = screen.getByRole('button', { name: /Discard/i });
        fireEvent.click(discardButton);
      });

      // Should navigate
      expect(mockSetActiveView).toHaveBeenCalledWith('canvas');
    });
  });
});
