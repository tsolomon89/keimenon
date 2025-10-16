'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';

/**
 * ShellMode: Two admin shells for viewing client data
 * - CRM: Admin summary/dashboard layer over any client account
 * - Portal: Actual client UI wrapped by admin shell (nested portal)
 */
type ShellMode = 'crm' | 'portal';

/**
 * CanvasMode: Pages within a shell
 * - dashboard: Analytics and overview
 * - settings: Configuration
 * - canvas: Main graph canvas (default for Portal)
 * - upload: Upload/import interface
 * - processing: Processing status
 */
type CanvasMode = 'dashboard' | 'settings' | 'canvas' | 'upload' | 'processing';

interface ShellContextType {
  // Shell state
  shellMode: ShellMode;
  canvasMode: CanvasMode;

  // Shell actions
  setShellMode: (mode: ShellMode) => void;
  setCanvasMode: (mode: CanvasMode) => void;

  // Permission checks
  canAccessPortal: () => boolean;
  isAdminShell: () => boolean;
}

const ShellContext = createContext<ShellContextType | undefined>(undefined);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // Set default shell mode based on account type
  // Admin accounts default to 'crm' mode (Accounts view)
  // Client accounts default to 'portal' mode (Groups & Folders view)
  const getDefaultShellMode = (): ShellMode => {
    return user?.accountType === 'admin' ? 'crm' : 'portal';
  };

  const [shellMode, setShellModeState] = useState<ShellMode>(getDefaultShellMode());
  const [canvasMode, setCanvasModeState] = useState<CanvasMode>('canvas');
  const initializedRef = useRef(false);

  // Update shell mode when user first loads
  // This ensures the correct default mode is set based on account type
  useEffect(() => {
    if (user && !initializedRef.current) {
      const defaultMode = user.accountType === 'admin' ? 'crm' : 'portal';
      const defaultCanvasMode = user.accountType === 'admin' ? 'dashboard' : 'canvas';

      setShellModeState(defaultMode);
      setCanvasModeState(defaultCanvasMode);

      initializedRef.current = true;
      console.log('Shell initialized:', { defaultMode, defaultCanvasMode, accountType: user.accountType });
    }
  }, [user]); // Run when user loads

  /**
   * Check if user can access Portal shell
   * Portal requires admin account type
   */
  const canAccessPortal = useCallback(() => {
    return user?.accountType === 'admin';
  }, [user]);

  /**
   * Check if currently in an admin shell (CRM or Portal)
   */
  const isAdminShell = useCallback(() => {
    return user?.accountType === 'admin';
  }, [user]);

  /**
   * Set shell mode (CRM or Portal)
   * Validates permission before switching
   */
  const setShellMode = useCallback((mode: ShellMode) => {
    if (mode === 'portal' && !canAccessPortal()) {
      console.warn('Cannot access Portal shell: user is not admin');
      return;
    }

    setShellModeState(mode);

    // Auto-switch canvas mode based on shell
    if (mode === 'crm') {
      // CRM defaults to dashboard
      setCanvasModeState('dashboard');
    } else if (mode === 'portal') {
      // Portal defaults to canvas
      setCanvasModeState('canvas');
    }

    console.log('Shell mode changed:', mode);
  }, [canAccessPortal]);

  /**
   * Set canvas mode (page within shell)
   */
  const setCanvasMode = useCallback((mode: CanvasMode) => {
    setCanvasModeState(mode);
    console.log('Canvas mode changed:', mode);
  }, []);

  const value: ShellContextType = {
    shellMode,
    canvasMode,
    setShellMode,
    setCanvasMode,
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
