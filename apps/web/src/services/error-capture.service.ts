/**
 * Error Capture Service
 *
 * Centralized error handling system that:
 * - Captures all errors automatically (window errors, promise rejections, manual captures)
 * - Categorizes errors by domain (API, Import, Analytics, UI, Database)
 * - Routes errors to Console Footer in real-time
 * - Optionally sends errors to Sentry (if enabled and user consented)
 * - Provides filtering and querying capabilities
 * - Requires minimal maintenance
 *
 * Usage:
 * ```typescript
 * import { errorCapture } from '@/services/error-capture.service';
 *
 * // Manual capture
 * errorCapture.capture(error, {
 *   domain: 'import',
 *   operation: 'import.processFile',
 *   metadata: { fileName: 'chat.json' }
 * });
 *
 * // Subscribe to errors
 * const unsubscribe = errorCapture.subscribe((error) => {
 *   console.log('Error captured:', error);
 * });
 * ```
 */

import * as SentryService from './sentry.service';

export type ErrorDomain = 'api' | 'import' | 'analytics' | 'ui' | 'database' | 'system' | 'jobs';
export type ErrorSeverity = 'error' | 'warn' | 'info' | 'debug';

export interface ErrorContext {
  domain: ErrorDomain;
  operation: string; // e.g., 'analytics.fetchOverview', 'import.processFile'
  userId?: string;
  accountId?: string;
  metadata?: Record<string, any>;
}

export interface CapturedError {
  id: string;
  timestamp: number;
  domain: ErrorDomain;
  operation: string;
  message: string;
  stack?: string;
  severity: ErrorSeverity;
  context: ErrorContext;
  error: Error;
  userMessage?: string; // User-friendly message
}

export interface ErrorFilters {
  domain?: ErrorDomain | ErrorDomain[];
  severity?: ErrorSeverity | ErrorSeverity[];
  search?: string;
  startTime?: number;
  endTime?: number;
}

type ErrorSubscriber = (error: CapturedError) => void;

class ErrorCaptureService {
  private errors: CapturedError[] = [];
  private subscribers: Set<ErrorSubscriber> = new Set();
  private maxErrors = 1000; // Circular buffer limit
  private isInitialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initialize();
    }
  }

  /**
   * Initialize global error listeners
   */
  private initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Capture unhandled JavaScript errors
    window.addEventListener('error', (event) => {
      this.capture(event.error || new Error(event.message), {
        domain: 'system',
        operation: 'window.error',
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));

      this.capture(error, {
        domain: 'system',
        operation: 'unhandledRejection',
        metadata: {
          reason: event.reason,
        },
      });
    });

    // Log service initialization
    this.info('ErrorCaptureService initialized', {
      domain: 'system',
      operation: 'errorCapture.init',
    });
  }

  /**
   * Capture an error with context
   */
  capture(
    error: Error | string,
    context: ErrorContext,
    severity: ErrorSeverity = 'error'
  ): CapturedError {
    // For info/debug, don't create Error objects (no stack trace needed)
    // For error/warn, ensure we have an Error object with stack trace
    const errorObj =
      typeof error === 'string'
        ? severity === 'error' || severity === 'warn'
          ? new Error(error)
          : ({ message: error, name: 'LogMessage' } as Error)
        : error;

    const capturedError: CapturedError = {
      id: this.generateId(),
      timestamp: Date.now(),
      domain: context.domain,
      operation: context.operation,
      message: errorObj.message,
      stack: errorObj.stack,
      severity,
      context,
      error: errorObj,
      userMessage: this.getUserMessage(errorObj, context),
    };

    // Add to circular buffer
    this.errors.push(capturedError);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift(); // Remove oldest
    }

    // Persist critical errors to localStorage
    if (severity === 'error') {
      this.persistError(capturedError);
    }

    // Notify subscribers
    this.notifySubscribers(capturedError);

    // Send to Sentry (if enabled and user consented)
    if (severity === 'error' || severity === 'warn') {
      SentryService.captureError(errorObj, {
        tags: {
          domain: context.domain,
          operation: context.operation,
        },
        extra: {
          ...context.metadata,
          severity,
        },
        user:
          context.userId && context.accountId
            ? {
                id: context.userId,
                accountId: context.accountId,
              }
            : undefined,
        level: severity === 'error' ? 'error' : 'warning',
      });
    }

    // Log to console in development using appropriate console method
    if (process.env.NODE_ENV === 'development') {
      const style = this.getConsoleStyle(severity);
      console.group(`%c[${context.domain}] ${context.operation}`, style);

      // Use appropriate console method based on severity
      switch (severity) {
        case 'error':
          console.error(errorObj);
          break;
        case 'warn':
          console.warn(errorObj);
          break;
        case 'info':
          console.info(errorObj);
          break;
        case 'debug':
          console.debug(errorObj);
          break;
      }

      if (context.metadata) {
        console.log('Metadata:', context.metadata);
      }
      console.groupEnd();
    }

    return capturedError;
  }

  /**
   * Convenience methods for different severity levels
   */
  error(message: string, context: Partial<ErrorContext> = {}): CapturedError {
    return this.capture(
      new Error(message),
      {
        domain: context.domain || 'system',
        operation: context.operation || 'unknown',
        ...context,
      },
      'error'
    );
  }

  warn(message: string, context: Partial<ErrorContext> = {}): CapturedError {
    return this.capture(
      new Error(message),
      {
        domain: context.domain || 'system',
        operation: context.operation || 'unknown',
        ...context,
      },
      'warn'
    );
  }

  info(message: string, context: Partial<ErrorContext> = {}): CapturedError {
    return this.capture(
      message, // Pass string directly - no Error object for info logs
      {
        domain: context.domain || 'system',
        operation: context.operation || 'unknown',
        ...context,
      },
      'info'
    );
  }

  debug(message: string, context: Partial<ErrorContext> = {}): CapturedError {
    return this.capture(
      message, // Pass string directly - no Error object for debug logs
      {
        domain: context.domain || 'system',
        operation: context.operation || 'unknown',
        ...context,
      },
      'debug'
    );
  }

  /**
   * Subscribe to error stream
   * Returns unsubscribe function
   */
  subscribe(callback: ErrorSubscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Get recent errors with optional filters
   */
  getRecent(limit: number = 50, filters?: ErrorFilters): CapturedError[] {
    let filtered = [...this.errors];

    // Apply filters
    if (filters) {
      if (filters.domain) {
        const domains = Array.isArray(filters.domain) ? filters.domain : [filters.domain];
        filtered = filtered.filter((e) => domains.includes(e.domain));
      }

      if (filters.severity) {
        const severities = Array.isArray(filters.severity) ? filters.severity : [filters.severity];
        filtered = filtered.filter((e) => severities.includes(e.severity));
      }

      if (filters.search) {
        const search = filters.search.toLowerCase();
        filtered = filtered.filter(
          (e) =>
            e.message.toLowerCase().includes(search) || e.operation.toLowerCase().includes(search)
        );
      }

      if (filters.startTime) {
        filtered = filtered.filter((e) => e.timestamp >= filters.startTime!);
      }

      if (filters.endTime) {
        filtered = filtered.filter((e) => e.timestamp <= filters.endTime!);
      }
    }

    // Sort by timestamp (newest first) and limit
    return filtered.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  /**
   * Get errors grouped by domain
   */
  getByDomain(): Record<ErrorDomain, CapturedError[]> {
    const grouped: Record<ErrorDomain, CapturedError[]> = {
      api: [],
      import: [],
      analytics: [],
      ui: [],
      database: [],
      system: [],
      jobs: [],
    };

    this.errors.forEach((error) => {
      grouped[error.domain].push(error);
    });

    return grouped;
  }

  /**
   * Get error counts by severity
   */
  getCounts(): Record<ErrorSeverity, number> {
    const counts: Record<ErrorSeverity, number> = {
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
    };

    this.errors.forEach((error) => {
      counts[error.severity]++;
    });

    return counts;
  }

  /**
   * Clear all errors
   */
  clear() {
    this.errors = [];
    this.clearPersistedErrors();
    this.info('Error log cleared', {
      domain: 'system',
      operation: 'errorCapture.clear',
    });
  }

  /**
   * Clear errors by filter
   */
  clearFiltered(filters: ErrorFilters) {
    const toKeep = this.errors.filter((error) => {
      if (filters.domain) {
        const domains = Array.isArray(filters.domain) ? filters.domain : [filters.domain];
        if (!domains.includes(error.domain)) return true;
      }
      if (filters.severity) {
        const severities = Array.isArray(filters.severity) ? filters.severity : [filters.severity];
        if (!severities.includes(error.severity)) return true;
      }
      return false;
    });

    this.errors = toKeep;
  }

  /**
   * Export errors as JSON
   */
  exportJSON(filters?: ErrorFilters): string {
    const errors = filters ? this.getRecent(this.maxErrors, filters) : this.errors;
    return JSON.stringify(errors, null, 2);
  }

  /**
   * Export errors as CSV
   */
  exportCSV(filters?: ErrorFilters): string {
    const errors = filters ? this.getRecent(this.maxErrors, filters) : this.errors;

    const headers = ['Timestamp', 'Domain', 'Operation', 'Severity', 'Message'];
    const rows = errors.map((e) => [
      new Date(e.timestamp).toISOString(),
      e.domain,
      e.operation,
      e.severity,
      `"${e.message.replace(/"/g, '""')}"`, // Escape quotes
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  // Private helper methods

  private generateId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private notifySubscribers(error: CapturedError) {
    this.subscribers.forEach((subscriber) => {
      try {
        subscriber(error);
      } catch (err) {
        console.error('[ErrorCaptureService] Subscriber error:', err);
      }
    });
  }

  private getUserMessage(error: Error, context: ErrorContext): string {
    // Generate user-friendly messages based on domain
    switch (context.domain) {
      case 'api':
        return 'Failed to communicate with server. Please check your connection.';
      case 'import':
        return 'Import failed. Please check your file format and try again.';
      case 'analytics':
        return 'Failed to load analytics data. Please refresh the page.';
      case 'database':
        return 'Database operation failed. Please contact support.';
      case 'ui':
        return 'Something went wrong. Please refresh the page.';
      default:
        return error.message;
    }
  }

  private getConsoleStyle(severity: ErrorSeverity): string {
    switch (severity) {
      case 'error':
        return 'color: #ef4444; font-weight: bold';
      case 'warn':
        return 'color: #f59e0b; font-weight: bold';
      case 'info':
        return 'color: #3b82f6; font-weight: normal';
      case 'debug':
        return 'color: #64748b; font-weight: normal';
    }
  }

  private persistError(error: CapturedError) {
    try {
      const key = 'canvas_memory_critical_errors';
      const stored = localStorage.getItem(key);
      const errors = stored ? JSON.parse(stored) : [];

      // Keep only last 50 critical errors
      errors.push(error);
      if (errors.length > 50) {
        errors.shift();
      }

      localStorage.setItem(key, JSON.stringify(errors));
    } catch (err) {
      console.error('[ErrorCaptureService] Failed to persist error:', err);
    }
  }

  private clearPersistedErrors() {
    try {
      localStorage.removeItem('canvas_memory_critical_errors');
    } catch (err) {
      console.error('[ErrorCaptureService] Failed to clear persisted errors:', err);
    }
  }
}

// Singleton instance
export const errorCapture = new ErrorCaptureService();
