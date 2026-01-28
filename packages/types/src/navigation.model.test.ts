/**
 * Navigation Model Factory Tests
 *
 * Tests all 12 permutations of shell/keimenon mode combinations
 * to ensure correct navigation data is shown in each case.
 */

import { describe, it, expect } from 'vitest';
import {
  NavigationModelFactory,
  type NavigationContext,
  type User,
  type TreeNode,
  requiresAdminPermission,
  supportsMultiSelect,
  getDefaultKeimenonMode,
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
    keimenonMode: 'keimenon',
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
    it('should show settings tree when keimenonMode is settings (admin, crm)', () => {
      const context = createContext({
        shellMode: 'admin',
        keimenonMode: 'settings',
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

    it('should show settings tree when keimenonMode is settings (admin, portal)', () => {
      const context = createContext({
        shellMode: 'client',
        keimenonMode: 'settings',
        user: mockAdminUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('settings');
      expect(model.title).toBe('Settings');
      expect(model.data).toEqual(mockSettingsTree);
    });

    it('should show settings tree when keimenonMode is settings (client, portal)', () => {
      const context = createContext({
        shellMode: 'client',
        keimenonMode: 'settings',
        user: mockClientUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('settings');
      expect(model.data).toEqual(mockSettingsTree);
    });

    it('should show loading message when settings are loading', () => {
      const context = createContext({
        keimenonMode: 'settings',
        settingsLoading: true,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.emptyMessage).toBe('Loading settings...');
    });

    it('should show error message when settings fail to load', () => {
      const context = createContext({
        keimenonMode: 'settings',
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
        keimenonMode: 'dashboard',
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

    it('should NOT show accounts tree in CRM + Keimenon (default to groups)', () => {
      const context = createContext({
        shellMode: 'admin',
        keimenonMode: 'keimenon',
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
        keimenonMode: 'dashboard',
        user: mockClientUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('accounts');
      expect(model.showCreateButton).toBe(false); // Client can't create accounts
    });

    it('should show loading message when accounts are loading', () => {
      const context = createContext({
        shellMode: 'admin',
        keimenonMode: 'dashboard',
        accountsLoading: true,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.emptyMessage).toBe('Loading accounts...');
    });
  });

  describe('Groups Mode (Rule 3 - Default/Fallback)', () => {
    it('should show groups tree in portal + keimenon (client)', () => {
      const context = createContext({
        shellMode: 'client',
        keimenonMode: 'keimenon',
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
        keimenonMode: 'dashboard',
        user: mockAdminUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('groups');
      expect(model.data).toEqual(mockGroupsTree);
    });

    it('should show groups tree in crm + keimenon (admin in keimenon view)', () => {
      const context = createContext({
        shellMode: 'admin',
        keimenonMode: 'keimenon',
        user: mockAdminUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('groups');
    });

    it('should show groups tree in portal + keimenon', () => {
      const context = createContext({
        shellMode: 'client',
        keimenonMode: 'keimenon',
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('groups');
    });

    it('should show groups tree in crm + keimenon', () => {
      const context = createContext({
        shellMode: 'admin',
        keimenonMode: 'keimenon',
        user: mockAdminUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('groups');
    });

    it('should show loading message when groups are loading', () => {
      const context = createContext({
        keimenonMode: 'keimenon',
        groupsLoading: true,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.emptyMessage).toBe('Loading groups...');
    });

    it('should show helpful empty message when no groups exist', () => {
      const context = createContext({
        keimenonMode: 'keimenon',
        groupsTreeData: [],
      });

      const model = NavigationModelFactory.get(context);

      expect(model.emptyMessage).toBe('No groups yet. Upload sources to get started.');
    });
  });

  describe('All 12 Permutations (Comprehensive Matrix)', () => {
    const testCases: Array<{
      shell: 'admin' | 'client';
      keimenon: 'auth' | 'dashboard' | 'settings' | 'keimenon';
      user: User;
      expectedMode: 'accounts' | 'settings' | 'groups';
      description: string;
    }> = [
      // CRM shell variations
      {
        shell: 'admin',
        keimenon: 'dashboard',
        user: mockAdminUser,
        expectedMode: 'accounts',
        description: 'Admin in CRM dashboard shows accounts',
      },
      {
        shell: 'admin',
        keimenon: 'keimenon',
        user: mockAdminUser,
        expectedMode: 'groups',
        description: 'Admin in CRM keimenon shows groups',
      },
      {
        shell: 'admin',
        keimenon: 'settings',
        user: mockAdminUser,
        expectedMode: 'settings',
        description: 'Admin in CRM settings shows settings',
      },
      {
        shell: 'admin',
        keimenon: 'keimenon',
        user: mockAdminUser,
        expectedMode: 'groups',
        description: 'Admin in CRM keimenon shows groups',
      },

      // Portal shell variations (admin-as-client or client)
      {
        shell: 'client',
        keimenon: 'dashboard',
        user: mockAdminUser,
        expectedMode: 'groups',
        description: 'Admin-as-client in portal dashboard shows groups',
      },
      {
        shell: 'client',
        keimenon: 'keimenon',
        user: mockAdminUser,
        expectedMode: 'groups',
        description: 'Admin-as-client in portal keimenon shows groups',
      },
      {
        shell: 'client',
        keimenon: 'settings',
        user: mockAdminUser,
        expectedMode: 'settings',
        description: 'Admin-as-client in portal settings shows settings',
      },
      {
        shell: 'client',
        keimenon: 'keimenon',
        user: mockClientUser,
        expectedMode: 'groups',
        description: 'Client in portal keimenon shows groups',
      },
      {
        shell: 'client',
        keimenon: 'settings',
        user: mockClientUser,
        expectedMode: 'settings',
        description: 'Client in portal settings shows settings',
      },
    ];

    testCases.forEach(({ shell, keimenon, user, expectedMode, description }) => {
      it(description, () => {
        const context = createContext({
          shellMode: shell,
          keimenonMode: keimenon,
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

    describe('getDefaultKeimenonMode', () => {
      it('should return dashboard for admin in CRM shell', () => {
        expect(getDefaultKeimenonMode('admin', mockAdminUser)).toBe('dashboard');
      });

      it('should return keimenon for admin in portal shell', () => {
        expect(getDefaultKeimenonMode('client', mockAdminUser)).toBe('keimenon');
      });

      it('should return keimenon for client in any shell', () => {
        expect(getDefaultKeimenonMode('client', mockClientUser)).toBe('keimenon');
        expect(getDefaultKeimenonMode('admin', mockClientUser)).toBe('keimenon');
      });

      it('should return keimenon when user is null', () => {
        expect(getDefaultKeimenonMode('admin', null)).toBe('keimenon');
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
        keimenonMode: 'settings', // Settings takes priority
        user: mockAdminUser,
      });

      const model = NavigationModelFactory.get(context);

      expect(model.mode).toBe('settings'); // Not accounts!
    });
  });
});
