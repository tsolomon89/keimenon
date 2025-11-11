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

const API_BASE_URL = 'http://127.0.0.1:4001';
const ERROR_LOG_PATH = path.join(process.cwd(), '.test-errors.log');

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

    // Also log to console for immediate visibility
    console.error(`[API ERROR] ${method} ${url} returned ${status}`);
    console.error(`[API ERROR] Response: ${responseBody.substring(0, 500)}`);
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
  // Extract token from localStorage
  const token = await page.evaluate(() => localStorage.getItem('canvas_memory_token'));

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
  const response = await page.request[methodLower](fullUrl, requestOptions);

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
        localStorage.setItem('canvas_memory_token', token);
      }, body.token);
    }
  }

  return response;
}
