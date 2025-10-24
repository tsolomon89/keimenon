'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * UIVersion: Toggle between legacy and primitives-based UI
 * - legacy: Original component architecture
 * - primitives: New nine-primitive architecture
 */
type UIVersion = 'legacy' | 'primitives';

interface UIVersionContextType {
  uiVersion: UIVersion;
  setUIVersion: (version: UIVersion) => void;
  toggleUIVersion: () => void;
  isPrimitivesMode: () => boolean;
  isLegacyMode: () => boolean;
}

const UIVersionContext = createContext<UIVersionContextType | undefined>(undefined);

export function UIVersionProvider({ children }: { children: React.ReactNode }) {
  const [uiVersion, setUIVersionState] = useState<UIVersion>('legacy');

  const setUIVersion = useCallback((version: UIVersion) => {
    setUIVersionState(version);
    console.log('UI version changed:', version);
  }, []);

  const toggleUIVersion = useCallback(() => {
    setUIVersionState((prev) => {
      const next = prev === 'legacy' ? 'primitives' : 'legacy';
      console.log('UI version toggled:', prev, '→', next);
      return next;
    });
  }, []);

  const isPrimitivesMode = useCallback(() => {
    return uiVersion === 'primitives';
  }, [uiVersion]);

  const isLegacyMode = useCallback(() => {
    return uiVersion === 'legacy';
  }, [uiVersion]);

  const value: UIVersionContextType = {
    uiVersion,
    setUIVersion,
    toggleUIVersion,
    isPrimitivesMode,
    isLegacyMode,
  };

  return <UIVersionContext.Provider value={value}>{children}</UIVersionContext.Provider>;
}

/**
 * Hook to access UI version context
 */
export function useUIVersion() {
  const context = useContext(UIVersionContext);
  if (context === undefined) {
    throw new Error('useUIVersion must be used within a UIVersionProvider');
  }
  return context;
}
