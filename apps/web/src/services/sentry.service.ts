/**
 * Sentry Error Tracking Service (Frontend)
 *
 * Privacy-respecting, opt-in error tracking for React application.
 *
 * Features:
 * - Opt-in only (requires NEXT_PUBLIC_SENTRY_DSN environment variable)
 * - PII scrubbing (removes sensitive data before sending)
 * - Integrates with existing ErrorCaptureService
 * - User consent tracking
 * - Support for self-hosted Sentry
 *
 * Usage:
 * ```typescript
 * import { initSentry, captureError } from '@/services/sentry.service';
 *
 * // Initialize in layout.tsx or _app.tsx
 * initSentry();
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

import * as Sentry from '@sentry/react';
import {
  SENTRY_DSN,
  SENTRY_ENVIRONMENT,
  SENTRY_SAMPLE_RATE,
  SENTRY_TRACES_SAMPLE_RATE,
  SENTRY_REPLAY_SESSION_SAMPLE_RATE,
  SENTRY_REPLAY_ERROR_SAMPLE_RATE,
  SENTRY_SCRUB_PII,
} from '@/lib/env.config';

/**
 * Check if Sentry is enabled
 */
export function isSentryEnabled(): boolean {
  return Boolean(SENTRY_DSN);
}

/**
 * Check if user has consented to error tracking
 */
export function hasUserConsent(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const consent = localStorage.getItem('sentry_consent');
  return consent === 'true';
}

/**
 * Set user consent for error tracking
 */
export function setUserConsent(consent: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem('sentry_consent', consent ? 'true' : 'false');

  // If consent is revoked, disable Sentry
  if (!consent && isSentryEnabled()) {
    Sentry.close();
  }
}

/**
 * Initialize Sentry error tracking
 *
 * Call this in your root layout or _app.tsx file.
 */
export function initSentry(): void {
  // Only initialize if DSN is provided and user has consented
  if (!SENTRY_DSN) {
    console.log('📊 Sentry: Disabled (no NEXT_PUBLIC_SENTRY_DSN provided)');
    return;
  }

  if (!hasUserConsent()) {
    console.log('📊 Sentry: Disabled (user has not consented)');
    return;
  }

  console.log(
    `📊 Sentry: Initializing (env: ${SENTRY_ENVIRONMENT}, sample: ${SENTRY_SAMPLE_RATE})`
  );

  // Initialize Sentry
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,

    // Sample rates
    sampleRate: SENTRY_SAMPLE_RATE,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,

    // Integrations
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
        maskAllInputs: true,
      }),
    ],

    // Session replay sample rates
    replaysSessionSampleRate: SENTRY_REPLAY_SESSION_SAMPLE_RATE,
    replaysOnErrorSampleRate: SENTRY_REPLAY_ERROR_SAMPLE_RATE,

    // PII scrubbing
    beforeSend(event, hint) {
      if (SENTRY_SCRUB_PII) {
        // Remove sensitive data from breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
            // Scrub data from breadcrumb
            if (breadcrumb.data) {
              Object.keys(breadcrumb.data).forEach((key) => {
                if (
                  key.toLowerCase().includes('password') ||
                  key.toLowerCase().includes('token') ||
                  key.toLowerCase().includes('secret') ||
                  key.toLowerCase().includes('email')
                ) {
                  breadcrumb.data![key] = '[REDACTED]';
                }
              });
            }
            return breadcrumb;
          });
        }

        // Remove user email if present
        if (event.user?.email) {
          delete event.user.email;
        }

        // Scrub request data
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
    enabled: SENTRY_ENVIRONMENT === 'production',
  });

  console.log('📊 Sentry: Initialized successfully');
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
  if (!isSentryEnabled() || !hasUserConsent()) {
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
  if (!isSentryEnabled() || !hasUserConsent()) {
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
  if (!isSentryEnabled() || !hasUserConsent()) {
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

export default {
  initSentry,
  captureError,
  captureMessage,
  setSentryUser,
  isSentryEnabled,
  hasUserConsent,
  setUserConsent,
};
