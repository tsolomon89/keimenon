/**
 * Centralized error handling utilities
 */

import { errorCapture, ErrorDomain, ErrorSeverity } from '@/services/error-capture.service';

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'NETWORK_ERROR', 503, details);
    this.name = 'NetworkError';
  }
}

export class FileError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'FILE_ERROR', 400, details);
    this.name = 'FileError';
  }
}

export class AuthError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'AUTH_ERROR', 401, details);
    this.name = 'AuthError';
  }
}

/**
 * Enhanced error handler for API calls
 * Automatically captures errors for console display
 * Now handles backend APIError format from error-handler.middleware.ts
 */
export async function handleApiError(error: any): Promise<never> {
  let appError: AppError;

  // Network errors (fetch failures, CORS, etc.)
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    appError = new NetworkError('Unable to connect to server. Please check your connection.');

    // Capture for console
    errorCapture.capture(
      appError,
      {
        domain: 'api',
        operation: 'network.fetch',
        metadata: { originalError: error.message },
      },
      'error'
    );

    throw appError;
  }

  // HTTP errors with response
  if (error.response) {
    const status = error.response.status;
    const data = await error.response.json().catch(() => ({}));

    // Extract backend error structure (from error-handler.middleware.ts)
    const backendError = data.error || {};
    const errorMessage = backendError.message || data.message || 'An error occurred';
    const errorDomain = backendError.domain || 'api';
    const errorOperation = backendError.operation || `api.${error.response.url || 'unknown'}`;

    // Map status code to error type with dynamic message
    const createError = (status: number): AppError => {
      switch (status) {
        case 400:
          return new ValidationError(errorMessage, data.errors || backendError);
        case 401:
          return new AuthError(errorMessage);
        case 403:
          return new AuthError(errorMessage);
        case 404:
          return new AppError(errorMessage, 'NOT_FOUND', 404);
        case 413:
          return new FileError(errorMessage, { maxSize: '10MB' });
        case 422:
          return new ValidationError(errorMessage, data.errors || backendError);
        case 500:
          return new AppError(errorMessage, 'SERVER_ERROR', 500);
        case 503:
          return new NetworkError(errorMessage);
        default:
          return new AppError(errorMessage, 'UNKNOWN_ERROR', status);
      }
    };

    appError = createError(status);

    // Determine severity based on status code
    const severity: ErrorSeverity = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    // Capture with backend context (preserves domain/operation from backend)
    errorCapture.capture(
      appError,
      {
        domain: errorDomain as any,
        operation: errorOperation,
        metadata: {
          statusCode: status,
          backendError,
          url: error.response.url,
        },
      },
      severity
    );

    throw appError;
  }

  // Generic errors (no HTTP response)
  appError = new AppError(error.message || 'An unexpected error occurred', 'UNKNOWN_ERROR');
  errorCapture.capture(
    appError,
    {
      domain: 'api',
      operation: 'unknown',
      metadata: { originalError: error },
    },
    'error'
  );
  throw appError;
}

/**
 * Error handler for file operations
 */
export function handleFileError(error: any, fileName?: string): never {
  if (error.name === 'SyntaxError') {
    throw new FileError(
      `Invalid JSON format in ${fileName || 'file'}. Please check the file structure.`,
      { originalError: error.message }
    );
  }

  if (error.code === 'ENOENT') {
    throw new FileError(`File not found: ${fileName}`);
  }

  if (error.code === 'EACCES') {
    throw new FileError(`Permission denied: ${fileName}`);
  }

  throw new FileError(error.message || 'Failed to process file', {
    fileName,
    originalError: error,
  });
}

/**
 * Get user-friendly error message
 */
export function getUserMessage(error: any): string {
  if (error instanceof AppError) {
    return error.message;
  }

  if (error.name === 'ValidationError') {
    return 'Please check your input and try again.';
  }

  if (error.name === 'NetworkError') {
    return 'Connection failed. Please check your internet connection.';
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Get error details for logging
 */
export function getErrorDetails(error: any): {
  message: string;
  code: string;
  stack?: string;
  details?: any;
} {
  if (error instanceof AppError) {
    return {
      message: error.message,
      code: error.code,
      stack: error.stack,
      details: error.details,
    };
  }

  return {
    message: error.message || 'Unknown error',
    code: error.code || 'UNKNOWN',
    stack: error.stack,
    details: error,
  };
}

/**
 * Log error (in development, also console.error)
 */
export function logError(error: any, context?: string) {
  const details = getErrorDetails(error);

  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context || 'Error'}]`, details);
  }

  // In production, you might want to send to error tracking service
  // e.g., Sentry, LogRocket, etc.
}

/**
 * Retry wrapper for async operations
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delay?: number;
    backoff?: boolean;
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, backoff = true, onRetry } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        if (onRetry) {
          onRetry(attempt, error);
        }

        const waitTime = backoff ? delay * Math.pow(2, attempt - 1) : delay;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError;
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T = any>(json: string, fallback?: T): T | undefined {
  try {
    return JSON.parse(json);
  } catch (error) {
    logError(error, 'JSON Parse');
    return fallback;
  }
}

/**
 * Wrap async function with error boundary
 */
export function withErrorBoundary<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: string
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(error, context);
      throw error;
    }
  }) as T;
}

/**
 * Log API events (successful operations)
 * Use for important operations that should appear in console
 *
 * Examples:
 * - File import started
 * - Job created
 * - Data deletion initiated
 * - Account switched
 */
export function logApiEvent(
  message: string,
  context: {
    domain?: ErrorDomain;
    operation: string;
    metadata?: Record<string, any>;
  }
) {
  errorCapture.info(message, {
    domain: context.domain || 'api',
    operation: context.operation,
    metadata: context.metadata,
  });
}

/**
 * Log data processing events
 * Use for tracking data transformation stages
 */
export function logDataEvent(message: string, operation: string, metadata?: Record<string, any>) {
  errorCapture.info(message, {
    domain: 'import',
    operation,
    metadata,
  });
}

/**
 * Log job events
 * Use for job lifecycle tracking
 */
export function logJobEvent(message: string, operation: string, metadata?: Record<string, any>) {
  errorCapture.info(message, {
    domain: 'jobs',
    operation,
    metadata,
  });
}
