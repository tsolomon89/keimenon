'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';

type OperatingMode = 'native' | 'nested' | 'crm';

interface OperatingState {
  mode: OperatingMode;
  accountId: string; // May differ from user.accountId in nested/crm mode
  accountType?: 'admin' | 'client';
  accountName?: string;
  serviceMode?: boolean;
  parentAccountId?: string;
}

interface OperatingContextType {
  operating: OperatingState;
  switchAccount: (
    accountId: string,
    mode: OperatingMode,
    metadata?: {
      accountType?: 'admin' | 'client';
      accountName?: string;
      serviceMode?: boolean;
      parentAccountId?: string;
    }
  ) => void;
  exitOperatingMode: () => void;
  getOperatingHeaders: () => Record<string, string>;
  isOperatingMode: boolean;
  operatingContextVersion: number; // For cache invalidation - increments on context changes
}

export const OperatingContext = createContext<OperatingContextType | undefined>(undefined);

export function OperatingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [operating, setOperating] = useState<OperatingState>({
    mode: 'native',
    accountId: user?.accountId || '',
  });

  // Version counter for cache invalidation - increments when operating context changes
  const [operatingContextVersion, setOperatingContextVersion] = useState(0);

  /**
   * Switch to operating in a different account context
   * Only allowed for admin users
   */
  const switchAccount = useCallback(
    (
      accountId: string,
      mode: OperatingMode,
      metadata?: {
        accountType?: 'admin' | 'client';
        accountName?: string;
        serviceMode?: boolean;
        parentAccountId?: string;
      }
    ) => {
      if (!user) {
        console.error('Cannot switch account: not authenticated');
        return;
      }

      if (user.accountType !== 'admin') {
        console.error('Cannot switch account: user is not admin');
        return;
      }

      if (mode === 'nested' && !metadata?.serviceMode) {
        console.warn('Nested mode requires service mode enabled on target account');
      }

      console.log('Switching to operating mode:', {
        mode,
        accountId,
        accountName: metadata?.accountName,
      });

      const newOperating = {
        mode,
        accountId,
        accountType: metadata?.accountType,
        accountName: metadata?.accountName,
        serviceMode: metadata?.serviceMode,
        parentAccountId: metadata?.parentAccountId,
      };

      setOperating(newOperating);

      // Increment version to invalidate caches
      setOperatingContextVersion((v) => v + 1);

      // Sync with window globals for api-client
      // Type-safe access via global.d.ts Window interface extension
      if (typeof window !== 'undefined') {
        window.__operatingAccount = accountId;
        window.__operatingMode = mode;
      }
    },
    [user]
  );

  /**
   * Return to native mode (operating in your own account)
   */
  const exitOperatingMode = useCallback(() => {
    if (!user) return;

    console.log('Exiting operating mode, returning to native');

    setOperating({
      mode: 'native',
      accountId: user.accountId,
    });

    // Increment version to invalidate caches
    setOperatingContextVersion((v) => v + 1);

    // Clear window globals
    // Type-safe access via global.d.ts Window interface extension
    if (typeof window !== 'undefined') {
      delete window.__operatingAccount;
      delete window.__operatingMode;
    }
  }, [user]);

  /**
   * Get headers for API requests based on current operating context
   */
  const getOperatingHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};

    // Only add operating headers if not in native mode
    if (operating.mode !== 'native' && operating.accountId !== user?.accountId) {
      headers['X-Operating-Account'] = operating.accountId;
      headers['X-Operating-Mode'] = operating.mode;
    }

    return headers;
  }, [operating, user]);

  /**
   * Check if currently in operating mode (not native)
   */
  const isOperatingMode = operating.mode !== 'native' && operating.accountId !== user?.accountId;

  const value: OperatingContextType = {
    operating,
    switchAccount,
    exitOperatingMode,
    getOperatingHeaders,
    isOperatingMode,
    operatingContextVersion,
  };

  return <OperatingContext.Provider value={value}>{children}</OperatingContext.Provider>;
}

/**
 * Hook to access operating context
 */
export function useOperating() {
  const context = useContext(OperatingContext);
  if (context === undefined) {
    throw new Error('useOperating must be used within an OperatingProvider');
  }
  return context;
}
