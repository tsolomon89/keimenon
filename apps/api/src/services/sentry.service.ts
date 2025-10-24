/**
 * Sentry Error Tracking Service
 *
 * Privacy-respecting, opt-in error tracking for production monitoring.
 *
 * Features:
 * - Opt-in only (requires SENTRY_DSN environment variable)
 * - PII scrubbing (removes sensitive data before sending)
 * - Configurable sampling rates
 * - Support for self-hosted Sentry
 * - Request context capture
 * - User context (non-PII only: account ID, user ID)
 *
 * Usage:
 * ```typescript
 * import { initSentry, captureError } from './services/sentry.service';
 *
 * // Initialize in index.ts
 * initSentry(app);
 *
 * // Capture errors
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   captureError(err, { context: { operation: 'riskyOperation' } });
 *   throw err;
 * }
 * ```
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { requestDataIntegration } from '@sentry/node';
import { Express, Request, Response, NextFunction } from 'express';

/**
 * Check if Sentry is enabled
 */
export function isSentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}

/**
 * Initialize Sentry error tracking
 *
 * Call this BEFORE any other middleware or routes.
 *
 * @param app Express application instance
 */
export function initSentry(app: Express): void {
  // Only initialize if DSN is provided (opt-in)
  if (!process.env.SENTRY_DSN) {
    console.log('📊 Sentry: Disabled (no SENTRY_DSN provided)');
    return;
  }

  const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production';
  const sampleRate = parseFloat(process.env.SENTRY_SAMPLE_RATE || '1.0');
  const tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1');
  const profilingEnabled = process.env.SENTRY_PROFILING_ENABLED === 'true';
  const scrubPII = process.env.SENTRY_SCRUB_PII !== 'false'; // Default: true

  console.log(`📊 Sentry: Initializing (env: ${environment}, sample: ${sampleRate})`);

  // Initialize Sentry
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment,

    // Sample rates
    sampleRate,
    tracesSampleRate,

    // Integrations
    integrations: [
      // Profiling (optional, requires opt-in)
      ...(profilingEnabled ? [nodeProfilingIntegration()] : []),
    ],

    // PII scrubbing
    beforeSend(event, hint) {
      if (scrubPII) {
        // Remove sensitive data
        if (event.request) {
          // Scrub headers
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
            delete event.request.headers['x-api-key'];
          }

          // Scrub query parameters
          if (event.request.query_string) {
            if (typeof event.request.query_string === 'string') {
              event.request.query_string = event.request.query_string
                .replace(/token=[^&]*/gi, 'token=[REDACTED]')
                .replace(/password=[^&]*/gi, 'password=[REDACTED]')
                .replace(/key=[^&]*/gi, 'key=[REDACTED]');
            }
          }
        }

        // Remove user email if present
        if (event.user?.email) {
          delete event.user.email;
        }

        // Scrub extra context
        if (event.extra) {
          Object.keys(event.extra).forEach((key) => {
            if (
              key.toLowerCase().includes('password') ||
              key.toLowerCase().includes('token') ||
              key.toLowerCase().includes('secret')
            ) {
              event.extra![key] = '[REDACTED]';
            }
          });
        }
      }

      return event;
    },

    // Only send errors in production (avoid noise in development)
    enabled: environment === 'production',
  });

  console.log('📊 Sentry: Initialized successfully');
}

/**
 * Add Sentry error handler middleware
 *
 * Call this AFTER all routes but BEFORE other error handlers.
 *
 * @param app Express application instance
 */
export function addSentryErrorHandler(app: Express): void {
  if (!isSentryEnabled()) {
    return;
  }

  // Sentry v10 automatic error handling - just needs Sentry.init() to be called
  // Errors are automatically captured when they bubble through Express
}

/**
 * Capture an error with context
 *
 * @param error Error to capture
 * @param context Additional context (tags, extra data, user info)
 */
export function captureError(
  error: Error,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    user?: {
      id?: string;
      accountId?: string;
      rank?: string;
    };
    level?: Sentry.SeverityLevel;
  }
): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.withScope((scope) => {
    // Add tags
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    // Add extra context
    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    // Add user context (non-PII)
    if (context?.user) {
      scope.setUser({
        id: context.user.id,
        // Do NOT include email to respect privacy
        // Custom fields
        accountId: context.user.accountId,
        rank: context.user.rank,
      });
    }

    // Set level
    if (context?.level) {
      scope.setLevel(context.level);
    }

    // Capture exception
    Sentry.captureException(error);
  });
}

/**
 * Capture a message (non-error event)
 *
 * @param message Message to capture
 * @param level Severity level
 * @param context Additional context
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
  }
): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.withScope((scope) => {
    // Add tags
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    // Add extra context
    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    scope.setLevel(level);
    Sentry.captureMessage(message);
  });
}

/**
 * Set user context for all subsequent Sentry events
 *
 * @param user User information (non-PII)
 */
export function setSentryUser(
  user: { id: string; accountId?: string; rank?: string } | null
): void {
  if (!isSentryEnabled()) {
    return;
  }

  if (user) {
    Sentry.setUser({
      id: user.id,
      // Do NOT include email to respect privacy
      accountId: user.accountId,
      rank: user.rank,
    });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Create Sentry middleware for Express routes
 *
 * Automatically captures errors and adds request context.
 *
 * Usage:
 * ```typescript
 * router.get('/endpoint', sentryMiddleware, asyncHandler(async (req, res) => {
 *   // Your route logic
 * }));
 * ```
 */
export function sentryMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isSentryEnabled()) {
    return next();
  }

  // Add user context from JWT if available
  const user = (req as any).user;
  if (user) {
    setSentryUser({
      id: user.userId,
      accountId: user.accountId,
      rank: user.rank,
    });
  }

  return next();
}

export default {
  initSentry,
  addSentryErrorHandler,
  captureError,
  captureMessage,
  setSentryUser,
  sentryMiddleware,
  isSentryEnabled,
};
