/**
 * UserDetailInspector Component Tests
 *
 * Tests user detail inspector UI including:
 * - Read-only view mode
 * - Edit mode (admin only)
 * - Form validation
 * - API integration
 * - Permission checks
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { UserDetailInspector } from './UserDetailInspector';
import type { User } from '@/lib/api-client';

// Mock the contexts
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock API client
vi.mock('@/lib/api-client', () => ({
  updateUser: vi.fn(),
}));

// Import mocked modules
import { useAuth } from '@/contexts/AuthContext';
import { updateUser } from '@/lib/api-client';

describe('UserDetailInspector', () => {
  const mockAdminUser = {
    userId: 'admin-user-id',
    accountId: 'test-account-id',
    permissionLevel: 'admin',
    accountType: 'admin',
  };

  const mockUser: User = {
    id: 'user-123',
    account_id: 'test-account-id',
    name: 'John Doe',
    email: 'john@example.com',
    permission_level: 'senior',
    user_class: 'person',
    rank: 2,
    is_active: true,
    created_at: Date.now() - 86400000,
    updated_at: Date.now() - 86400000,
  };

  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: logged in as admin
    (useAuth as any).mockReturnValue({
      user: mockAdminUser,
    });

    // Default: API succeeds
    (updateUser as any).mockResolvedValue({
      ...mockUser,
      name: 'Updated Name',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Read-Only Mode', () => {
    it('should display user details in read-only mode', () => {
      render(<UserDetailInspector user={mockUser} />);

      expect(screen.getByText('User Details')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
      expect(screen.getByText('senior')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should display permission level badge with correct color', () => {
      const { rerender } = render(<UserDetailInspector user={mockUser} />);

      // Senior - green
      expect(screen.getByText('senior').className).toContain('green');

      // Admin - purple
      rerender(<UserDetailInspector user={{ ...mockUser, permission_level: 'admin' }} />);
      expect(screen.getByText('admin').className).toContain('purple');

      // Leader - blue
      rerender(<UserDetailInspector user={{ ...mockUser, permission_level: 'leader' }} />);
      expect(screen.getByText('leader').className).toContain('blue');

      // Junior - slate
      rerender(<UserDetailInspector user={{ ...mockUser, permission_level: 'junior' }} />);
      expect(screen.getByText('junior').className).toContain('slate');
    });

    it('should display inactive badge for inactive users', () => {
      render(<UserDetailInspector user={{ ...mockUser, is_active: false }} />);

      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('should display agent badge for AI agents', () => {
      render(<UserDetailInspector user={{ ...mockUser, user_class: 'agent' }} />);

      expect(screen.getByText('Agent')).toBeInTheDocument();
    });

    it('should display user metadata', () => {
      render(<UserDetailInspector user={mockUser} />);

      // User class
      expect(screen.getByText('human')).toBeInTheDocument();

      // Account ID
      expect(screen.getByText('test-account-id')).toBeInTheDocument();

      // User ID
      expect(screen.getByText('user-123')).toBeInTheDocument();
    });

    it('should format created date correctly', () => {
      const specificDate = new Date('2024-01-15T10:30:00Z').getTime();
      render(<UserDetailInspector user={{ ...mockUser, created_at: specificDate }} />);

      // Should show formatted date (varies by locale)
      expect(screen.getByText(/January 15, 2024/i)).toBeInTheDocument();
    });

    it('should display permission levels guide', () => {
      render(<UserDetailInspector user={mockUser} />);

      expect(screen.getByText('Permission Levels Guide')).toBeInTheDocument();
      expect(screen.getByText('Junior')).toBeInTheDocument();
      expect(screen.getByText('Senior')).toBeInTheDocument();
      expect(screen.getByText('Leader')).toBeInTheDocument();
      expect(screen.getByText('Admin')).toBeInTheDocument();

      // Check descriptions
      expect(screen.getByText(/View-only access/i)).toBeInTheDocument();
      expect(screen.getByText(/Can edit own data/i)).toBeInTheDocument();
      expect(screen.getByText(/Can manage groups/i)).toBeInTheDocument();
      expect(screen.getByText(/Full system access/i)).toBeInTheDocument();
    });
  });

  describe('Edit Mode', () => {
    it('should show "Edit User" button for admin', () => {
      render(<UserDetailInspector user={mockUser} />);

      expect(screen.getByText('Edit User')).toBeInTheDocument();
    });

    it('should not show "Edit User" button for non-admin', () => {
      (useAuth as any).mockReturnValue({
        user: { ...mockAdminUser, permissionLevel: 'junior' },
      });

      render(<UserDetailInspector user={mockUser} />);

      expect(screen.queryByText('Edit User')).not.toBeInTheDocument();
    });

    it('should not show "Edit User" button for current user', () => {
      (useAuth as any).mockReturnValue({
        user: { ...mockAdminUser, userId: 'user-123' },
      });

      render(<UserDetailInspector user={mockUser} />);

      expect(screen.queryByText('Edit User')).not.toBeInTheDocument();
      expect(screen.getByText(/This is your account. Contact an admin/i)).toBeInTheDocument();
    });

    it('should enable form inputs when "Edit User" clicked', async () => {
      render(<UserDetailInspector user={mockUser} />);

      const editButton = screen.getByText('Edit User');
      fireEvent.click(editButton);

      // Form inputs should be enabled
      const nameInput = screen.getByDisplayValue('John Doe');
      expect(nameInput.tagName).toBe('INPUT');

      const emailInput = screen.getByDisplayValue('john@example.com');
      expect(emailInput.tagName).toBe('INPUT');

      const permissionSelect = screen.getByDisplayValue('senior');
      expect(permissionSelect.tagName).toBe('SELECT');

      const activeCheckbox = screen.getByRole('checkbox');
      expect(activeCheckbox).toBeInTheDocument();
    });

    it('should show Save and Cancel buttons in edit mode', () => {
      render(<UserDetailInspector user={mockUser} />);

      const editButton = screen.getByText('Edit User');
      fireEvent.click(editButton);

      expect(screen.getByText('Save Changes')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.queryByText('Edit User')).not.toBeInTheDocument();
    });

    it('should revert to read-only mode when Cancel clicked', async () => {
      render(<UserDetailInspector user={mockUser} />);

      // Enter edit mode
      fireEvent.click(screen.getByText('Edit User'));

      // Make changes
      const nameInput = screen.getByDisplayValue('John Doe');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Jane Doe');

      // Click Cancel
      fireEvent.click(screen.getByText('Cancel'));

      // Should revert to original name
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.queryByDisplayValue('Jane Doe')).not.toBeInTheDocument();

      // Should show Edit button again
      expect(screen.getByText('Edit User')).toBeInTheDocument();
    });
  });

  describe('Form Validation and Updates', () => {
    it('should update name field', async () => {
      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));

      const nameInput = screen.getByDisplayValue('John Doe');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Jane Doe');

      expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument();
    });

    it('should update email field', async () => {
      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));

      const emailInput = screen.getByDisplayValue('john@example.com');
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'jane@example.com');

      expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument();
    });

    it('should update permission level', async () => {
      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));

      const permissionSelect = screen.getByDisplayValue('senior');
      fireEvent.change(permissionSelect, { target: { value: 'admin' } });

      expect(screen.getByDisplayValue('admin')).toBeInTheDocument();
    });

    it('should toggle active status', async () => {
      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));

      const activeCheckbox = screen.getByRole('checkbox');
      expect(activeCheckbox).toBeChecked();

      fireEvent.click(activeCheckbox);
      expect(activeCheckbox).not.toBeChecked();

      fireEvent.click(activeCheckbox);
      expect(activeCheckbox).toBeChecked();
    });

    it('should call updateUser API when Save clicked', async () => {
      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));

      // Make changes
      const nameInput = screen.getByDisplayValue('John Doe');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Jane Doe');

      const permissionSelect = screen.getByDisplayValue('senior');
      fireEvent.change(permissionSelect, { target: { value: 'admin' } });

      // Click Save
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(updateUser).toHaveBeenCalledWith('user-123', {
          name: 'Jane Doe',
          email: 'john@example.com',
          permission_level: 'admin',
          is_active: true,
        });
      });
    });

    it('should call onUpdate callback when save succeeds', async () => {
      const updatedUser = { ...mockUser, name: 'Updated Name' };
      (updateUser as any).mockResolvedValue(updatedUser);

      render(<UserDetailInspector user={mockUser} onUpdate={mockOnUpdate} />);

      fireEvent.click(screen.getByText('Edit User'));

      const nameInput = screen.getByDisplayValue('John Doe');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Updated Name');

      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockOnUpdate).toHaveBeenCalledWith(updatedUser);
      });
    });

    it('should show success message after save', async () => {
      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(screen.getByText(/User updated successfully/i)).toBeInTheDocument();
      });
    });

    it('should exit edit mode after successful save', async () => {
      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(screen.getByText('Edit User')).toBeInTheDocument();
      });

      expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
    });

    it('should show loading state while saving', async () => {
      (updateUser as any).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));
      fireEvent.click(screen.getByText('Save Changes'));

      expect(screen.getByText('Saving...')).toBeInTheDocument();

      // Save button should be disabled
      const saveButton = screen.getByText('Saving...').closest('button');
      expect(saveButton).toBeDisabled();
    });

    it('should disable Cancel button while saving', async () => {
      (updateUser as any).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));
      fireEvent.click(screen.getByText('Save Changes'));

      const cancelButton = screen.getByText('Cancel').closest('button');
      expect(cancelButton).toBeDisabled();
    });
  });

  describe('Error Handling', () => {
    it('should show error message when save fails', async () => {
      (updateUser as any).mockRejectedValue(new Error('Server error'));

      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(screen.getByText('Failed to update user')).toBeInTheDocument();
      });

      expect(screen.getByText('Server error')).toBeInTheDocument();
    });

    it('should stay in edit mode when save fails', async () => {
      (updateUser as any).mockRejectedValue(new Error('Server error'));

      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(screen.getByText('Failed to update user')).toBeInTheDocument();
      });

      // Should still be in edit mode
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
      expect(screen.queryByText('Edit User')).not.toBeInTheDocument();
    });

    it('should preserve form data when save fails', async () => {
      (updateUser as any).mockRejectedValue(new Error('Server error'));

      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));

      const nameInput = screen.getByDisplayValue('John Doe');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Jane Doe');

      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(screen.getByText('Failed to update user')).toBeInTheDocument();
      });

      // Form data should still be there
      expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument();
    });

    it('should clear error when editing again', async () => {
      (updateUser as any).mockRejectedValue(new Error('Server error'));

      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });

      // Make another change
      const nameInput = screen.getByDisplayValue('John Doe');
      await userEvent.type(nameInput, 'X');

      // Error should be cleared
      expect(screen.queryByText('Server error')).not.toBeInTheDocument();
    });

    it('should handle API timeout gracefully', async () => {
      (updateUser as any).mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      );

      render(<UserDetailInspector user={mockUser} />);

      fireEvent.click(screen.getByText('Edit User'));
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(
        () => {
          expect(screen.getByText('Timeout')).toBeInTheDocument();
        },
        { timeout: 6000 }
      );
    });
  });

  describe('Close Handler', () => {
    it('should call onClose when close button clicked', () => {
      render(<UserDetailInspector user={mockUser} onClose={mockOnClose} />);

      const closeButton =
        screen.getByTitle('Close').closest('button') ||
        screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not show close button if onClose not provided', () => {
      render(<UserDetailInspector user={mockUser} />);

      expect(screen.queryByTitle('Close')).not.toBeInTheDocument();
    });
  });

  describe('User Prop Changes', () => {
    it('should reset form when user prop changes', async () => {
      const { rerender } = render(<UserDetailInspector user={mockUser} />);

      // Enter edit mode and make changes
      fireEvent.click(screen.getByText('Edit User'));

      const nameInput = screen.getByDisplayValue('John Doe');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Changed Name');

      // Change user prop
      const newUser = { ...mockUser, id: 'user-456', name: 'Different User' };
      rerender(<UserDetailInspector user={newUser} />);

      // Should exit edit mode and show new user
      expect(screen.getByText('Different User')).toBeInTheDocument();
      expect(screen.queryByDisplayValue('Changed Name')).not.toBeInTheDocument();
      expect(screen.getByText('Edit User')).toBeInTheDocument();
    });

    it('should clear success message when user changes', async () => {
      const { rerender } = render(<UserDetailInspector user={mockUser} />);

      // Save and show success
      fireEvent.click(screen.getByText('Edit User'));
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(screen.getByText(/updated successfully/i)).toBeInTheDocument();
      });

      // Change user
      const newUser = { ...mockUser, id: 'user-456' };
      rerender(<UserDetailInspector user={newUser} />);

      // Success message should be gone
      expect(screen.queryByText(/updated successfully/i)).not.toBeInTheDocument();
    });

    it('should clear errors when user changes', async () => {
      (updateUser as any).mockRejectedValue(new Error('Server error'));

      const { rerender } = render(<UserDetailInspector user={mockUser} />);

      // Trigger error
      fireEvent.click(screen.getByText('Edit User'));
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });

      // Change user
      const newUser = { ...mockUser, id: 'user-456' };
      rerender(<UserDetailInspector user={newUser} />);

      // Error should be gone
      expect(screen.queryByText('Server error')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle user with minimal data', () => {
      const minimalUser: User = {
        id: 'user-123',
        account_id: 'test-account-id',
        name: 'Test User',
        email: 'test@test.com',
        permission_level: 'junior',
        user_class: 'person',
        rank: 1,
        is_active: true,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      render(<UserDetailInspector user={minimalUser} />);

      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('test@test.com')).toBeInTheDocument();
    });

    it('should handle very long names', () => {
      const longName = 'A'.repeat(200);
      render(<UserDetailInspector user={{ ...mockUser, name: longName }} />);

      expect(screen.getByText(longName)).toBeInTheDocument();
    });

    it('should handle special characters in email', () => {
      render(<UserDetailInspector user={{ ...mockUser, email: 'test+tag@example.co.uk' }} />);

      expect(screen.getByText('test+tag@example.co.uk')).toBeInTheDocument();
    });

    it('should handle missing created_at timestamp', () => {
      render(<UserDetailInspector user={{ ...mockUser, created_at: 0 }} />);

      // Should not crash
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('should handle rapid edit/cancel cycles', async () => {
      render(<UserDetailInspector user={mockUser} />);

      for (let i = 0; i < 10; i++) {
        fireEvent.click(screen.getByText('Edit User'));
        fireEvent.click(screen.getByText('Cancel'));
      }

      // Should still work
      expect(screen.getByText('Edit User')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('should handle XSS in user data', () => {
      const xssUser = {
        ...mockUser,
        name: "<script>alert('xss')</script>",
        email: "test<script>alert('xss')</script>@test.com",
      };

      render(<UserDetailInspector user={xssUser} />);

      // Should render as text, not execute
      expect(screen.getByText(/<script>/)).toBeInTheDocument();
      expect(global.alert).not.toHaveBeenCalled();
    });
  });
});
