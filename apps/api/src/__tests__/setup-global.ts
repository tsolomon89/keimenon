/**
 * Per-file setup hook for API tests.
 *
 * Intentionally minimal; server lifecycle is managed in global-setup/global-teardown.
 */

process.env.NODE_ENV = 'test';

if (process.env.HIBP_ENABLED === undefined) {
  process.env.HIBP_ENABLED = 'false';
}

if (process.env.AUTH_TEST_RELAX_SESSION_BINDING === undefined) {
  process.env.AUTH_TEST_RELAX_SESSION_BINDING = '1';
}

export {};
