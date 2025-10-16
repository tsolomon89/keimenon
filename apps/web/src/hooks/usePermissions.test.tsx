import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermissions } from './usePermissions';
import { ProvidersWrapper, mockUser, mockAdminUser } from '@/test/test-utils';

describe('usePermissions', () => {
  describe('No User (Unauthenticated)', () => {
    it('should deny all permissions when user is null', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: null }}>{children}</ProvidersWrapper>
        ),
      });

      expect(result.current.canViewCanvas).toBe(false);
      expect(result.current.canEditNodes).toBe(false);
      expect(result.current.canDeleteNodes).toBe(false);
      expect(result.current.canManageGroups).toBe(false);
      expect(result.current.canUploadSources).toBe(false);
      expect(result.current.canAccessCRM).toBe(false);
      expect(result.current.canAccessPortal).toBe(false);
    });

    it('should return "Not authenticated" reason for checkPermission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: null }}>{children}</ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('edit_nodes');
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('Not authenticated');
    });
  });

  describe('Client Users - Rank Based Permissions', () => {
    it('should allow junior (rank 1) to view and edit in native mode', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 1, permissionLevel: 'junior' }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.canViewCanvas).toBe(true);
      expect(result.current.canEditNodes).toBe(true);
      expect(result.current.canUploadSources).toBe(true);
      expect(result.current.rank).toBe(1);
    });

    it('should deny junior (rank 1) from deleting and managing groups', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 1, permissionLevel: 'junior' }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.canDeleteNodes).toBe(false);
      expect(result.current.canManageGroups).toBe(false);
      expect(result.current.canEditAccountSettings).toBe(false);
    });

    it('should allow senior (rank 2) to delete nodes and manage groups', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 2, permissionLevel: 'senior' }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.canEditNodes).toBe(true);
      expect(result.current.canDeleteNodes).toBe(true);
      expect(result.current.canManageGroups).toBe(true);
      expect(result.current.canExportData).toBe(true);
    });

    it('should allow leader (rank 3) to edit account settings', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 3, permissionLevel: 'leader' }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.canEditAccountSettings).toBe(true);
      expect(result.current.canManageUsers).toBe(true);
    });

    it('should deny client users from accessing CRM and Portal', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 3, accountType: 'client' }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.canAccessCRM).toBe(false);
      expect(result.current.canAccessPortal).toBe(false);
      expect(result.current.canSwitchAccounts).toBe(false);
    });
  });

  describe('Admin Users - Rank Based Permissions', () => {
    it('should allow admin-junior (rank 1) basic permissions', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockAdminUser({ rank: 1, permissionLevel: 'junior' }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.isAdmin).toBe(true);
      expect(result.current.canAccessCRM).toBe(true);
      expect(result.current.canAccessPortal).toBe(true);
      expect(result.current.canViewAuditLog).toBe(false); // Needs rank 2+
    });

    it('should allow admin-senior (rank 2) to view audit log', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockAdminUser({ rank: 2, permissionLevel: 'senior' }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.canViewAuditLog).toBe(true);
      expect(result.current.canEditGlobalSettings).toBe(false); // Needs rank 4
    });

    it('should allow admin-admin (rank 4) to edit global settings', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockAdminUser({ rank: 4, permissionLevel: 'admin' }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.canEditGlobalSettings).toBe(true);
      expect(result.current.canViewAuditLog).toBe(true);
      expect(result.current.canAccessCRM).toBe(true);
    });
  });

  describe('Operating Mode - Read-Only Portal', () => {
    it('should deny write operations in read-only portal mode', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper
            authContext={{ user: mockAdminUser({ rank: 4 }) }}
            operatingContext={{
              operating: {
                mode: 'cross-tenant',
                accountId: 'other_account',
                accountName: 'Other Account',
                serviceMode: false, // Read-only
              },
              isOperatingMode: true,
            }}
          >
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.inReadOnlyMode).toBe(true);
      expect(result.current.canEditNodes).toBe(false);
      expect(result.current.canDeleteNodes).toBe(false);
      expect(result.current.canManageGroups).toBe(false);
      expect(result.current.canUploadSources).toBe(false);
      expect(result.current.canEditAccountSettings).toBe(false);
    });

    it('should still allow read operations in read-only mode', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper
            authContext={{ user: mockAdminUser({ rank: 2 }) }}
            operatingContext={{
              operating: {
                mode: 'cross-tenant',
                accountId: 'other_account',
                accountName: 'Other Account',
                serviceMode: false,
              },
              isOperatingMode: true,
            }}
          >
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.canViewCanvas).toBe(true);
      expect(result.current.canExportData).toBe(true); // Read operation
    });
  });

  describe('Operating Mode - Service Mode (Write Access)', () => {
    it('should allow write operations in service mode', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper
            authContext={{ user: mockAdminUser({ rank: 2 }) }}
            operatingContext={{
              operating: {
                mode: 'cross-tenant',
                accountId: 'other_account',
                accountName: 'Other Account',
                serviceMode: true, // Service mode enabled
              },
              isOperatingMode: true,
            }}
          >
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.inServiceMode).toBe(true);
      expect(result.current.canEditNodes).toBe(true);
      expect(result.current.canDeleteNodes).toBe(true);
      expect(result.current.canEditNodesInPortal).toBe(true);
    });

    it('should respect rank restrictions even in service mode', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper
            authContext={{ user: mockAdminUser({ rank: 1 }) }} // Junior
            operatingContext={{
              operating: {
                mode: 'cross-tenant',
                accountId: 'other_account',
                accountName: 'Other Account',
                serviceMode: true,
              },
              isOperatingMode: true,
            }}
          >
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.canEditNodes).toBe(true); // Rank 1+
      expect(result.current.canDeleteNodes).toBe(false); // Needs rank 2+
      expect(result.current.canDeleteNodesInPortal).toBe(false); // Needs rank 2+
    });
  });

  describe('checkPermission - Detailed Reasons', () => {
    it('should provide specific reason for rank ceiling', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 1 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('delete_nodes');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('rank 2');
    });

    it('should provide reason for read-only mode', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper
            authContext={{ user: mockAdminUser({ rank: 3 }) }}
            operatingContext={{
              operating: {
                mode: 'cross-tenant',
                accountId: 'other',
                accountName: 'Other',
                serviceMode: false,
              },
              isOperatingMode: true,
            }}
          >
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('edit_nodes');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('read-only');
      expect(check.reason).toContain('Service Mode');
    });

    it('should provide reason for admin-only features', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 4, accountType: 'client' }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const editGlobal = result.current.checkPermission('edit_global_settings');
      expect(editGlobal.allowed).toBe(false);
      expect(editGlobal.reason).toContain('Admin account required');

      const accessCRM = result.current.checkPermission('access_crm');
      expect(accessCRM.allowed).toBe(false);
      expect(accessCRM.reason).toContain('Admin account required');
    });

    it('should provide reason for admin-admin required features', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockAdminUser({ rank: 3 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('edit_global_settings');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Admin-admin required');
    });
  });

  describe('checkPermission - All Permission Types', () => {
    it('should correctly check view_canvas permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser() }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('view_canvas');
      expect(check.allowed).toBe(true);
    });

    it('should correctly check edit_nodes permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 1 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('edit_nodes');
      expect(check.allowed).toBe(true);
    });

    it('should correctly check delete_nodes permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 2 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('delete_nodes');
      expect(check.allowed).toBe(true);
    });

    it('should correctly check manage_groups permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 2 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('manage_groups');
      expect(check.allowed).toBe(true);
    });

    it('should correctly check upload_sources permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 1 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('upload_sources');
      expect(check.allowed).toBe(true);
    });

    it('should correctly check export_data permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 2 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('export_data');
      expect(check.allowed).toBe(true);
    });

    it('should correctly check view_settings permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 1 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('view_settings');
      expect(check.allowed).toBe(true);
    });

    it('should correctly check edit_account_settings permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 3 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('edit_account_settings');
      expect(check.allowed).toBe(true);
    });

    it('should correctly check edit_global_settings permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockAdminUser({ rank: 4 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('edit_global_settings');
      expect(check.allowed).toBe(true);
    });

    it('should correctly check manage_users permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 3 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('manage_users');
      expect(check.allowed).toBe(true);
    });

    it('should correctly check view_audit_log permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockAdminUser({ rank: 2 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('view_audit_log');
      expect(check.allowed).toBe(true);
    });

    it('should correctly check switch_accounts permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockAdminUser({ rank: 1 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('switch_accounts');
      expect(check.allowed).toBe(true);
    });

    it('should correctly check access_crm permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockAdminUser({ rank: 1 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('access_crm');
      expect(check.allowed).toBe(true);
    });

    it('should correctly check access_portal permission', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockAdminUser({ rank: 1 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      const check = result.current.checkPermission('access_portal');
      expect(check.allowed).toBe(true);
    });
  });

  describe('getRankName', () => {
    it('should return correct rank names', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 2 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.getRankName(1)).toBe('Junior');
      expect(result.current.getRankName(2)).toBe('Senior');
      expect(result.current.getRankName(3)).toBe('Leader');
      expect(result.current.getRankName(4)).toBe('Admin');
      expect(result.current.getRankName(999)).toBe('Unknown');
    });

    it('should use current user rank if no parameter provided', () => {
      const { result } = renderHook(() => usePermissions(), {
        wrapper: ({ children }) => (
          <ProvidersWrapper authContext={{ user: mockUser({ rank: 3 }) }}>
            {children}
          </ProvidersWrapper>
        ),
      });

      expect(result.current.getRankName()).toBe('Leader');
    });
  });
});
