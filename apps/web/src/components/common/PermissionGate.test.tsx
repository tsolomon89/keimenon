import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, mockUser, mockAdminUser } from '@/test/test-utils';
import { PermissionGate, PermissionButton, PermissionTooltip } from './PermissionGate';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

describe('PermissionGate', () => {
  describe('Conditional Rendering', () => {
    it('should render children when permission is allowed', () => {
      renderWithProviders(
        <PermissionGate permission="view_canvas">
          <div data-testid="protected-content">Protected Content</div>
        </PermissionGate>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('should not render children when permission is denied', () => {
      renderWithProviders(
        <PermissionGate permission="delete_nodes">
          <div data-testid="protected-content">Protected Content</div>
        </PermissionGate>,
        { authContext: { user: mockUser({ rank: 1 }) } } // Junior cannot delete
      );

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should render nothing when permission denied and no fallback', () => {
      const { container } = renderWithProviders(
        <PermissionGate permission="delete_nodes">
          <div data-testid="protected-content">Protected Content</div>
        </PermissionGate>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Fallback Rendering', () => {
    it('should render fallback when permission is denied', () => {
      renderWithProviders(
        <PermissionGate
          permission="delete_nodes"
          fallback={<div data-testid="fallback">Access Denied</div>}
        >
          <div data-testid="protected-content">Protected Content</div>
        </PermissionGate>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.getByTestId('fallback')).toBeInTheDocument();
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });

    it('should not render fallback when permission is allowed', () => {
      renderWithProviders(
        <PermissionGate
          permission="edit_nodes"
          fallback={<div data-testid="fallback">Access Denied</div>}
        >
          <div data-testid="protected-content">Protected Content</div>
        </PermissionGate>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.queryByTestId('fallback')).not.toBeInTheDocument();
    });
  });

  describe('Reason Display', () => {
    it('should show reason when showReason is true and permission denied', () => {
      renderWithProviders(
        <PermissionGate permission="delete_nodes" showReason={true}>
          <div>Protected Content</div>
        </PermissionGate>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      expect(screen.getByText(/rank 2/i)).toBeInTheDocument();
    });

    it('should not show reason when showReason is false', () => {
      renderWithProviders(
        <PermissionGate permission="delete_nodes" showReason={false}>
          <div>Protected Content</div>
        </PermissionGate>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      expect(screen.queryByText(/rank 2/i)).not.toBeInTheDocument();
    });

    it('should not show reason when permission is allowed', () => {
      renderWithProviders(
        <PermissionGate permission="edit_nodes" showReason={true}>
          <div data-testid="content">Protected Content</div>
        </PermissionGate>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      expect(screen.getByTestId('content')).toBeInTheDocument();
      expect(screen.queryByText(/rank/i)).not.toBeInTheDocument();
    });
  });

  describe('Different Permission Types', () => {
    it('should correctly gate edit_account_settings (requires Leader)', () => {
      const { rerender } = renderWithProviders(
        <PermissionGate permission="edit_account_settings">
          <div data-testid="content">Account Settings</div>
        </PermissionGate>,
        { authContext: { user: mockUser({ rank: 2 }) } } // Senior - should be denied
      );

      expect(screen.queryByTestId('content')).not.toBeInTheDocument();

      // Rerender with Leader rank
      rerender(
        <PermissionGate permission="edit_account_settings">
          <div data-testid="content">Account Settings</div>
        </PermissionGate>
      );

      renderWithProviders(
        <PermissionGate permission="edit_account_settings">
          <div data-testid="content">Account Settings</div>
        </PermissionGate>,
        { authContext: { user: mockUser({ rank: 3 }) } } // Leader - should be allowed
      );

      // Note: After rerender, need to query again
      expect(screen.getAllByTestId('content')[0]).toBeInTheDocument();
    });

    it('should correctly gate edit_global_settings (requires Admin-admin)', () => {
      renderWithProviders(
        <PermissionGate permission="edit_global_settings">
          <div data-testid="content">Global Settings</div>
        </PermissionGate>,
        { authContext: { user: mockUser({ rank: 4, accountType: 'client' }) } }
      );

      expect(screen.queryByTestId('content')).not.toBeInTheDocument();

      renderWithProviders(
        <PermissionGate permission="edit_global_settings">
          <div data-testid="content">Global Settings</div>
        </PermissionGate>,
        { authContext: { user: mockAdminUser({ rank: 4 }) } }
      );

      expect(screen.getAllByTestId('content')[0]).toBeInTheDocument();
    });
  });

  describe('Portal Mode Effects', () => {
    it('should deny write permissions in read-only portal mode', () => {
      renderWithProviders(
        <PermissionGate permission="edit_nodes">
          <div data-testid="content">Edit Content</div>
        </PermissionGate>,
        {
          authContext: { user: mockAdminUser({ rank: 4 }) },
          operatingContext: {
            operating: {
              mode: 'cross-tenant',
              accountId: 'other',
              accountName: 'Other Account',
              serviceMode: false, // Read-only
            },
            isOperatingMode: true,
          },
        }
      );

      expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    });

    it('should allow write permissions in service mode', () => {
      renderWithProviders(
        <PermissionGate permission="edit_nodes">
          <div data-testid="content">Edit Content</div>
        </PermissionGate>,
        {
          authContext: { user: mockAdminUser({ rank: 2 }) },
          operatingContext: {
            operating: {
              mode: 'cross-tenant',
              accountId: 'other',
              accountName: 'Other Account',
              serviceMode: true, // Service mode
            },
            isOperatingMode: true,
          },
        }
      );

      expect(screen.getByTestId('content')).toBeInTheDocument();
    });
  });
});

describe('PermissionButton', () => {
  describe('Button State', () => {
    it('should enable button when permission is allowed', () => {
      renderWithProviders(
        <PermissionButton permission="edit_nodes">
          Edit
        </PermissionButton>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      const button = screen.getByRole('button', { name: /edit/i });
      expect(button).not.toBeDisabled();
    });

    it('should disable button when permission is denied', () => {
      renderWithProviders(
        <PermissionButton permission="delete_nodes">
          Delete
        </PermissionButton>,
        { authContext: { user: mockUser({ rank: 1 }) } } // Junior cannot delete
      );

      const button = screen.getByRole('button', { name: /delete/i });
      expect(button).toBeDisabled();
    });

    it('should respect explicit disabled prop even when permission allowed', () => {
      renderWithProviders(
        <PermissionButton permission="edit_nodes" disabled={true}>
          Edit
        </PermissionButton>,
        { authContext: { user: mockUser({ rank: 2 }) } }
      );

      const button = screen.getByRole('button', { name: /edit/i });
      expect(button).toBeDisabled();
    });
  });

  describe('Click Handling', () => {
    it('should call onClick when permission allowed and button clicked', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      renderWithProviders(
        <PermissionButton permission="edit_nodes" onClick={handleClick}>
          Edit
        </PermissionButton>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      const button = screen.getByRole('button', { name: /edit/i });
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when permission denied', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      renderWithProviders(
        <PermissionButton permission="delete_nodes" onClick={handleClick}>
          Delete
        </PermissionButton>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      const button = screen.getByRole('button', { name: /delete/i });

      // Disabled buttons can't be clicked
      expect(button).toBeDisabled();
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Tooltip/Title', () => {
    it('should show reason as title when permission denied', () => {
      renderWithProviders(
        <PermissionButton permission="delete_nodes">
          Delete
        </PermissionButton>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      const button = screen.getByRole('button', { name: /delete/i });
      expect(button).toHaveAttribute('title');
      expect(button.getAttribute('title')).toContain('rank 2');
    });

    it('should use custom title when permission allowed', () => {
      renderWithProviders(
        <PermissionButton permission="edit_nodes" title="Click to edit">
          Edit
        </PermissionButton>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      const button = screen.getByRole('button', { name: /edit/i });
      expect(button).toHaveAttribute('title', 'Click to edit');
    });

    it('should override custom title with reason when permission denied', () => {
      renderWithProviders(
        <PermissionButton permission="delete_nodes" title="Custom title">
          Delete
        </PermissionButton>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      const button = screen.getByRole('button', { name: /delete/i });
      expect(button.getAttribute('title')).not.toBe('Custom title');
      expect(button.getAttribute('title')).toContain('rank 2');
    });
  });

  describe('Custom Classes', () => {
    it('should apply custom className', () => {
      renderWithProviders(
        <PermissionButton permission="edit_nodes" className="custom-class">
          Edit
        </PermissionButton>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      const button = screen.getByRole('button', { name: /edit/i });
      expect(button).toHaveClass('custom-class');
    });

    it('should add opacity-50 and cursor-not-allowed when permission denied', () => {
      renderWithProviders(
        <PermissionButton permission="delete_nodes" className="custom-class">
          Delete
        </PermissionButton>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      const button = screen.getByRole('button', { name: /delete/i });
      expect(button.className).toContain('opacity-50');
      expect(button.className).toContain('cursor-not-allowed');
    });
  });
});

describe('PermissionTooltip', () => {
  describe('Tooltip Display', () => {
    it('should render children normally when permission allowed', () => {
      renderWithProviders(
        <PermissionTooltip permission="edit_nodes">
          <button>Edit</button>
        </PermissionTooltip>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      const button = screen.getByRole('button', { name: /edit/i });
      expect(button).toBeInTheDocument();
    });

    it('should wrap children with tooltip container when permission denied', () => {
      renderWithProviders(
        <PermissionTooltip permission="delete_nodes">
          <button>Delete</button>
        </PermissionTooltip>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      const button = screen.getByRole('button', { name: /delete/i });
      expect(button.parentElement).toHaveClass('relative', 'group');
    });

    it('should show reason message when permission denied', () => {
      const { container } = renderWithProviders(
        <PermissionTooltip permission="delete_nodes">
          <button>Delete</button>
        </PermissionTooltip>,
        { authContext: { user: mockUser({ rank: 1 }) } }
      );

      // The tooltip is rendered but hidden (opacity-0)
      const tooltipText = container.querySelector('.opacity-0');
      expect(tooltipText).toBeTruthy();
      expect(tooltipText?.textContent).toContain('rank 2');
    });
  });

  describe('Different Permissions', () => {
    it('should show admin-specific reasons for admin-only features', () => {
      const { container } = renderWithProviders(
        <PermissionTooltip permission="access_crm">
          <button>CRM</button>
        </PermissionTooltip>,
        { authContext: { user: mockUser({ rank: 4, accountType: 'client' }) } }
      );

      const tooltipText = container.querySelector('.opacity-0');
      expect(tooltipText?.textContent).toContain('Admin account required');
    });

    it('should show portal-specific reasons for portal mode restrictions', () => {
      const { container } = renderWithProviders(
        <PermissionTooltip permission="edit_nodes">
          <button>Edit</button>
        </PermissionTooltip>,
        {
          authContext: { user: mockAdminUser({ rank: 3 }) },
          operatingContext: {
            operating: {
              mode: 'cross-tenant',
              accountId: 'other',
              accountName: 'Other Account',
              serviceMode: false,
            },
            isOperatingMode: true,
          },
        }
      );

      const tooltipText = container.querySelector('.opacity-0');
      expect(tooltipText?.textContent).toContain('read-only');
      expect(tooltipText?.textContent).toContain('Service Mode');
    });
  });
});
