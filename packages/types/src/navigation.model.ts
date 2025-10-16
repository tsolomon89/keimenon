/**
 * Navigation Model Factory
 *
 * Provides a clean, testable abstraction for determining which navigation data
 * to show in the left sidebar based on shell mode, canvas mode, and user permissions.
 *
 * Replaces 40+ lines of conditional logic in CanvasSidebar with a single factory call.
 */

export type ShellMode = 'crm' | 'portal';
export type CanvasMode = 'dashboard' | 'settings' | 'canvas' | 'upload' | 'processing';
export type OperatingMode = 'native' | 'nested' | 'crm';
export type NavigationMode = 'groups' | 'accounts' | 'settings';

export interface TreeNode {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeColor?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'slate';
  children?: TreeNode[];
  metadata?: Record<string, any>;
  visible?: boolean;
}

export interface NavigationModel {
  /** Navigation mode determines which tree data to show */
  mode: NavigationMode;

  /** Title displayed in sidebar header */
  title: string;

  /** Placeholder text for search input */
  searchPlaceholder: string;

  /** Message shown when no items match */
  emptyMessage: string;

  /** Tree data to display */
  data: TreeNode[];

  /** Whether to show the create button (e.g., "+ Account" in CRM mode) */
  showCreateButton: boolean;

  /** Whether multi-select is enabled */
  multiSelect: boolean;
}

export interface User {
  accountType: 'admin' | 'client';
  accountId: string;
  [key: string]: any;
}

export interface NavigationContext {
  /** Current shell mode (CRM or Portal) */
  shellMode: ShellMode;

  /** Current canvas mode (dashboard, settings, canvas, etc.) */
  canvasMode: CanvasMode;

  /** Current operating mode (native, nested, crm) */
  operatingMode: OperatingMode;

  /** Current user */
  user: User | null;

  /** Account tree data (for CRM mode) */
  accountTreeData: TreeNode[];

  /** Groups tree data (for canvas/portal modes) */
  groupsTreeData: TreeNode[];

  /** Settings tree data (for settings mode) */
  settingsTreeData: TreeNode[];

  /** Loading state for accounts */
  accountsLoading?: boolean;

  /** Loading state for groups */
  groupsLoading?: boolean;

  /** Loading state for settings */
  settingsLoading?: boolean;

  /** Error message for settings */
  settingsError?: string | null;
}

/**
 * Navigation Model Factory
 *
 * Strategy pattern to determine which navigation data to show.
 *
 * Rules (in priority order):
 * 1. Settings mode → Always show settings tree
 * 2. CRM shell + Dashboard canvas → Show accounts tree
 * 3. Default → Show groups tree
 */
export class NavigationModelFactory {
  /**
   * Get navigation model based on current context
   *
   * @param context - Current navigation context
   * @returns Navigation model with mode, title, data, and config
   *
   * @example
   * ```typescript
   * const navModel = NavigationModelFactory.get({
   *   shellMode: 'crm',
   *   canvasMode: 'dashboard',
   *   operatingMode: 'native',
   *   user: { accountType: 'admin', accountId: '123' },
   *   accountTreeData: [...],
   *   groupsTreeData: [...],
   *   settingsTreeData: [...],
   * });
   *
   * console.log(navModel.mode); // 'accounts'
   * console.log(navModel.title); // 'Accounts'
   * ```
   */
  static get(context: NavigationContext): NavigationModel {
    // Rule 1: Settings mode always shows settings tree
    if (context.canvasMode === 'settings') {
      return this.getSettingsModel(context);
    }

    // Rule 2: CRM + Dashboard shows accounts tree
    if (context.shellMode === 'crm' && context.canvasMode === 'dashboard') {
      return this.getAccountsModel(context);
    }

    // Rule 3: Default to groups tree
    return this.getGroupsModel(context);
  }

  /**
   * Get settings navigation model
   */
  private static getSettingsModel(context: NavigationContext): NavigationModel {
    let emptyMessage = 'No settings available';

    if (context.settingsError) {
      emptyMessage = `Error: ${context.settingsError}`;
    } else if (context.settingsLoading) {
      emptyMessage = 'Loading settings...';
    }

    return {
      mode: 'settings',
      title: 'Settings',
      searchPlaceholder: 'Search settings...',
      emptyMessage,
      data: context.settingsTreeData,
      showCreateButton: false,
      multiSelect: false,
    };
  }

  /**
   * Get accounts navigation model (CRM mode)
   */
  private static getAccountsModel(context: NavigationContext): NavigationModel {
    const isAdmin = context.user?.accountType === 'admin';
    const emptyMessage = context.accountsLoading ? 'Loading accounts...' : 'No accounts found';

    return {
      mode: 'accounts',
      title: 'Accounts',
      searchPlaceholder: 'Search accounts...',
      emptyMessage,
      data: context.accountTreeData,
      showCreateButton: isAdmin, // Only admins can create accounts
      multiSelect: true, // CRM supports multi-select
    };
  }

  /**
   * Get groups navigation model (default for canvas/portal)
   */
  private static getGroupsModel(context: NavigationContext): NavigationModel {
    const emptyMessage = context.groupsLoading
      ? 'Loading groups...'
      : 'No groups yet. Upload sources to get started.';

    return {
      mode: 'groups',
      title: 'Groups & Folders',
      searchPlaceholder: 'Search groups...',
      emptyMessage,
      data: context.groupsTreeData,
      showCreateButton: false, // Groups creation handled elsewhere
      multiSelect: true, // Groups support multi-select
    };
  }
}

/**
 * Type guard to check if a mode requires admin permissions
 */
export function requiresAdminPermission(mode: NavigationMode): boolean {
  return mode === 'accounts';
}

/**
 * Type guard to check if a mode supports multi-select
 */
export function supportsMultiSelect(mode: NavigationMode): boolean {
  return mode === 'accounts' || mode === 'groups';
}

/**
 * Get default canvas mode for a given shell mode
 */
export function getDefaultCanvasMode(shellMode: ShellMode, user: User | null): CanvasMode {
  if (user?.accountType === 'admin' && shellMode === 'crm') {
    return 'dashboard';
  }
  return 'canvas';
}

/**
 * Get default shell mode for a given user
 */
export function getDefaultShellMode(user: User | null): ShellMode {
  return user?.accountType === 'admin' ? 'crm' : 'portal';
}
