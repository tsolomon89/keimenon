/**
 * Console Context
 *
 * Provides reactive state for the Console Footer component
 * Integrates with ErrorCaptureService to provide real-time error updates
 *
 * Usage:
 * ```typescript
 * const { errors, logs, clearErrors } = useConsole();
 * const { errors: importErrors } = useConsoleErrors({ domain: 'import' });
 * ```
 */

'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  errorCapture,
  CapturedError,
  ErrorDomain,
  ErrorSeverity,
  ErrorFilters,
} from '@/services/error-capture.service';

interface ConsoleContextValue {
  // Errors
  errors: CapturedError[];
  errorCounts: Record<ErrorSeverity, number>;

  // Filtering
  activeFilters: ErrorFilters;
  setFilters: (filters: ErrorFilters) => void;
  clearFilters: () => void;

  // Actions
  clearErrors: () => void;
  clearErrorsByDomain: (domain: ErrorDomain) => void;
  exportErrors: (format: 'json' | 'csv') => string;

  // UI State
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  activeTab: 'console' | 'logs' | 'tasks' | 'shortcuts';
  setActiveTab: (tab: 'console' | 'logs' | 'tasks' | 'shortcuts') => void;
}

const ConsoleContext = createContext<ConsoleContextValue | undefined>(undefined);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [errors, setErrors] = useState<CapturedError[]>([]);
  const [errorCounts, setErrorCounts] = useState<Record<ErrorSeverity, number>>({
    error: 0,
    warn: 0,
    info: 0,
    debug: 0,
  });
  const [activeFilters, setActiveFiltersState] = useState<ErrorFilters>({});
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'console' | 'logs' | 'tasks' | 'shortcuts'>('console');

  // Subscribe to error capture service
  useEffect(() => {
    // Load initial errors
    const initial = errorCapture.getRecent(1000, activeFilters);
    setErrors(initial);
    setErrorCounts(errorCapture.getCounts());

    // Subscribe to new errors
    const unsubscribe = errorCapture.subscribe((error) => {
      // Check if error matches active filters
      if (matchesFilters(error, activeFilters)) {
        setErrors((prev) => [error, ...prev].slice(0, 1000)); // Keep last 1000
      }
      setErrorCounts(errorCapture.getCounts());
    });

    return unsubscribe;
  }, [activeFilters]);

  // Handle keyboard shortcut (backtick to toggle console)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '`' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        // Don't trigger if user is typing in an input
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }

        event.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Set filters and refresh errors
  const setFilters = useCallback((filters: ErrorFilters) => {
    setActiveFiltersState(filters);
    const filtered = errorCapture.getRecent(1000, filters);
    setErrors(filtered);
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setActiveFiltersState({});
    const all = errorCapture.getRecent(1000);
    setErrors(all);
  }, []);

  // Clear all errors
  const clearErrors = useCallback(() => {
    errorCapture.clear();
    setErrors([]);
    setErrorCounts({ error: 0, warn: 0, info: 0, debug: 0 });
  }, []);

  // Clear errors by domain
  const clearErrorsByDomain = useCallback(
    (domain: ErrorDomain) => {
      errorCapture.clearFiltered({ domain });
      const remaining = errorCapture.getRecent(1000, activeFilters);
      setErrors(remaining);
      setErrorCounts(errorCapture.getCounts());
    },
    [activeFilters]
  );

  // Export errors
  const exportErrors = useCallback(
    (format: 'json' | 'csv'): string => {
      if (format === 'json') {
        return errorCapture.exportJSON(activeFilters);
      } else {
        return errorCapture.exportCSV(activeFilters);
      }
    },
    [activeFilters]
  );

  const value: ConsoleContextValue = {
    errors,
    errorCounts,
    activeFilters,
    setFilters,
    clearFilters,
    clearErrors,
    clearErrorsByDomain,
    exportErrors,
    isOpen,
    setIsOpen,
    activeTab,
    setActiveTab,
  };

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

/**
 * Hook to access console context
 */
export function useConsole() {
  const context = useContext(ConsoleContext);
  if (!context) {
    throw new Error('useConsole must be used within ConsoleProvider');
  }
  return context;
}

/**
 * Hook to get errors with specific filters
 * Convenience wrapper around useConsole
 */
export function useConsoleErrors(filters?: ErrorFilters) {
  const { errors } = useConsole();

  const filtered = React.useMemo(() => {
    if (!filters) return errors;

    return errors.filter((error) => matchesFilters(error, filters));
  }, [errors, filters]);

  return {
    errors: filtered,
    count: filtered.length,
    errorCount: filtered.filter((e) => e.severity === 'error').length,
    warnCount: filtered.filter((e) => e.severity === 'warn').length,
    infoCount: filtered.filter((e) => e.severity === 'info').length,
  };
}

/**
 * Hook to get errors for a specific domain
 */
export function useDomainErrors(domain: ErrorDomain) {
  return useConsoleErrors({ domain });
}

// Helper function to check if error matches filters
function matchesFilters(error: CapturedError, filters: ErrorFilters): boolean {
  if (filters.domain) {
    const domains = Array.isArray(filters.domain) ? filters.domain : [filters.domain];
    if (!domains.includes(error.domain)) return false;
  }

  if (filters.severity) {
    const severities = Array.isArray(filters.severity) ? filters.severity : [filters.severity];
    if (!severities.includes(error.severity)) return false;
  }

  if (filters.search) {
    const search = filters.search.toLowerCase();
    const matches =
      error.message.toLowerCase().includes(search) ||
      error.operation.toLowerCase().includes(search);
    if (!matches) return false;
  }

  if (filters.startTime && error.timestamp < filters.startTime) {
    return false;
  }

  if (filters.endTime && error.timestamp > filters.endTime) {
    return false;
  }

  return true;
}
