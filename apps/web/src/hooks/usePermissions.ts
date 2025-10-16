import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOperating } from '@/contexts/OperatingContext';

export type Permission =
  | 'view_canvas'
  | 'edit_nodes'
  | 'delete_nodes'
  | 'manage_groups'
  | 'upload_sources'
  | 'export_data'
  | 'view_settings'
  | 'edit_account_settings'
  | 'edit_global_settings'
  | 'manage_users'
  | 'view_audit_log'
  | 'switch_accounts'
  | 'access_crm'
  | 'access_portal';

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Permission Hook - Checks user permissions based on:
 * - User rank (1=junior, 2=senior, 3=leader, 4=admin)
 * - Account type (admin vs client)
 * - Operating mode (native vs cross-tenant)
 * - Service mode (read-only vs write access)
 */
export function usePermissions() {
  const { user } = useAuth();
  const { operating, isOperatingMode } = useOperating();

  const permissions = useMemo(() => {
    if (!user) {
      return {
        canViewCanvas: false,
        canEditNodes: false,
        canDeleteNodes: false,
        canManageGroups: false,
        canUploadSources: false,
        canExportData: false,
        canViewSettings: false,
        canEditAccountSettings: false,
        canEditGlobalSettings: false,
        canManageUsers: false,
        canViewAuditLog: false,
        canSwitchAccounts: false,
        canAccessCRM: false,
        canAccessPortal: false,
      };
    }

    const isAdmin = user.accountType === 'admin';
    const rank = user.rank || 1;
    const inServiceMode = isOperatingMode && operating.serviceMode;
    const inReadOnlyMode = isOperatingMode && !operating.serviceMode;

    return {
      // Basic permissions
      canViewCanvas: true,
      canEditNodes: inReadOnlyMode ? false : rank >= 1, // Junior+ can edit in native mode
      canDeleteNodes: inReadOnlyMode ? false : rank >= 2, // Senior+ can delete
      canManageGroups: inReadOnlyMode ? false : rank >= 2, // Senior+ can manage groups
      canUploadSources: inReadOnlyMode ? false : rank >= 1, // Junior+ can upload
      canExportData: rank >= 2, // Senior+ can export (read operation)

      // Settings permissions
      canViewSettings: true,
      canEditAccountSettings: inReadOnlyMode ? false : rank >= 3, // Leader+ can edit account settings
      canEditGlobalSettings: inReadOnlyMode ? false : isAdmin && rank >= 4, // Admin-admin only
      canManageUsers: inReadOnlyMode ? false : rank >= 3, // Leader+ can manage users

      // Admin permissions
      canViewAuditLog: isAdmin && rank >= 2, // Admin-senior+ can view audit log
      canSwitchAccounts: isAdmin, // Any admin can switch accounts
      canAccessCRM: isAdmin, // Any admin can access CRM
      canAccessPortal: isAdmin, // Any admin can access Portal

      // Service mode overrides
      canEditNodesInPortal: inServiceMode, // Service mode enables write access
      canDeleteNodesInPortal: inServiceMode && rank >= 2,
    };
  }, [user, operating, isOperatingMode]);

  /**
   * Check a specific permission with detailed reason
   */
  const checkPermission = (permission: Permission): PermissionCheck => {
    if (!user) {
      return { allowed: false, reason: 'Not authenticated' };
    }

    const isAdmin = user.accountType === 'admin';
    const rank = user.rank || 1;
    const inReadOnlyMode = isOperatingMode && !operating.serviceMode;

    switch (permission) {
      case 'view_canvas':
        return { allowed: true };

      case 'edit_nodes':
        if (inReadOnlyMode) {
          return { allowed: false, reason: 'Portal is in read-only mode. Enable Service Mode to edit.' };
        }
        if (rank < 1) {
          return { allowed: false, reason: 'Insufficient rank' };
        }
        return { allowed: true };

      case 'delete_nodes':
        if (inReadOnlyMode) {
          return { allowed: false, reason: 'Portal is in read-only mode. Enable Service Mode to delete.' };
        }
        if (rank < 2) {
          return { allowed: false, reason: 'Rank ceiling: Senior (rank 2) or higher required' };
        }
        return { allowed: true };

      case 'manage_groups':
        if (inReadOnlyMode) {
          return { allowed: false, reason: 'Portal is in read-only mode' };
        }
        if (rank < 2) {
          return { allowed: false, reason: 'Rank ceiling: Senior or higher required' };
        }
        return { allowed: true };

      case 'upload_sources':
        if (inReadOnlyMode) {
          return { allowed: false, reason: 'Portal is in read-only mode' };
        }
        return { allowed: rank >= 1 };

      case 'export_data':
        if (rank < 2) {
          return { allowed: false, reason: 'Senior or higher required' };
        }
        return { allowed: true };

      case 'view_settings':
        return { allowed: true };

      case 'edit_account_settings':
        if (inReadOnlyMode) {
          return { allowed: false, reason: 'Portal is in read-only mode' };
        }
        if (rank < 3) {
          return { allowed: false, reason: 'Leader or higher required' };
        }
        return { allowed: true };

      case 'edit_global_settings':
        if (!isAdmin) {
          return { allowed: false, reason: 'Admin account required' };
        }
        if (rank < 4) {
          return { allowed: false, reason: 'Admin-admin required' };
        }
        return { allowed: true };

      case 'manage_users':
        if (inReadOnlyMode) {
          return { allowed: false, reason: 'Portal is in read-only mode' };
        }
        if (rank < 3) {
          return { allowed: false, reason: 'Leader or higher required' };
        }
        return { allowed: true };

      case 'view_audit_log':
        if (!isAdmin) {
          return { allowed: false, reason: 'Admin account required' };
        }
        if (rank < 2) {
          return { allowed: false, reason: 'Admin-senior or higher required' };
        }
        return { allowed: true };

      case 'switch_accounts':
        if (!isAdmin) {
          return { allowed: false, reason: 'Admin account required' };
        }
        return { allowed: true };

      case 'access_crm':
        if (!isAdmin) {
          return { allowed: false, reason: 'Admin account required' };
        }
        return { allowed: true };

      case 'access_portal':
        if (!isAdmin) {
          return { allowed: false, reason: 'Admin account required' };
        }
        return { allowed: true };

      default:
        return { allowed: false, reason: 'Unknown permission' };
    }
  };

  /**
   * Get rank display name
   */
  const getRankName = (rankLevel?: number): string => {
    const r = rankLevel ?? user?.rank ?? 1;
    switch (r) {
      case 1:
        return 'Junior';
      case 2:
        return 'Senior';
      case 3:
        return 'Leader';
      case 4:
        return 'Admin';
      default:
        return 'Unknown';
    }
  };

  return {
    ...permissions,
    checkPermission,
    getRankName,
    isAdmin: user?.accountType === 'admin',
    rank: user?.rank || 1,
    inServiceMode: isOperatingMode && operating.serviceMode,
    inReadOnlyMode: isOperatingMode && !operating.serviceMode,
  };
}
