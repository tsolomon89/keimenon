/**
 * Navigation Model Factory Tests
 *
 * Tests all 12 permutations of shell/canvas mode combinations
 * to ensure correct navigation data is shown in each case.
 */

import { describe, it, expect } from '@jest/globals';
import {
  NavigationModelFactory,
  type NavigationContext,
  type User,
  type TreeNode,
  requiresAdminPermission,
  supportsMultiSelect,
  getDefaultCanvasMode,
  getDefaultShellMode,
} from './navigation.model';

// Mock data
const mockAdminUser: User = {
  accountType: 'admin',
  accountId: 'admin-123',
};

const mockClientUser: User = {
  accountType: 'client',
  accountId: 'client-123',
};

const mockAccountTree: TreeNode[] = [
  { id: 'acc1', label: 'Account 1' },
  { id: 'acc2', label: 'Account 2' },
];

const mockGroupsTree: TreeNode[] = [
  { id: 'grp1', label: 'Group 1' },
  { id: 'grp2', label: 'Group 2' },
];

const mockSettingsTree: TreeNode[] = [
  { id: 'set1', label: 'General' },
  { id: 'set2', label: 'Advanced' },
];

/**
 * Helper to create a navigation context
 */
function createContext(overrides: Partial<NavigationContext> = {}): NavigationContext {
  return {
    shellMode: 'client',
    canvasMode: 'canvas',
    operatingMode: 'native',
    user: mockClientUser,
    accountTreeData: mockAccountTree,
    groupsTreeData: mockGroupsTree,
    settingsTreeData: mockSettingsTree,
    accountsLoading: false,
    groupsLoading: false,
    settingsLoading: false,
    settingsError: null,
    ...overrides,
  };
}

describe('NavigationModelFactory', () => {
  describe('Settings Mode (Rule 1 - Highest Priority)', () => {
    it('should show settings tree when canvasMode is settings (admin, crm)', () => {
      const context = createContext({
        shellMode: 'admin',
        canvasMode: 'settings',
        user: mockAdminUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('settings');
      expect(model.title).toBe('Settings');
      expect(model.searchPlaceholder).toBe('Search settings...');
      expect(model.data).toEqual(mockSettingsTree);
      expect(model.showCreateButton).toBe(false);
      expect(model.multiSelect).toBe(false);
    });

    it('should show settings tree when canvasMode is settings (admin, portal)', () => {
      const context = createContext({
        shellMode: 'client',
        canvasMode: 'settings',
        user: mockAdminUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('settings');
      expect(model.title).toBe('Settings');
      expect(model.data).toEqual(mockSettingsTree);
    });

    it('should show settings tree when canvasMode is settings (client, portal)', () => {
      const context = createContext({
        shellMode: 'client',
        canvasMode: 'settings',
        user: mockClientUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('settings');
      expect(model.data).toEqual(mockSettingsTree);
    });

    it('should show loading message when settings are loading', () => {
      const context = createContext({
        canvasMode: 'settings',
        settingsLoading: true,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.emptyMessage).toBe('Loading settings...');
    });

    it('should show error message when settings fail to load', () => {
      const context = createContext({
        canvasMode: 'settings',
        settingsError: 'Failed to load settings',
      });

      const model = NavigationModelFactory.get(context);

      expect(model.emptyMessage).toBe('Error: Failed to load settings');
    });
  });

  describe('CRM Mode (Rule 2 - Medium Priority)', () => {
    it('should show accounts tree when in CRM + Dashboard (admin)', () => {
      const context = createContext({
        shellMode: 'admin',
        canvasMode: 'dashboard',
        user: mockAdminUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('accounts');
      expect(model.title).toBe('Accounts');
      expect(model.searchPlaceholder).toBe('Search accounts...');
      expect(model.data).toEqual(mockAccountTree);
      expect(model.showCreateButton).toBe(true); // Admin can create
      expect(model.multiSelect).toBe(true);
    });

    it('should NOT show accounts tree in CRM + Canvas (default to groups)', () => {
      const context = createContext({
        shellMode: 'admin',
        canvasMode: 'canvas',
        user: mockAdminUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('groups'); // Not accounts!
      expect(model.data).toEqual(mockGroupsTree);
    });

    it('should show accounts tree even if user is client (but in CRM mode)', () => {
      // Edge case: client shouldn't be in CRM mode, but if they are, show accounts
      const context = createContext({
        shellMode: 'admin',
        canvasMode: 'dashboard',
        user: mockClientUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('accounts');
      expect(model.showCreateButton).toBe(false); // Client can't create accounts
    });

    it('should show loading message when accounts are loading', () => {
      const context = createContext({
        shellMode: 'admin',
        canvasMode: 'dashboard',
        accountsLoading: true,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.emptyMessage).toBe('Loading accounts...');
    });
  });

  describe('Groups Mode (Rule 3 - Default/Fallback)', () => {
    it('should show groups tree in portal + canvas (client)', () => {
      const context = createContext({
        shellMode: 'client',
        canvasMode: 'canvas',
        user: mockClientUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('groups');
      expect(model.title).toBe('Groups & Folders');
      expect(model.searchPlaceholder).toBe('Search groups...');
      expect(model.data).toEqual(mockGroupsTree);
      expect(model.showCreateButton).toBe(false);
      expect(model.multiSelect).toBe(true);
    });

    it('should show groups tree in portal + dashboard (admin-as-client)', () => {
      const context = createContext({
        shellMode: 'client',
        canvasMode: 'dashboard',
        user: mockAdminUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('groups');
      expect(model.data).toEqual(mockGroupsTree);
    });

    it('should show groups tree in crm + canvas (admin in canvas view)', () => {
      const context = createContext({
        shellMode: 'admin',
        canvasMode: 'canvas',
        user: mockAdminUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('groups');
    });

    it('should show groups tree in portal + canvas', () => {
      const context = createContext({
        shellMode: 'client',
        canvasMode: 'canvas',
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('groups');
    });

    it('should show groups tree in crm + canvas', () => {
      const context = createContext({
        shellMode: 'admin',
        canvasMode: 'canvas',
        user: mockAdminUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('groups');
    });

    it('should show loading message when groups are loading', () => {
      const context = createContext({
        canvasMode: 'canvas',
        groupsLoading: true,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.emptyMessage).toBe('Loading groups...');
    });

    it('should show helpful empty message when no groups exist', () => {
      const context = createContext({
        canvasMode: 'canvas',
        groupsTreeData: [],
      });

      const model = NavigationModelFactory.get(context);

      expect(model.emptyMessage).toBe('No groups yet. Upload sources to get started.');
    });
  });

  describe('All 12 Permutations (Comprehensive Matrix)', () => {
    const testCases: Array<{
      shell: 'admin' | 'client';
      canvas: 'auth' | 'dashboard' | 'settings' | 'canvas';
      user: User;
      expectedMode: 'accounts' | 'settings' | 'groups';
      description: string;
    }> = [
      // CRM shell variations
      {
        shell: 'admin',
        canvas: 'dashboard',
        user: mockAdminUser,
        expectedMode: 'accounts',
        description: 'Admin in CRM dashboard shows accounts',
      },
      {
        shell: 'admin',
        canvas: 'canvas',
        user: mockAdminUser,
        expectedMode: 'groups',
        description: 'Admin in CRM canvas shows groups',
      },
      {
        shell: 'admin',
        canvas: 'settings',
        user: mockAdminUser,
        expectedMode: 'settings',
        description: 'Admin in CRM settings shows settings',
      },
      {
        shell: 'admin',
        canvas: 'canvas',
        user: mockAdminUser,
        expectedMode: 'groups',
        description: 'Admin in CRM canvas shows groups',
      },

      // Portal shell variations (admin-as-client or client)
      {
        shell: 'client',
        canvas: 'dashboard',
        user: mockAdminUser,
        expectedMode: 'groups',
        description: 'Admin-as-client in portal dashboard shows groups',
      },
      {
        shell: 'client',
        canvas: 'canvas',
        user: mockAdminUser,
        expectedMode: 'groups',
        description: 'Admin-as-client in portal canvas shows groups',
      },
      {
        shell: 'client',
        canvas: 'settings',
        user: mockAdminUser,
        expectedMode: 'settings',
        description: 'Admin-as-client in portal settings shows settings',
      },
      {
        shell: 'client',
        canvas: 'canvas',
        user: mockClientUser,
        expectedMode: 'groups',
        description: 'Client in portal canvas shows groups',
      },
      {
        shell: 'client',
        canvas: 'settings',
        user: mockClientUser,
        expectedMode: 'settings',
        description: 'Client in portal settings shows settings',
      },
    ];

    testCases.forEach(({ shell, canvas, user, expectedMode, description }) => {
      it(description, () => {
        const context = createContext({
          shellMode: shell,
          canvasMode: canvas,
          user,
        });

        const model = NavigationModelFactory.get(context);

        expect(model.mode).toBe(expectedMode);
      });
    });
  });

  describe('Helper Functions', () => {
    describe('requiresAdminPermission', () => {
      it('should return true for accounts mode', () => {
        expect(requiresAdminPermission('accounts')).toBe(true);
      });

      it('should return false for settings mode', () => {
        expect(requiresAdminPermission('settings')).toBe(false);
      });

      it('should return false for groups mode', () => {
        expect(requiresAdminPermission('groups')).toBe(false);
      });
    });

    describe('supportsMultiSelect', () => {
      it('should return true for accounts mode', () => {
        expect(supportsMultiSelect('accounts')).toBe(true);
      });

      it('should return true for groups mode', () => {
        expect(supportsMultiSelect('groups')).toBe(true);
      });

      it('should return false for settings mode', () => {
        expect(supportsMultiSelect('settings')).toBe(false);
      });
    });

    describe('getDefaultCanvasMode', () => {
      it('should return dashboard for admin in CRM shell', () => {
        expect(getDefaultCanvasMode('admin', mockAdminUser)).toBe('dashboard');
      });

      it('should return canvas for admin in portal shell', () => {
        expect(getDefaultCanvasMode('client', mockAdminUser)).toBe('canvas');
      });

      it('should return canvas for client in any shell', () => {
        expect(getDefaultCanvasMode('client', mockClientUser)).toBe('canvas');
        expect(getDefaultCanvasMode('admin', mockClientUser)).toBe('canvas');
      });

      it('should return canvas when user is null', () => {
        expect(getDefaultCanvasMode('admin', null)).toBe('canvas');
      });
    });

    describe('getDefaultShellMode', () => {
      it('should return crm for admin user', () => {
        expect(getDefaultShellMode(mockAdminUser)).toBe('admin');
      });

      it('should return portal for client user', () => {
        expect(getDefaultShellMode(mockClientUser)).toBe('client');
      });

      it('should return portal when user is null', () => {
        expect(getDefaultShellMode(null)).toBe('client');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null user gracefully', () => {
      const context = createContext({
        user: null,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('groups');
      expect(model.showCreateButton).toBe(false);
    });

    it('should handle empty tree data arrays', () => {
      const context = createContext({
        accountTreeData: [],
        groupsTreeData: [],
        settingsTreeData: [],
      });

      const model = NavigationModelFactory.get(context);

      expect(model.data).toEqual([]);
    });

    it('should prioritize settings mode even if accounts would match', () => {
      const context = createContext({
        shellMode: 'admin',
        canvasMode: 'settings', // Settings takes priority
        user: mockAdminUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('settings'); // Not accounts!
    });
  });
});
