'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for managing accounts in desktop Electron environment.
 * Provides account switching, adding, and logout functionality via IPC.
 *
 * In web mode (no window.electronAPI), returns null to signal the caller
 * should use the standard auth context instead.
 */

export interface DesktopAccount {
  accountId: string;
  accessToken?: string;
}

export interface UseDesktopAccountsResult {
  /** List of stored account IDs */
  accountIds: string[];
  /** Currently active account ID */
  activeAccountId: string | null;
  /** Whether accounts are being loaded */
  isLoading: boolean;
  /** Switch to a different account */
  switchAccount: (accountId: string) => Promise<{ success: boolean; accessToken?: string }>;
  /** Add a new account after login */
  addAccount: (
    accountId: string,
    accessToken: string,
    refreshToken?: string
  ) => Promise<{ success: boolean }>;
  /** Logout from a specific account */
  logoutAccount: (accountId: string) => Promise<{ success: boolean }>;
  /** Get token for an account */
  getAccountToken: (
    accountId: string,
    key: 'access_token' | 'refresh_token'
  ) => Promise<string | null>;
  /** Refresh the accounts list */
  refresh: () => Promise<void>;
}

/**
 * Check if we're running in a desktop Electron environment
 */
export function isDesktopEnvironment(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window && !!window.electronAPI?.accounts;
}

/**
 * Hook to manage desktop accounts via Electron IPC.
 * Returns null if not in desktop environment.
 */
export function useDesktopAccounts(): UseDesktopAccountsResult | null {
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if we're in desktop environment
  const isDesktop = isDesktopEnvironment();

  // Load accounts on mount
  useEffect(() => {
    if (!isDesktop) {
      setIsLoading(false);
      return;
    }

    const loadAccounts = async () => {
      try {
        const [accounts, active] = await Promise.all([
          window.electronAPI!.accounts.getAll(),
          window.electronAPI!.accounts.getActive(),
        ]);
        setAccountIds(accounts);
        setActiveAccountId(active);
      } catch (error) {
        console.error('[useDesktopAccounts] Failed to load accounts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAccounts();

    // Subscribe to account changes
    const cleanup = window.electronAPI!.accounts.onAccountChanged((accountId) => {
      setActiveAccountId(accountId);
      // Refresh account list in case an account was added/removed
      window.electronAPI!.accounts.getAll().then(setAccountIds);
    });

    return cleanup;
  }, [isDesktop]);

  const switchAccount = useCallback(
    async (accountId: string) => {
      if (!isDesktop) return { success: false };
      try {
        const result = await window.electronAPI!.accounts.switch(accountId);
        return { success: result.success, accessToken: result.accessToken };
      } catch (error) {
        console.error('[useDesktopAccounts] Switch failed:', error);
        return { success: false };
      }
    },
    [isDesktop]
  );

  const addAccount = useCallback(
    async (accountId: string, accessToken: string, refreshToken?: string) => {
      if (!isDesktop) return { success: false };
      try {
        const result = await window.electronAPI!.accounts.add(accountId, accessToken, refreshToken);
        // Refresh list
        const accounts = await window.electronAPI!.accounts.getAll();
        setAccountIds(accounts);
        return { success: result.success };
      } catch (error) {
        console.error('[useDesktopAccounts] Add account failed:', error);
        return { success: false };
      }
    },
    [isDesktop]
  );

  const logoutAccount = useCallback(
    async (accountId: string) => {
      if (!isDesktop) return { success: false };
      try {
        const result = await window.electronAPI!.accounts.logout(accountId);
        // Refresh list
        const accounts = await window.electronAPI!.accounts.getAll();
        setAccountIds(accounts);
        return { success: result.success };
      } catch (error) {
        console.error('[useDesktopAccounts] Logout failed:', error);
        return { success: false };
      }
    },
    [isDesktop]
  );

  const getAccountToken = useCallback(
    async (accountId: string, key: 'access_token' | 'refresh_token') => {
      if (!isDesktop) return null;
      try {
        return await window.electronAPI!.accounts.getToken(accountId, key);
      } catch (error) {
        console.error('[useDesktopAccounts] Get token failed:', error);
        return null;
      }
    },
    [isDesktop]
  );

  const refresh = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const [accounts, active] = await Promise.all([
        window.electronAPI!.accounts.getAll(),
        window.electronAPI!.accounts.getActive(),
      ]);
      setAccountIds(accounts);
      setActiveAccountId(active);
    } catch (error) {
      console.error('[useDesktopAccounts] Refresh failed:', error);
    }
  }, [isDesktop]);

  // Return null if not in desktop environment
  if (!isDesktop) {
    return null;
  }

  return {
    accountIds,
    activeAccountId,
    isLoading,
    switchAccount,
    addAccount,
    logoutAccount,
    getAccountToken,
    refresh,
  };
}

/**
 * Hook to migrate legacy tokens on first run
 * Should be called once when the user first logs in on desktop
 */
export function useDesktopMigration() {
  const isDesktop = isDesktopEnvironment();

  const migrateLegacyTokens = useCallback(
    async (accountId: string) => {
      if (!isDesktop) return false;
      try {
        return await window.electronAPI!.accounts.migrateLegacy(accountId);
      } catch (error) {
        console.error('[useDesktopMigration] Migration failed:', error);
        return false;
      }
    },
    [isDesktop]
  );

  return { migrateLegacyTokens, isDesktop };
}
