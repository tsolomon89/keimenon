'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';

/**
 * ShellMode: LOCKED to user.accountType
 * - Admin: Dashboard/management layer for all accounts and client data
 * - Client: Keimenon UI for own data only
 *
 * ShellMode is determined by accountType and cannot be manually changed.
 */
type ShellMode = 'admin' | 'client';

/**
 * Display name mapping for shell modes
 */
export const SHELL_MODE_LABELS = {
  admin: 'Admin',
  client: 'Client',
} as const;

/**
 * Get display label for a shell mode
 */
export function getShellModeLabel(mode: ShellMode): string {
  return SHELL_MODE_LABELS[mode];
}

/**
 * KeimenonMode: Pages within a shell
 * - auth: Login/registration (unauthenticated state)
 * - dashboard: Analytics and overview
 * - settings: Configuration
 * - keimenon: Main graph keimenon
 */
type KeimenonMode = 'auth' | 'dashboard' | 'settings' | 'keimenon';

interface ShellContextType {
  // Shell state
  shellMode: ShellMode;
  keimenonMode: KeimenonMode;

  // Shell actions
  setShellMode: (mode: ShellMode) => void;
  setKeimenonMode: (mode: KeimenonMode) => void;

  // Permission checks
  canAccessPortal: () => boolean;
  isAdminShell: () => boolean;
}

export const ShellContext = createContext<ShellContextType | undefined>(undefined);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // ShellMode is LOCKED to user.accountType
  // Admin accounts → 'admin' shell mode
  // Client accounts → 'client' shell mode
  const getDefaultShellMode = (): ShellMode => {
    return user?.accountType === 'admin' ? 'admin' : 'client';
  };

  const [shellMode, setShellModeState] = useState<ShellMode>(getDefaultShellMode());
  const [keimenonMode, setKeimenonModeState] = useState<KeimenonMode>('keimenon');
  const syncedUserKeyRef = useRef<string | null>(null);

  // Lock shell mode to account type and resync when account context changes.
  useEffect(() => {
    if (!user) {
      syncedUserKeyRef.current = null;
      setShellModeState('client');
      setKeimenonModeState('keimenon');
      return;
    }

    const userKey = `${user.accountId}:${user.accountType}`;
    if (syncedUserKeyRef.current !== userKey) {
      const nextShellMode = user.accountType === 'admin' ? 'admin' : 'client';
      const defaultKeimenonMode = user.accountType === 'admin' ? 'dashboard' : 'keimenon';

      setShellModeState(nextShellMode);
      setKeimenonModeState(defaultKeimenonMode);
      syncedUserKeyRef.current = userKey;

      console.log('Shell locked to account type:', {
        shellMode: nextShellMode,
        accountType: user.accountType,
      });
      return;
    }

    if (user.accountType !== 'admin' && keimenonMode === 'dashboard') {
      setKeimenonModeState('keimenon');
    }
  }, [user, keimenonMode]);

  /**
   * Check if user can access Portal shell
   * UPDATED: ShellMode is locked to accountType (no manual switching)
   * This function kept for API compatibility.
   */
  const canAccessPortal = useCallback(() => {
    // All authenticated users can access the portal (client shell mode)
    return true;
  }, [user]);

  /**
   * Check if currently in an admin shell (CRM or Portal)
   */
  const isAdminShell = useCallback(() => {
    return user?.accountType === 'admin';
  }, [user]);

  /**
   * Set shell mode - NOW LOCKED TO ACCOUNT TYPE
   * IMPORTANT: This function is kept for API compatibility but does nothing.
   * ShellMode is automatically determined by user.accountType and cannot be manually changed.
   *
   * - Admin accounts → ShellMode: 'admin' (locked)
   * - Client accounts → ShellMode: 'client' (locked)
   *
   * Data tenancy enforced by:
   * - ShellMode: UI presentation (which navigation, which views)
   * - AccountType: API data scoping (admin sees all, client sees own)
   */
  const setShellMode = useCallback(
    (mode: ShellMode) => {
      console.warn(
        'setShellMode() called but ShellMode is locked to account type.',
        'ShellMode cannot be manually changed. Ignoring request.',
        { requestedMode: mode, currentMode: shellMode }
      );
      // No-op: shellMode is determined by user.accountType only
    },
    [shellMode]
  );

  /**
   * Set keimenon mode (page within shell)
   */
  const setKeimenonMode = useCallback(
    (mode: KeimenonMode) => {
      const nextMode = mode === 'dashboard' && user?.accountType !== 'admin' ? 'keimenon' : mode;
      if (mode === 'dashboard' && user?.accountType !== 'admin') {
        console.warn(
          'Dashboard mode is restricted to admin accounts. Falling back to keimenon mode.'
        );
      }
      setKeimenonModeState(nextMode);
      console.log('Keimenon mode changed:', nextMode);
    },
    [user?.accountType]
  );

  const value: ShellContextType = {
    shellMode,
    keimenonMode,
    setShellMode,
    setKeimenonMode,
    canAccessPortal,
    isAdminShell,
  };

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/**
 * Hook to access shell context
 */
export function useShell() {
  const context = useContext(ShellContext);
  if (context === undefined) {
    throw new Error('useShell must be used within a ShellProvider');
  }
  return context;
}
