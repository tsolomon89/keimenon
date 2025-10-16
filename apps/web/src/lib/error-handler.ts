/**
 * Centralized error handling utilities
 */

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
 * Error handler for API calls
 */
export async function handleApiError(error: any): Promise<never> {
  // Network errors
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    throw new NetworkError('Unable to connect to server. Please check your connection.');
  }

  // HTTP errors
  if (error.response) {
    const status = error.response.status;
    const data = await error.response.json().catch(() => ({}));

    switch (status) {
      case 400:
        throw new ValidationError(
          data.message || 'Invalid request',
          data.errors || data
        );
      case 401:
        throw new AuthError(data.message || 'Authentication required');
      case 403:
        throw new AuthError(data.message || 'Access forbidden');
      case 404:
        throw new AppError(data.message || 'Resource not found', 'NOT_FOUND', 404);
      case 413:
        throw new FileError('File is too large', { maxSize: '10MB' });
      case 422:
        throw new ValidationError(
          data.message || 'Validation failed',
          data.errors || data
        );
      case 500:
        throw new AppError(
          data.message || 'Internal server error',
          'SERVER_ERROR',
          500
        );
      case 503:
        throw new NetworkError('Service temporarily unavailable');
      default:
        throw new AppError(
          data.message || 'An unexpected error occurred',
          'UNKNOWN_ERROR',
          status
        );
    }
  }

  // Generic errors
  throw new AppError(
    error.message || 'An unexpected error occurred',
    'UNKNOWN_ERROR'
  );
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

  throw new FileError(
    error.message || 'Failed to process file',
    { fileName, originalError: error }
  );
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
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = true,
    onRetry,
  } = options;

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
export function safeJsonParse<T = any>(
  json: string,
  fallback?: T
): T | undefined {
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
