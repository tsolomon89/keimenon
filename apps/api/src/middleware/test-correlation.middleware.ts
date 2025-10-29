import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

/**
 * Test Correlation Middleware
 *
 * Adds test correlation tracking to API requests to enable:
 * - Tracing E2E test requests through backend logs
 * - Correlating Playwright test failures with backend errors
 * - Debugging test flakiness by matching frontend actions to backend processing
 *
 * Reads or generates x-test-id header and stores it in AsyncLocalStorage
 * for access by downstream services and log formatters.
 */

// AsyncLocalStorage for test ID context
export const testIdStorage = new AsyncLocalStorage<string>();

export function testCorrelationMiddleware(req: Request, res: Response, next: NextFunction) {
  // Read test ID from header or generate a new one
  let testId = req.headers['x-test-id'] as string;

  if (!testId) {
    // Generate a test ID if not provided
    testId = randomUUID();
  }

  // Store test ID in AsyncLocalStorage for access by logging/services
  testIdStorage.run(testId, () => {
    // Add test ID to response headers for verification
    res.setHeader('x-test-id', testId);

    // Add test ID to request object for easy access
    (req as any).testId = testId;

    next();
  });
}

/**
 * Get the current test ID from AsyncLocalStorage
 * @returns The current test ID, or undefined if not in a test context
 */
export function getCurrentTestId(): string | undefined {
  return testIdStorage.getStore();
}

/**
 * Add test ID to structured log objects
 * @param logObject The log object to augment
 * @returns The log object with testId field added
 */
export function withTestId<T extends Record<string, any>>(logObject: T): T & { testId?: string } {
  const testId = getCurrentTestId();
  if (testId) {
    return { ...logObject, testId };
  }
  return logObject;
}
