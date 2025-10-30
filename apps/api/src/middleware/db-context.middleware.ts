import { Request, Response, NextFunction } from 'express';
import { getDbClient } from '../utils/get-db-client';

/**
 * Database Context Middleware
 *
 * Temporarily swaps global.dbClient with a test-specific client during the request
 * if X-Test-DB-Path header is present.
 *
 * This allows existing route code that uses global.dbClient to work seamlessly
 * with test isolation without requiring changes to every route.
 */
export async function dbContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const userAgent = req.headers['user-agent'] || 'unknown';
  const browser = userAgent.includes('Chrome')
    ? 'Chromium'
    : userAgent.includes('Firefox')
      ? 'Firefox'
      : userAgent.includes('Safari')
        ? 'Webkit'
        : 'Unknown';

  // Activate when X-Test-DB-Path header is present (set by test-isolation fixture)
  if (req.testDbPath) {
    console.log(`[DB Context MW] Swapping database client:`);
    console.log(`  - Browser: ${browser}`);
    console.log(`  - URL: ${req.method} ${req.url}`);
    console.log(`  - Test DB Path: ${req.testDbPath}`);
    const originalClient = global.dbClient;

    try {
      // Get test-specific client
      const testClient = await getDbClient(req);

      // Temporarily swap global client
      global.dbClient = testClient;

      console.log(`[DB Context MW] ✅ Client swapped successfully`);
      console.log(`  - Browser: ${browser}`);
      console.log(`  - Original client: ${!!originalClient}`);
      console.log(`  - Test client: ${!!testClient}`);

      // Set up cleanup to restore original client after response
      const cleanup = () => {
        global.dbClient = originalClient;
      };

      // Register cleanup for both normal completion and early close
      res.on('finish', cleanup);
      res.on('close', cleanup);

      // Continue to next middleware immediately (no await!)
      next();
    } catch (error) {
      // Ensure original client is restored on error
      console.log(`[DB Context MW] ❌ Error during client swap:`);
      console.log(`  - Browser: ${browser}`);
      console.log(`  - Error: ${error}`);
      global.dbClient = originalClient;
      next(error);
    }
  } else {
    // No test isolation needed
    next();
  }
}
