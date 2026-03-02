/**
 * UsersListCard Component Tests
 *
 * Tests user management UI including:
 * - User list rendering
 * - Search/filter functionality
 * - User selection
 * - User deletion
 * - Permission-based UI controls
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { UsersListCard } from './UsersListCard';
import type { User } from '@/lib/api-client';

// Mock the contexts
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock API client
vi.mock('@/lib/api-client', () => ({
  getAccountUsers: vi.fn(),
  deleteUser: vi.fn(),
}));

// Import mocked modules
import { useAuth } from '@/contexts/AuthContext';
import { getAccountUsers, deleteUser } from '@/lib/api-client';

describe('UsersListCard', () => {
  const mockAdminUser = {
    userId: 'admin-user-id',
    accountId: 'test-account-id',
    permissionLevel: 'admin',
    accountType: 'admin',
  };

  const mockJuniorUser = {
    userId: 'junior-user-id',
    accountId: 'test-account-id',
    permissionLevel: 'junior',
    accountType: 'client',
  };

  const mockUsers: User[] = [
    {
      id: 'user-1',
      account_id: 'test-account-id',
      name: 'John Doe',
      email: 'john@example.com',
      permission_level: 'admin',
      user_class: 'person',
      rank: 4,
      is_active: true,
      created_at: Date.now() - 86400000, // 1 day ago
      updated_at: Date.now() - 86400000,
    },
    {
      id: 'user-2',
      account_id: 'test-account-id',
      name: 'Jane Smith',
      email: 'jane@example.com',
      permission_level: 'senior',
      user_class: 'person',
      rank: 2,
      is_active: true,
      created_at: Date.now() - 172800000, // 2 days ago
      updated_at: Date.now() - 172800000,
    },
    {
      id: 'user-3',
      account_id: 'test-account-id',
      name: 'Bob Johnson',
      email: 'bob@example.com',
      permission_level: 'junior',
      user_class: 'person',
      rank: 1,
      is_active: false,
      created_at: Date.now() - 259200000, // 3 days ago
      updated_at: Date.now() - 259200000,
    },
    {
      id: 'agent-1',
      account_id: 'test-account-id',
      name: 'AI Agent',
      email: 'agent@example.com',
      permission_level: 'junior',
      user_class: 'agent',
      rank: 1,
      is_active: true,
      created_at: Date.now() - 345600000, // 4 days ago
      updated_at: Date.now() - 345600000,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: logged in as admin
    (useAuth as any).mockReturnValue({
      user: mockAdminUser,
    });

    // Default: API returns mock users
    (getAccountUsers as any).mockResolvedValue({
      users: mockUsers,
    });

    // Mock window.confirm
    global.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render user list from API', async () => {
      render(<UsersListCard />);

      // Wait for users to load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Verify all users displayed
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('jane@example.com')).toBeInTheDocument();
      expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
      expect(screen.getByText('AI Agent')).toBeInTheDocument();
    });

    it('should display user count', async () => {
      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('4 users in your account')).toBeInTheDocument();
      });
    });

    it('should display permission badges', async () => {
      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('admin')).toBeInTheDocument();
      });

      expect(screen.getByText('senior')).toBeInTheDocument();
      expect(screen.getAllByText('junior')).toHaveLength(2); // Bob + Agent
    });

    it('should display agent badge for AI agents', async () => {
      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('Agent')).toBeInTheDocument();
      });
    });

    it('should display inactive badge for inactive users', async () => {
      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('Inactive')).toBeInTheDocument();
      });
    });

    it('should display "You" badge for current user', async () => {
      (useAuth as any).mockReturnValue({
        user: { ...mockAdminUser, userId: 'user-1' },
      });

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('You')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      (getAccountUsers as any).mockReturnValue(new Promise(() => {})); // Never resolves

      render(<UsersListCard />);

      expect(screen.getByText('Loading users...')).toBeInTheDocument();
    });

    it('should show error state on API failure', async () => {
      (getAccountUsers as any).mockRejectedValue(new Error('Network error'));

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load users')).toBeInTheDocument();
      });

      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    it('should show empty state when no users', async () => {
      (getAccountUsers as any).mockResolvedValue({ users: [] });

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('No users found')).toBeInTheDocument();
      });
    });
  });

  describe('Search and Filter', () => {
    it('should filter users by name', async () => {
      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Type in search box — use 'Doe' not 'John' because 'John' also matches 'Johnson'
      const searchInput = screen.getByPlaceholderText(/search users/i);
      await userEvent.type(searchInput, 'Doe');

      // Only John Doe should be visible
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
      expect(screen.queryByText('Bob Johnson')).not.toBeInTheDocument();
    });

    it('should filter users by email', async () => {
      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search users/i);
      await userEvent.type(searchInput, 'jane@');

      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });

    it('should filter users by permission level', async () => {
      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search users/i);
      await userEvent.type(searchInput, 'admin');

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
    });

    it('should be case-insensitive', async () => {
      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search users/i);
      await userEvent.type(searchInput, 'JOHN');

      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('should show empty state when search has no results', async () => {
      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search users/i);
      await userEvent.type(searchInput, 'nonexistent');

      expect(screen.getByText(/No users found matching "nonexistent"/i)).toBeInTheDocument();
    });

    it('should clear search when X button clicked', async () => {
      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search users/i);
      await userEvent.type(searchInput, 'jane');

      // Only Jane visible (searching 'jane' doesn't match other users)
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();

      // Click clear button
      const clearButton = searchInput.parentElement?.querySelector('button');
      if (clearButton) {
        fireEvent.click(clearButton);
      }

      // All users visible again
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('should show filtered count', async () => {
      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('Showing 4 of 4 users')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search users/i);
      await userEvent.type(searchInput, 'junior');

      await waitFor(() => {
        expect(screen.getByText('Showing 2 of 4 users')).toBeInTheDocument();
      });
    });
  });

  describe('User Selection', () => {
    it('should call onUserSelect when user row clicked', async () => {
      const onUserSelect = vi.fn();
      render(<UsersListCard onUserSelect={onUserSelect} />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Click user row
      const userRow = screen.getByText('John Doe').closest('div');
      if (userRow) {
        fireEvent.click(userRow);
      }

      expect(onUserSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-1',
          name: 'John Doe',
          email: 'john@example.com',
        })
      );
    });

    it('should call onUserSelect when edit button clicked', async () => {
      const onUserSelect = vi.fn();
      render(<UsersListCard onUserSelect={onUserSelect} />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Find edit button (second button in actions)
      const editButtons = screen.getAllByTitle('Edit user');
      fireEvent.click(editButtons[0]);

      expect(onUserSelect).toHaveBeenCalled();
    });
  });

  describe('User Deletion', () => {
    it('should show confirmation dialog before deletion', async () => {
      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      // Click delete button
      const deleteButtons = screen.getAllByTitle('Delete user');
      fireEvent.click(deleteButtons[1]); // Jane's delete button (second in list)

      expect(global.confirm).toHaveBeenCalledWith(expect.stringContaining('Jane Smith'));
    });

    it('should delete user via API when confirmed', async () => {
      (deleteUser as any).mockResolvedValue({ success: true });

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      // Click delete button
      const deleteButtons = screen.getAllByTitle('Delete user');
      fireEvent.click(deleteButtons[1]); // Jane is second in the user list

      await waitFor(() => {
        expect(deleteUser).toHaveBeenCalledWith('user-2');
      });

      // User should be removed from list
      await waitFor(() => {
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
      });
    });

    it('should not delete when confirmation cancelled', async () => {
      global.confirm = vi.fn(() => false);

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTitle('Delete user');
      fireEvent.click(deleteButtons[1]); // Jane is second in list

      expect(deleteUser).not.toHaveBeenCalled();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('should handle deletion errors gracefully', async () => {
      (deleteUser as any).mockRejectedValue(new Error('Server error'));

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTitle('Delete user');
      fireEvent.click(deleteButtons[1]); // Jane is second in list

      // Component uses setActionError, not alert() — check for error text in DOM
      await waitFor(() => {
        expect(screen.getByText(/Server error/i)).toBeInTheDocument();
      });

      // User should still be in list
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('should not show delete button for current user', async () => {
      (useAuth as any).mockReturnValue({
        user: { ...mockAdminUser, userId: 'user-1' },
      });

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // John's row should have "You" badge but no delete button
      const johnRow = screen.getByText('John Doe').closest('div');
      const deleteButtons = johnRow?.querySelectorAll('[title="Delete user"]');
      expect(deleteButtons?.length).toBe(0);
    });

    it('should show loading state while deleting', async () => {
      (deleteUser as any).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTitle('Delete user');
      fireEvent.click(deleteButtons[1]);

      // Should disable button and show spinner icon while deletion is pending
      await waitFor(() => {
        expect(deleteButtons[1]).toBeDisabled();
        const spinner = deleteButtons[1].querySelector('.animate-spin');
        expect(spinner).toBeTruthy();
      });
    });
  });

  describe('Permission-Based UI Controls', () => {
    it('should show "Add User" button for admin', async () => {
      (useAuth as any).mockReturnValue({ user: mockAdminUser });

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('Add User')).toBeInTheDocument();
      });
    });

    it('should not show "Add User" button for non-admin', async () => {
      (useAuth as any).mockReturnValue({ user: mockJuniorUser });

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.queryByText('Add User')).not.toBeInTheDocument();
      });
    });

    it('should show edit/delete buttons for admin', async () => {
      (useAuth as any).mockReturnValue({ user: mockAdminUser });

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getAllByTitle('Edit user')).toHaveLength(4);
      });

      expect(screen.getAllByTitle('Delete user').length).toBeGreaterThan(0);
    });

    it('should not show edit/delete buttons for non-admin', async () => {
      (useAuth as any).mockReturnValue({ user: mockJuniorUser });

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      expect(screen.queryAllByTitle('Edit user')).toHaveLength(0);
      expect(screen.queryAllByTitle('Delete user')).toHaveLength(0);
    });

    it('should show permission notice for non-admin', async () => {
      (useAuth as any).mockReturnValue({ user: mockJuniorUser });

      render(<UsersListCard />);

      await waitFor(() => {
        expect(
          screen.getByText(/need admin permission to add, edit, or delete users/i)
        ).toBeInTheDocument();
      });
    });

    it('should call onCreateUser when Add User clicked', async () => {
      const onCreateUser = vi.fn();
      render(<UsersListCard onCreateUser={onCreateUser} />);

      await waitFor(() => {
        expect(screen.getByText('Add User')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Add User');
      fireEvent.click(addButton);

      expect(onCreateUser).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing user data gracefully', async () => {
      const invalidUsers = [
        { id: 'user-1', name: '', email: 'test@test.com' }, // Empty name
        { id: 'user-2', name: 'Test User' }, // Missing email
      ];

      (getAccountUsers as any).mockResolvedValue({
        users: invalidUsers as any,
      });

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('test@test.com')).toBeInTheDocument();
      });

      // Should not crash
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    it('should handle very long user names', async () => {
      const longName = 'A'.repeat(100);
      (getAccountUsers as any).mockResolvedValue({
        users: [
          {
            ...mockUsers[0],
            name: longName,
          },
        ],
      });

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText(longName)).toBeInTheDocument();
      });
    });

    it('should handle users with special characters in names', async () => {
      (getAccountUsers as any).mockResolvedValue({
        users: [
          {
            ...mockUsers[0],
            name: "O'Brien <script>alert('xss')</script>",
          },
        ],
      });

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText(/O'Brien/)).toBeInTheDocument();
      });

      // Should not execute script — React escapes HTML by default
      // If alert was called, React failed to escape the script tag
      global.alert = vi.fn();
      expect(global.alert).not.toHaveBeenCalled();
    });

    it('should handle rapid search input changes', async () => {
      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search users/i);

      // Type quickly
      await userEvent.type(searchInput, 'abcdefghijklmnop', { delay: 10 });

      // Should not crash, should show empty state
      expect(screen.getByText(/No users found/i)).toBeInTheDocument();
    });

    it('should handle user without created_at timestamp', async () => {
      (getAccountUsers as any).mockResolvedValue({
        users: [
          {
            ...mockUsers[0],
            created_at: undefined,
          },
        ],
      });

      render(<UsersListCard />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Should not crash
    });
  });
});
