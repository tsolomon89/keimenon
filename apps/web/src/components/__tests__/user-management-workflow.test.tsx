/**
 * User Management Workflow E2E Test
 *
 * Tests complete user CRUD workflow from Settings to Inspector:
 * - Settings page → Users section → UsersListCard display
 * - User row click → Inspector panel opens → UserDetailInspector
 * - Edit user → Form validation → API call → Success feedback
 * - Permission-based access control (admin vs non-admin)
 * - User deletion with confirmation
 * - Create new user workflow
 * - Multi-user scenarios
 * - Error handling throughout
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KeimenonLayout } from '../keimenon/KeimenonLayout';
import { AuthContext } from '../../contexts/AuthContext';
import { OperatingContext } from '../../contexts/OperatingContext';
import { ShellContext } from '../../contexts/ShellContext';
import * as apiClient from '../../lib/api-client';

// Mock API client
vi.mock('../../lib/api-client');

// Mock child components that aren't relevant to this test
vi.mock('../keimenon/KeimenonViewport', () => ({
  KeimenonViewport: () => <div data-testid="keimenon-viewport">Keimenon Viewport</div>,
}));

vi.mock('../keimenon/KeimenonToolbar', () => ({
  KeimenonToolbar: () => <div data-testid="keimenon-toolbar">Keimenon Toolbar</div>,
}));

vi.mock('../keimenon/KeimenonHeader', () => ({
  KeimenonHeader: () => <div data-testid="keimenon-header">Keimenon Header</div>,
}));

vi.mock('../keimenon/KeimenonFooter', () => ({
  KeimenonFooter: () => <div data-testid="keimenon-footer">Keimenon Footer</div>,
}));

describe('User Management Workflow E2E', () => {
  const mockAdminUser = {
    userId: 'admin-user-id',
    accountId: 'admin-account-id',
    email: 'admin@admin.com',
    name: 'Admin User',
    permissionLevel: 'admin' as const,
    accountType: 'admin' as const,
    accountClass: 'business' as const,
    isActive: true,
  };

  const mockRegularUser = {
    userId: 'regular-user-id',
    accountId: 'admin-account-id',
    email: 'user@example.com',
    name: 'Regular User',
    permissionLevel: 'user' as const,
    accountType: 'user' as const,
    accountClass: 'free' as const,
    isActive: true,
  };

  const mockUsers = [
    {
      id: 'user-1',
      account_id: 'test-account-id',
      name: 'Alice Anderson',
      email: 'alice@example.com',
      permission_level: 'admin' as const,
      user_class: 'person' as const,
      rank: 4,
      is_active: true,
      created_at: Date.parse('2024-01-01T00:00:00Z'),
      updated_at: Date.parse('2024-01-01T00:00:00Z'),
    },
    {
      id: 'user-2',
      account_id: 'test-account-id',
      name: 'Bob Builder',
      email: 'bob@example.com',
      permission_level: 'junior' as const,
      user_class: 'person' as const,
      rank: 1,
      is_active: true,
      created_at: Date.parse('2024-01-02T00:00:00Z'),
      updated_at: Date.parse('2024-01-02T00:00:00Z'),
    },
    {
      id: 'user-3',
      account_id: 'test-account-id',
      name: 'Charlie Chen',
      email: 'charlie@example.com',
      permission_level: 'junior' as const,
      user_class: 'person' as const,
      rank: 1,
      is_active: false,
      created_at: Date.parse('2024-01-03T00:00:00Z'),
      updated_at: Date.parse('2024-01-03T00:00:00Z'),
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
    operatingContextVersion: 0,
  };

  const defaultShellContext = {
    shellMode: 'admin' as const,
    keimenonMode: 'keimenon' as const,
    setShellMode: vi.fn(),
    setKeimenonMode: vi.fn(),
    leftSidebarOpen: true,
    setLeftSidebarOpen: vi.fn(),
    rightSidebarOpen: false,
    setRightSidebarOpen: vi.fn(),
    inspectorPanel: null,
    setInspectorPanel: vi.fn(),
    canAccessPortal: vi.fn(() => true),
    isAdminShell: vi.fn(() => true),
  };

  const renderWithProviders = (
    user: typeof mockAdminUser | typeof mockRegularUser = mockAdminUser,
    overrides = {}
  ) => {
    const authContext = { ...defaultAuthContext, user } as any;
    const operatingContext = { ...defaultOperatingContext, ...overrides };
    const shellContext = { ...defaultShellContext };

    return render(
      <AuthContext.Provider value={authContext}>
        <OperatingContext.Provider value={operatingContext}>
          <ShellContext.Provider value={shellContext}>
            <KeimenonLayout
              showUploadModal={false}
              onShowUploadModal={vi.fn()}
              onOpenUpload={vi.fn()}
              showChatImportModal={false}
              onShowChatImportModal={vi.fn()}
              onOpenChatImport={vi.fn()}
            />
          </ShellContext.Provider>
        </OperatingContext.Provider>
      </AuthContext.Provider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default API mocks
    vi.mocked(apiClient.getAccountUsers).mockResolvedValue({ users: mockUsers });
    vi.mocked(apiClient.updateUser).mockImplementation(async (userId, data) => ({
      user: {
        ...mockUsers.find((u) => u.id === userId)!,
        ...data,
      },
    }));
    vi.mocked(apiClient.deleteUser).mockResolvedValue({ message: 'User deleted successfully' });
    vi.mocked(apiClient.createUser).mockResolvedValue({
      user: {
        id: 'new-user-id',
        account_id: mockAdminUser.accountId,
        name: 'New User',
        email: 'new@example.com',
        permission_level: 'junior',
        user_class: 'person',
        rank: 1,
        is_active: true,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Complete User Management Flow', () => {
    it('should complete full user edit workflow from Settings to Inspector', async () => {
      renderWithProviders(mockAdminUser, { activeView: 'settings' });

      // 1. Verify Settings page loads
      expect(screen.getByText(/Settings/i)).toBeInTheDocument();

      // 2. Wait for users to load
      await waitFor(() => {
        expect(apiClient.getAccountUsers).toHaveBeenCalled();
      });

      // 3. Verify UsersListCard displays users
      await waitFor(() => {
        expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
        expect(screen.getByText('Bob Builder')).toBeInTheDocument();
        expect(screen.getByText('Charlie Chen')).toBeInTheDocument();
      });

      // 4. Click on user row to open inspector
      const aliceRow = screen.getByText('Alice Anderson').closest('tr');
      expect(aliceRow).toBeTruthy();
      fireEvent.click(aliceRow!);

      // 5. Verify right sidebar opens with UserDetailInspector
      await waitFor(() => {
        expect(defaultShellContext.setRightSidebarOpen).toHaveBeenCalledWith(true);
        expect(defaultShellContext.setInspectorPanel).toHaveBeenCalledWith('user-detail');
      });

      // 6. Verify user details displayed in read-only mode
      await waitFor(() => {
        expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
        expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      });

      // 7. Click "Edit User" button
      const editButton = screen.getByRole('button', { name: /Edit User/i });
      fireEvent.click(editButton);

      // 8. Form inputs should be enabled
      await waitFor(() => {
        const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
        expect(nameInput).not.toBeDisabled();
        expect(nameInput.value).toBe('Alice Anderson');
      });

      // 9. Modify user name
      const nameInput = screen.getByLabelText(/Name/i);
      fireEvent.change(nameInput, { target: { value: 'Alice Anderson-Smith' } });

      // 10. Click Save button
      const saveButton = screen.getByRole('button', { name: /Save/i });
      fireEvent.click(saveButton);

      // 11. Verify API called with updated data
      await waitFor(() => {
        expect(apiClient.updateUser).toHaveBeenCalledWith('user-1', {
          name: 'Alice Anderson-Smith',
          email: 'alice@example.com',
          permission_level: 'admin',
          is_active: true,
        });
      });

      // 12. Verify success message shown
      await waitFor(() => {
        expect(screen.getByText(/successfully/i)).toBeInTheDocument();
      });

      // 13. Verify form returns to read-only mode
      await waitFor(() => {
        const nameInputAfter = screen.getByLabelText(/Name/i) as HTMLInputElement;
        expect(nameInputAfter).toBeDisabled();
      });
    });

    it('should handle user deletion workflow with confirmation', async () => {
      renderWithProviders(mockAdminUser, { activeView: 'settings' });

      // Wait for users to load
      await waitFor(() => {
        expect(screen.getByText('Bob Builder')).toBeInTheDocument();
      });

      // Click delete button for Bob
      const bobRow = screen.getByText('Bob Builder').closest('tr');
      const deleteButton = within(bobRow!).getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Confirmation modal should appear
      await waitFor(() => {
        expect(screen.getByText(/Are you sure/i)).toBeInTheDocument();
      });

      // Click confirm
      const confirmButton = screen.getByRole('button', { name: /Confirm/i });
      fireEvent.click(confirmButton);

      // Verify API called
      await waitFor(() => {
        expect(apiClient.deleteUser).toHaveBeenCalledWith('user-2');
      });

      // Verify user removed from list
      await waitFor(() => {
        expect(screen.queryByText('Bob Builder')).not.toBeInTheDocument();
      });
    });

    it('should create new user workflow', async () => {
      renderWithProviders(mockAdminUser, { activeView: 'settings' });

      // Wait for page to load
      await waitFor(() => {
        expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
      });

      // Click "Add User" button
      const addButton = screen.getByRole('button', { name: /Add User/i });
      fireEvent.click(addButton);

      // Modal should open
      await waitFor(() => {
        expect(screen.getByText(/New User/i)).toBeInTheDocument();
      });

      // Fill in form
      fireEvent.change(screen.getByLabelText(/Name/i), {
        target: { value: 'New User' },
      });
      fireEvent.change(screen.getByLabelText(/Email/i), {
        target: { value: 'new@example.com' },
      });

      // Submit form
      const createButton = screen.getByRole('button', { name: /Create/i });
      fireEvent.click(createButton);

      // Verify API called
      await waitFor(() => {
        expect(apiClient.createUser).toHaveBeenCalledWith({
          name: 'New User',
          email: 'new@example.com',
          permission_level: 'user',
        });
      });

      // Verify new user appears in list
      await waitFor(() => {
        expect(screen.getByText('New User')).toBeInTheDocument();
      });
    });
  });

  describe('Permission-Based Access Control', () => {
    it('should allow admin to edit other users', async () => {
      renderWithProviders(mockAdminUser, { activeView: 'settings' });

      await waitFor(() => {
        expect(screen.getByText('Bob Builder')).toBeInTheDocument();
      });

      // Click on Bob (not self)
      const bobRow = screen.getByText('Bob Builder').closest('tr');
      fireEvent.click(bobRow!);

      // Edit button should be visible
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit User/i })).toBeInTheDocument();
      });
    });

    it('should prevent admin from editing themselves', async () => {
      // Mock users with admin user in list
      const usersWithAdmin = [
        ...mockUsers,
        {
          id: mockAdminUser.userId,
          account_id: mockAdminUser.accountId,
          name: mockAdminUser.name,
          email: mockAdminUser.email,
          permission_level: 'admin' as const,
          user_class: 'person' as const,
          rank: 4,
          is_active: true,
          created_at: Date.parse('2024-01-01T00:00:00Z'),
          updated_at: Date.parse('2024-01-01T00:00:00Z'),
        },
      ];

      vi.mocked(apiClient.getAccountUsers).mockResolvedValue({ users: usersWithAdmin });

      renderWithProviders(mockAdminUser, { activeView: 'settings' });

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      });

      // Click on self
      const adminRow = screen.getByText('Admin User').closest('tr');
      fireEvent.click(adminRow!);

      // Edit button should be disabled or hidden
      await waitFor(() => {
        const editButton = screen.queryByRole('button', { name: /Edit User/i });
        expect(editButton).toBeDisabled();
      });
    });

    it('should hide "Add User" button for non-admin users', async () => {
      renderWithProviders(mockRegularUser, { activeView: 'settings' });

      await waitFor(() => {
        expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
      });

      // Add User button should not be visible
      expect(screen.queryByRole('button', { name: /Add User/i })).not.toBeInTheDocument();
    });

    it('should hide delete buttons for non-admin users', async () => {
      renderWithProviders(mockRegularUser, { activeView: 'settings' });

      await waitFor(() => {
        expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
      });

      // Delete buttons should not be visible
      const aliceRow = screen.getByText('Alice Anderson').closest('tr');
      const deleteButton = within(aliceRow!).queryByRole('button', { name: /delete/i });
      expect(deleteButton).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should show error message when user update fails', async () => {
      vi.mocked(apiClient.updateUser).mockRejectedValue(new Error('Failed to update user'));

      renderWithProviders(mockAdminUser, { activeView: 'settings' });

      await waitFor(() => {
        expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
      });

      // Open inspector
      const aliceRow = screen.getByText('Alice Anderson').closest('tr');
      fireEvent.click(aliceRow!);

      // Enter edit mode
      await waitFor(() => {
        const editButton = screen.getByRole('button', { name: /Edit User/i });
        fireEvent.click(editButton);
      });

      // Modify and save
      const nameInput = screen.getByLabelText(/Name/i);
      fireEvent.change(nameInput, { target: { value: 'New Name' } });

      const saveButton = screen.getByRole('button', { name: /Save/i });
      fireEvent.click(saveButton);

      // Error message should appear
      await waitFor(() => {
        expect(screen.getByText(/Failed to update user/i)).toBeInTheDocument();
      });

      // Should stay in edit mode
      expect(nameInput).not.toBeDisabled();
    });

    it('should show error when user deletion fails', async () => {
      vi.mocked(apiClient.deleteUser).mockRejectedValue(new Error('Failed to delete user'));

      renderWithProviders(mockAdminUser, { activeView: 'settings' });

      await waitFor(() => {
        expect(screen.getByText('Bob Builder')).toBeInTheDocument();
      });

      // Try to delete
      const bobRow = screen.getByText('Bob Builder').closest('tr');
      const deleteButton = within(bobRow!).getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Confirm
      await waitFor(() => {
        const confirmButton = screen.getByRole('button', { name: /Confirm/i });
        fireEvent.click(confirmButton);
      });

      // Error message should appear
      await waitFor(() => {
        expect(screen.getByText(/Failed to delete user/i)).toBeInTheDocument();
      });

      // User should still be in list
      expect(screen.getByText('Bob Builder')).toBeInTheDocument();
    });

    it('should handle API errors when loading users list', async () => {
      vi.mocked(apiClient.getAccountUsers).mockRejectedValue(new Error('Failed to load users'));

      renderWithProviders(mockAdminUser, { activeView: 'settings' });

      // Error message should appear
      await waitFor(() => {
        expect(screen.getByText(/Failed to load users/i)).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    it('should validate email format', async () => {
      renderWithProviders(mockAdminUser, { activeView: 'settings' });

      await waitFor(() => {
        expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
      });

      // Open inspector
      const aliceRow = screen.getByText('Alice Anderson').closest('tr');
      fireEvent.click(aliceRow!);

      // Enter edit mode
      await waitFor(() => {
        const editButton = screen.getByRole('button', { name: /Edit User/i });
        fireEvent.click(editButton);
      });

      // Enter invalid email
      const emailInput = screen.getByLabelText(/Email/i);
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });

      // Try to save
      const saveButton = screen.getByRole('button', { name: /Save/i });
      fireEvent.click(saveButton);

      // Validation error should appear
      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeInTheDocument();
      });

      // API should not be called
      expect(apiClient.updateUser).not.toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      renderWithProviders(mockAdminUser, { activeView: 'settings' });

      await waitFor(() => {
        expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
      });

      // Open inspector
      const aliceRow = screen.getByText('Alice Anderson').closest('tr');
      fireEvent.click(aliceRow!);

      // Enter edit mode
      await waitFor(() => {
        const editButton = screen.getByRole('button', { name: /Edit User/i });
        fireEvent.click(editButton);
      });

      // Clear required field
      const nameInput = screen.getByLabelText(/Name/i);
      fireEvent.change(nameInput, { target: { value: '' } });

      // Try to save
      const saveButton = screen.getByRole('button', { name: /Save/i });
      fireEvent.click(saveButton);

      // Validation error should appear
      await waitFor(() => {
        expect(screen.getByText(/required/i)).toBeInTheDocument();
      });

      // API should not be called
      expect(apiClient.updateUser).not.toHaveBeenCalled();
    });
  });

  describe('User Search and Filtering', () => {
    it('should filter users by search term', async () => {
      renderWithProviders(mockAdminUser, { activeView: 'settings' });

      await waitFor(() => {
        expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
        expect(screen.getByText('Bob Builder')).toBeInTheDocument();
        expect(screen.getByText('Charlie Chen')).toBeInTheDocument();
      });

      // Enter search term
      const searchInput = screen.getByPlaceholderText(/Search users/i);
      fireEvent.change(searchInput, { target: { value: 'Bob' } });

      // Only Bob should be visible
      await waitFor(() => {
        expect(screen.getByText('Bob Builder')).toBeInTheDocument();
        expect(screen.queryByText('Alice Anderson')).not.toBeInTheDocument();
        expect(screen.queryByText('Charlie Chen')).not.toBeInTheDocument();
      });
    });

    it('should show inactive users badge', async () => {
      renderWithProviders(mockAdminUser, { activeView: 'settings' });

      await waitFor(() => {
        expect(screen.getByText('Charlie Chen')).toBeInTheDocument();
      });

      // Charlie should have inactive badge
      const charlieRow = screen.getByText('Charlie Chen').closest('tr');
      expect(within(charlieRow!).getByText(/Inactive/i)).toBeInTheDocument();
    });
  });
});
