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
 * On the server, we prefer the internal URL (docker container to container)
 * On the client, we use the public URL
 */
const internalUrl = getEnv('INTERNAL_API_URL');

// Helper to get query param without crashing in SSR/node
function getQueryParam(key: string): string | null {
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  }
  return null;
}

const STARTUP_STORAGE_KEYS = {
  apiPort: 'keimenon.startup.apiPort',
  dev: 'keimenon.startup.dev',
};

function getStartupContextValue(key: 'apiPort' | 'dev'): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const queryValue = getQueryParam(key);
  if (queryValue && queryValue.trim().length > 0) {
    try {
      window.sessionStorage.setItem(STARTUP_STORAGE_KEYS[key], queryValue);
    } catch {
      // no-op
    }
    return queryValue;
  }

  try {
    const stored = window.sessionStorage.getItem(STARTUP_STORAGE_KEYS[key]);
    if (stored && stored.trim().length > 0) {
      return stored;
    }
  } catch {
    // no-op
  }

  return null;
}

const dynamicPort = getStartupContextValue('apiPort');
const dynamicBaseUrl = dynamicPort ? `http://127.0.0.1:${dynamicPort}` : null;

export const API_BASE_URL =
  typeof window === 'undefined' && internalUrl
    ? internalUrl
    : dynamicBaseUrl || getEnv('NEXT_PUBLIC_API_URL', 'http://127.0.0.1:4001');

console.log('[Config] API_BASE_URL resolved to:', API_BASE_URL);

/**
 * Feature flags
 */
export const ENABLE_PRO_FEATURES = getEnv('NEXT_PUBLIC_ENABLE_PRO_FEATURES') === 'true';
export const ENABLE_BUSINESS_FEATURES = getEnv('NEXT_PUBLIC_ENABLE_BUSINESS_FEATURES') === 'true';
export const ENABLE_LEGACY_IMPORTS = getEnv('NEXT_PUBLIC_ENABLE_LEGACY_IMPORTS') === '1';
export const ENABLE_HYBRID_LOCAL_FIRST = getEnv('NEXT_PUBLIC_ENABLE_HYBRID_LOCAL_FIRST') === '1';
export const ENABLE_3D_RENDERER = getEnv('NEXT_PUBLIC_ENABLE_3D_RENDERER', 'true') !== 'false';

/**
 * SSE Direct Subscription Feature Flag (for phased rollout)
 *
 * When enabled, components subscribe directly to useJobStream instead of polling
 * BackgroundOperationsContext, eliminating race conditions and reducing latency.
 *
 * Rollout plan:
 * - Stage 1: false (old polling behavior for all users)
 * - Stage 2: true for dev/staging environments (internal testing)
 * - Stage 3: true for production (gradual rollout with monitoring)
 *
 * Default: true (enabled by default, can be disabled via env var for rollback)
 */
export const USE_DIRECT_SSE_SUBSCRIPTION = getEnv('NEXT_PUBLIC_USE_DIRECT_SSE') !== 'false'; // Defaults to true, opt-out

/**
 * Debug flags
 */
export const DEBUG_IMPORT_SELECTOR = getEnv('NEXT_PUBLIC_DEBUG_IMPORT_SELECTOR') === '1';
export const STARTUP_DEV_HINT = getStartupContextValue('dev') === 'true';

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
