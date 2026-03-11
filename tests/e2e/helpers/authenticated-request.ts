/**
 * Authenticated Request Helper
 *
 * Helper for making authenticated API requests in E2E tests.
 * Automatically extracts JWT token from localStorage and adds Authorization header.
 *
 * ENHANCED: Logs all non-200 API responses to .test-errors.log for debugging intermittent failures.
 * See: SESSION6_HANDOFF.md - Intermittent CREATE test failure investigation
 *
 * Usage:
 * ```typescript
 * const response = await makeAuthenticatedRequest(page, 'POST', '/api/v1/auth/switch-account', {
 *   data: { account_id: 'acc_123' }
 * });
 * ```
 */

import { Page, APIResponse } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { getCachedAuthToken } from './login';

const API_BASE_URL = 'http://127.0.0.1:4001';
const ERROR_LOG_PATH = path.join(process.cwd(), '.test-errors.log');
const MAX_TRANSIENT_REQUEST_RETRIES = 2;
const SHOULD_LOG_AUTH_HELPER_WARNINGS = process.env.E2E_VERBOSE_AUTH_LOGS === '1';

function shouldEmitConsoleApiError(status: number): boolean {
  if (process.env.E2E_VERBOSE_API_ERRORS === '1') {
    return true;
  }
  return status >= 500;
}

function isTransientTransportError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return (
    /ECONNRESET/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /ETIMEDOUT/i.test(message) ||
    /socket hang up/i.test(message) ||
    /EPIPE/i.test(message)
  );
}

export interface RequestOptions {
  data?: any;
  params?: Record<string, any>;
  headers?: Record<string, string>;
}

/**
 * Log API errors to file for post-test analysis
 * Helps debug intermittent failures that occur during test runs
 */
async function logApiError(
  method: string,
  url: string,
  response: APIResponse,
  requestData?: any
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    const status = response.status();
    const statusText = response.statusText();

    // Attempt to get response body
    let responseBody = '';
    try {
      responseBody = await response.text();
    } catch {
      responseBody = '<unable to read response body>';
    }

    // Format log entry
    const logEntry = [
      `[${timestamp}] ${method} ${url}`,
      `Status: ${status} ${statusText}`,
      `Request: ${requestData ? JSON.stringify(requestData, null, 2) : 'N/A'}`,
      `Response: ${responseBody}`,
      '---',
      '',
    ].join('\n');

    // Write to log file (append mode)
    fs.appendFileSync(ERROR_LOG_PATH, logEntry);

    if (shouldEmitConsoleApiError(status)) {
      console.error(`[API ERROR] ${method} ${url} returned ${status}`);
      console.error(`[API ERROR] Response: ${responseBody.substring(0, 500)}`);
    }
  } catch (error) {
    // Don't fail the test if logging fails
    console.warn('[API ERROR LOGGING] Failed to log error:', error);
  }
}

/**
 * Make an authenticated API request
 * Extracts token from localStorage and adds Authorization header
 * ENHANCED: Automatically logs non-200 responses for debugging
 */
export async function makeAuthenticatedRequest(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  options?: RequestOptions
) {
  // Extract token + test DB context from browser state.
  // __TEST_DB_PATH__ is injected by test-isolation fixture.
  const authState = await page
    .evaluate(() => {
      const safeLocalStorageGet = (key: string): string | null => {
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      };

      const safeSessionStorageGet = (key: string): string | null => {
        try {
          return sessionStorage.getItem(key);
        } catch {
          return null;
        }
      };

      const token =
        safeLocalStorageGet('keimenon_token') ||
        safeLocalStorageGet('temp_auth_token') ||
        safeSessionStorageGet('keimenon_token') ||
        (() => {
          const rawAuth = safeLocalStorageGet('auth');
          if (!rawAuth) return null;
          try {
            const parsed = JSON.parse(rawAuth);
            return typeof parsed?.token === 'string' ? parsed.token : null;
          } catch {
            return null;
          }
        })();

      let testDbPath: string | null = null;
      try {
        // @ts-ignore test-only global injected by fixture
        testDbPath = (window as any).__TEST_DB_PATH__ || null;
      } catch {
        testDbPath = null;
      }

      return { token, testDbPath };
    })
    .catch(() => ({ token: null, testDbPath: null }));
  const token = authState?.token || getCachedAuthToken(page);
  const resolvedTestDbPath = authState?.testDbPath || process.env.PLAYWRIGHT_TEST_DB_PATH || null;

  if (!token) {
    throw new Error(
      'No auth token found in localStorage. Ensure user is logged in before making authenticated requests.'
    );
  }

  // Build full URL if not already absolute
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  // Prepare request options with auth header
  const requestOptions: any = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(resolvedTestDbPath ? { 'X-Test-DB-Path': resolvedTestDbPath } : {}),
      ...(options?.headers || {}),
    },
  };

  // Add data for POST/PUT
  if (options?.data) {
    requestOptions.data = options.data;
  }

  // Add query params for GET/DELETE
  if (options?.params) {
    requestOptions.params = options.params;
  }

  // Make the request using the appropriate method
  const methodLower = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
  let response: APIResponse;
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await page.request[methodLower](fullUrl, requestOptions);
      break;
    } catch (error) {
      const shouldRetry =
        attempt < MAX_TRANSIENT_REQUEST_RETRIES && isTransientTransportError(error);
      if (!shouldRetry) {
        throw error;
      }

      const waitMs = (attempt + 1) * 200;
      const message = error instanceof Error ? error.message : String(error);
      if (SHOULD_LOG_AUTH_HELPER_WARNINGS) {
        console.warn(
          `[Authenticated Request] transient failure on ${method} ${fullUrl}: ${message}. Retrying in ${waitMs}ms (${attempt + 1}/${MAX_TRANSIENT_REQUEST_RETRIES}).`
        );
      }
      await page.waitForTimeout(waitMs);
    }
  }

  // ENHANCED: Log non-200 responses for debugging intermittent failures
  if (!response.ok()) {
    await logApiError(method, fullUrl, response, options?.data);
  }

  return response;
}

/**
 * Convenience methods for specific HTTP verbs
 */
export async function authGet(page: Page, url: string, options?: RequestOptions) {
  return makeAuthenticatedRequest(page, 'GET', url, options);
}

export async function authPost(page: Page, url: string, options?: RequestOptions) {
  return makeAuthenticatedRequest(page, 'POST', url, options);
}

export async function authPut(page: Page, url: string, options?: RequestOptions) {
  return makeAuthenticatedRequest(page, 'PUT', url, options);
}

export async function authDelete(page: Page, url: string, options?: RequestOptions) {
  return makeAuthenticatedRequest(page, 'DELETE', url, options);
}

/**
 * Switch to a different account and automatically update the stored token
 *
 * CRITICAL: After switching accounts, the API returns a new JWT token with the new account context.
 * This helper automatically stores the new token in localStorage so subsequent API calls use it.
 *
 * @param page Playwright page object
 * @param accountId ID of the account to switch to
 * @returns Response from switch-account endpoint
 */
export async function switchAccount(page: Page, accountId: string) {
  const response = await authPost(page, '/api/v1/auth/switch-account', {
    data: { account_id: accountId },
  });

  if (response.ok()) {
    const body = await response.json();

    // Store the new token in localStorage
    if (body.token) {
      await page.evaluate((token) => {
        localStorage.setItem('keimenon_token', token);
      }, body.token);
    }
  }

  return response;
}
