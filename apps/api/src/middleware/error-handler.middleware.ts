/**
 * Error Handler Middleware
 *
 * Centralized error handling for Express routes.
 * Captures errors, logs them, and returns user-friendly responses.
 *
 * Usage:
 *   import { asyncHandler, errorLogger } from '@/middleware/error-handler.middleware';
 *
 *   router.get('/endpoint', asyncHandler(async (req, res) => {
 *     // Your route logic here
 *     // Errors will be automatically caught and handled
 *   }));
 *
 *   // Add error logger at the end of your router setup
 *   app.use(errorLogger);
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Error context for logging and debugging
 */
interface ErrorContext {
  domain: 'api' | 'import' | 'analytics' | 'ui' | 'database' | 'system';
  operation: string;
  userId?: string;
  accountId?: string;
  metadata?: Record<string, any>;
}

/**
 * Custom error class with context
 */
export class APIError extends Error {
  statusCode: number;
  context: ErrorContext;
  userMessage?: string;
  isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    context: Partial<ErrorContext> = {},
    userMessage?: string
  ) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.context = {
      domain: context.domain || 'api',
      operation: context.operation || 'unknown',
      userId: context.userId,
      accountId: context.accountId,
      metadata: context.metadata,
    };
    this.userMessage = userMessage;
    this.isOperational = true; // Operational errors are expected (vs programmer errors)
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async handler wrapper - catches promise rejections
 *
 * Wraps async route handlers to catch errors and pass them to error middleware
 *
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await getUsersFromDB();
 *   res.json({ users });
 * }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Error logger middleware
 *
 * Logs errors and sends appropriate responses to clients
 * Add this at the end of your Express app setup
 */
export function errorLogger(
  err: Error | APIError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Skip if response already sent
  if (res.headersSent) {
    return next(err);
  }

  // Extract error details
  const isAPIError = err instanceof APIError;
  const statusCode = isAPIError ? err.statusCode : 500;
  const userMessage =
    isAPIError && err.userMessage
      ? err.userMessage
      : statusCode === 500
        ? 'An internal server error occurred'
        : err.message;

  // Build error context
  const context: ErrorContext = isAPIError
    ? err.context
    : {
        domain: 'api',
        operation: `${req.method} ${req.path}`,
        userId: (req as any).user?.userId,
        accountId: (req as any).user?.accountId,
        metadata: {
          method: req.method,
          path: req.path,
          query: req.query,
          ip: req.ip,
          userAgent: req.get('user-agent'),
        },
      };

  // Log error (in production, this would go to a logging service)
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  console[logLevel]('[API Error]', {
    message: err.message,
    statusCode,
    context,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      message: userMessage,
      code: statusCode,
      domain: context.domain,
      operation: context.operation,
      // Only include stack trace in development
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}

/**
 * Not Found handler
 *
 * Handles 404 errors for undefined routes
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  const error = new APIError(
    `Route ${req.method} ${req.path} not found`,
    404,
    {
      domain: 'api',
      operation: 'route.notFound',
      metadata: {
        method: req.method,
        path: req.path,
      },
    },
    'The requested resource was not found'
  );
  next(error);
}

/**
 * Common error factories
 */
export const ErrorFactory = {
  /**
   * 400 Bad Request
   */
  badRequest: (message: string, operation: string, metadata?: Record<string, any>) => {
    return new APIError(
      message,
      400,
      { domain: 'api', operation, metadata },
      'Invalid request. Please check your input.'
    );
  },

  /**
   * 401 Unauthorized
   */
  unauthorized: (operation: string) => {
    return new APIError(
      'Authentication required',
      401,
      { domain: 'api', operation },
      'You must be logged in to access this resource.'
    );
  },

  /**
   * 403 Forbidden
   */
  forbidden: (operation: string, reason?: string) => {
    return new APIError(
      reason || 'Insufficient permissions',
      403,
      { domain: 'api', operation },
      'You do not have permission to access this resource.'
    );
  },

  /**
   * 404 Not Found
   */
  notFound: (resource: string, operation: string) => {
    return new APIError(
      `${resource} not found`,
      404,
      { domain: 'api', operation },
      `The requested ${resource.toLowerCase()} could not be found.`
    );
  },

  /**
   * 409 Conflict
   */
  conflict: (message: string, operation: string, metadata?: Record<string, any>) => {
    return new APIError(
      message,
      409,
      { domain: 'api', operation, metadata },
      'The request could not be completed due to a conflict.'
    );
  },

  /**
   * 500 Internal Server Error
   */
  internal: (message: string, operation: string, metadata?: Record<string, any>) => {
    return new APIError(
      message,
      500,
      { domain: 'api', operation, metadata },
      'An internal server error occurred. Please try again later.'
    );
  },

  /**
   * Database error
   */
  database: (message: string, operation: string, metadata?: Record<string, any>) => {
    return new APIError(
      message,
      500,
      { domain: 'database', operation, metadata },
      'A database error occurred. Please try again later.'
    );
  },
};
