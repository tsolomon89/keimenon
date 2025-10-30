/**
 * Centralized environment configuration for browser-safe access to environment variables.
 *
 * IMPORTANT: This file safely handles process.env access in browser contexts where
 * process may be undefined. All client-side code should import from here instead of
 * directly accessing process.env.
 */

/**
 * Safely get an environment variable value
 * Returns the value if available, otherwise returns the fallback
 */
function getEnv(key: string, fallback: string = ''): string {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || fallback;
  }
  return fallback;
}

/**
 * API Base URL - used for all backend API calls
 */
export const API_BASE_URL = getEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4001');

/**
 * Feature flags
 */
export const ENABLE_PRO_FEATURES = getEnv('NEXT_PUBLIC_ENABLE_PRO_FEATURES') === 'true';
export const ENABLE_BUSINESS_FEATURES = getEnv('NEXT_PUBLIC_ENABLE_BUSINESS_FEATURES') === 'true';
export const ENABLE_LEGACY_IMPORTS = getEnv('NEXT_PUBLIC_ENABLE_LEGACY_IMPORTS') === '1';
export const ENABLE_HYBRID_LOCAL_FIRST = getEnv('NEXT_PUBLIC_ENABLE_HYBRID_LOCAL_FIRST') === '1';

/**
 * Debug flags
 */
export const DEBUG_IMPORT_SELECTOR = getEnv('NEXT_PUBLIC_DEBUG_IMPORT_SELECTOR') === '1';

/**
 * Testing configuration
 */
export const E2E_TESTING = getEnv('NEXT_PUBLIC_E2E_TESTING') === 'true';

/**
 * Performance tuning
 */
export const JOB_POLL_INTERVAL_MS = parseInt(
  getEnv('NEXT_PUBLIC_JOB_POLL_INTERVAL_MS', '2000'),
  10
);
export const SSE_RECONNECT_TIMEOUT_MS = parseInt(
  getEnv('NEXT_PUBLIC_SSE_RECONNECT_TIMEOUT_MS', '5000'),
  10
);
export const MAX_JOB_WAIT_MS = parseInt(getEnv('NEXT_PUBLIC_MAX_JOB_WAIT_MS', '1500000'), 10);

/**
 * Sentry configuration
 */
export const SENTRY_DSN = getEnv('NEXT_PUBLIC_SENTRY_DSN');
export const SENTRY_ENVIRONMENT = getEnv(
  'NEXT_PUBLIC_SENTRY_ENVIRONMENT',
  getEnv('NODE_ENV', 'production')
);
export const SENTRY_SAMPLE_RATE = parseFloat(getEnv('NEXT_PUBLIC_SENTRY_SAMPLE_RATE', '1.0'));
export const SENTRY_TRACES_SAMPLE_RATE = parseFloat(
  getEnv('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', '0.1')
);
export const SENTRY_REPLAY_SESSION_SAMPLE_RATE = parseFloat(
  getEnv('NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE', '0.1')
);
export const SENTRY_REPLAY_ERROR_SAMPLE_RATE = parseFloat(
  getEnv('NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE', '1.0')
);
export const SENTRY_SCRUB_PII = getEnv('NEXT_PUBLIC_SENTRY_SCRUB_PII', 'true') !== 'false';

/**
 * Auth configuration
 */
export const AUTH_DOMAIN = getEnv('NEXT_PUBLIC_AUTH_DOMAIN');
export const AUTH_CLIENT_ID = getEnv('NEXT_PUBLIC_AUTH_CLIENT_ID');

/**
 * Node environment (server-side only, safe fallback for client)
 */
export const NODE_ENV = getEnv('NODE_ENV', 'production');
export const IS_DEVELOPMENT = NODE_ENV === 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
