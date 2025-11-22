import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

/**
 * Test Isolation Middleware
 *
 * Enables per-worker database isolation during E2E testing.
 *
 * How it works:
 * 1. E2E tests send X-Test-DB-Path header with worker-specific DB path
 * 2. This middleware intercepts the request
 * 3. If in test mode and header present, overrides DB path for this request
 * 4. Database client uses the worker-specific DB instead of shared DB
 *
 * Security:
 * - Only active when NODE_ENV=test
 * - Validates DB path is within .test-dbs directory
 * - Prevents path traversal attacks
 *
 * Usage:
 *   // apps/api/src/index.ts
 *   import { testIsolationMiddleware } from './middleware/test-isolation.middleware';
 *
 *   if (process.env.NODE_ENV === 'test') {
 *     app.use(testIsolationMiddleware);
 *   }
 */

export function testIsolationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Debug: Log request details
  const userAgent = req.headers['user-agent'] || 'unknown';
  const browser = userAgent.includes('Chrome')
    ? 'Chromium'
    : userAgent.includes('Firefox')
      ? 'Firefox'
      : userAgent.includes('Safari')
        ? 'Webkit'
        : 'Unknown';

  // Check for test DB path header (sent by E2E tests)
  const testDbPath = req.headers['x-test-db-path'] as string;

  console.log(`[Test Isolation MW] Request received:`);
  console.log(`  - URL: ${req.method} ${req.url}`);
  console.log(`  - Browser: ${browser}`);
  console.log(`  - X-Test-DB-Path header: ${testDbPath || '(not present)'}`);

  if (testDbPath) {
    // Security: Validate path is safe
    const normalizedPath = path.resolve(path.normalize(testDbPath));

    // Find project root - either current dir or up two levels from apps/api
    let projectRoot = process.cwd();

    // If running from apps/api, go up to project root
    if (projectRoot.endsWith(path.join('apps', 'api'))) {
      projectRoot = path.resolve(projectRoot, '../..');
    }
    const testDbsDir = path.resolve(projectRoot, '.test-dbs');

    // Ensure path is within .test-dbs directory (case-insensitive on Windows)
    const expectedPrefix = testDbsDir + path.sep;
    const pathMatches =
      process.platform === 'win32'
        ? normalizedPath.toLowerCase().startsWith(expectedPrefix.toLowerCase())
        : normalizedPath.startsWith(expectedPrefix);

    if (!pathMatches) {
      console.warn(`[Test Isolation] Rejected invalid DB path: ${testDbPath}`);
      console.warn(`  - Normalized: ${normalizedPath}`);
      console.warn(`  - Expected prefix: ${testDbsDir}${path.sep}`);
      res.status(400).json({ error: 'Invalid test DB path' });
      return;
    }

    // Ensure file exists or can be created
    if (!fs.existsSync(normalizedPath) && !fs.existsSync(path.dirname(normalizedPath))) {
      console.warn(`[Test Isolation] DB directory does not exist: ${path.dirname(normalizedPath)}`);
      res.status(400).json({ error: 'Test DB directory not found' });
      return;
    }

    // Attach DB path to request for database client to use
    (req as any).testDbPath = normalizedPath;

    console.log(`[Test Isolation MW] ✅ Path validated and attached`);
    console.log(`  - Browser: ${browser}`);
    console.log(`  - Worker DB: ${path.basename(normalizedPath)}`);
    console.log(`  - Full path: ${normalizedPath}`);
  }

  next();
}

/**
 * Helper function to get DB path for current request
 *
 * Usage in database client:
 *
 * ```typescript
 * import { getDbPath } from '../middleware/test-isolation.middleware';
 *
 * export function getDatabaseClient(req?: Request) {
 *   const dbPath = getDbPath(req);
 *   return new Database(dbPath);
 * }
 * ```
 */
export function getDbPath(req?: Request): string {
  // If test mode and request has testDbPath, use it
  if (req && (req as any).testDbPath) {
    return (req as any).testDbPath;
  }

  // Otherwise use default DB path
  const defaultPath =
    process.env.STORAGE_MODE === 'local'
      ? path.join(process.cwd(), 'packages/db/data/canvas-memory.db')
      : path.join(process.cwd(), '.data/canvas-memory.db');

  return defaultPath;
}

/**
 * TypeScript declaration to extend Express Request
 */
declare global {
  namespace Express {
    interface Request {
      testDbPath?: string;
    }
  }
}
