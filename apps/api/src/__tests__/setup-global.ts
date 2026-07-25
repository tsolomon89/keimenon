/**
 * Per-file setup hook for API tests.
 *
 * Automatically overrides process.env.DB_PATH with a unique isolated database
 * copy, and intercepts fetch/eventsource to inject test isolation headers.
 */

import { beforeAll, afterAll, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

process.env.NODE_ENV = 'test';

if (process.env.HIBP_ENABLED === undefined) {
  process.env.HIBP_ENABLED = 'false';
}

if (process.env.AUTH_TEST_RELAX_SESSION_BINDING === undefined) {
  process.env.AUTH_TEST_RELAX_SESSION_BINDING = '1';
}

const projectRoot = path.resolve(__dirname, '../../../../');
const testDbsDir = path.join(projectRoot, '.test-dbs');
const templateDbPath = path.join(testDbsDir, 'template.db');
const dbPathTxt = path.join(testDbsDir, 'db-path.txt');

// Read the server's database path from the text file written by globalSetup
let serverDbPath: string | null = null;
if (fs.existsSync(dbPathTxt)) {
  serverDbPath = fs.readFileSync(dbPathTxt, 'utf8').trim();
} else if (process.env.DB_PATH) {
  serverDbPath = process.env.DB_PATH;
}

// Generate the unique database path for this test file immediately
const uniqueDbPath = path.join(testDbsDir, `test-${randomUUID()}.db`);

// Override immediately at the top level so that test files import-time evaluation gets the unique path
process.env.DB_PATH = uniqueDbPath;
process.env.SQLITE_PATH = uniqueDbPath;

// Mock node-fetch to append the database isolation header
vi.mock('node-fetch', async () => {
  const actual = await vi.importActual<typeof import('node-fetch')>('node-fetch');
  const mockFetch = (url: any, init: any = {}) => {
    const dbPath = process.env.DB_PATH;
    if (dbPath) {
      const normalizedDbPath = dbPath.replace(/\\/g, '/');
      init.headers = {
        ...init.headers,
        'X-Test-DB-Path': normalizedDbPath,
      };
    }
    return actual.default(url, init);
  };
  return {
    ...actual,
    default: mockFetch,
  };
});

// Mock eventsource to append the database isolation query parameter
vi.mock('eventsource', async () => {
  const actual = await vi.importActual<typeof import('eventsource')>('eventsource');

  class MockEventSource extends actual.EventSource {
    constructor(url: string, eventSourceInitDict?: any) {
      const dbPath = process.env.DB_PATH;
      let targetUrl = url;
      if (dbPath) {
        const normalizedDbPath = dbPath.replace(/\\/g, '/');
        try {
          const parsedUrl = new URL(url);
          parsedUrl.searchParams.set('x-test-db-path', normalizedDbPath);
          targetUrl = parsedUrl.toString();
        } catch (err) {
          const separator = url.includes('?') ? '&' : '?';
          targetUrl = `${url}${separator}x-test-db-path=${encodeURIComponent(normalizedDbPath)}`;
        }
      }
      super(targetUrl, eventSourceInitDict);
    }
  }

  return {
    ...actual,
    EventSource: MockEventSource,
  };
});

// Patch global.fetch in case native fetch is used
const originalGlobalFetch = global.fetch;
if (originalGlobalFetch) {
  global.fetch = (url: any, init: any = {}) => {
    const dbPath = process.env.DB_PATH;
    if (dbPath) {
      const normalizedDbPath = dbPath.replace(/\\/g, '/');
      init.headers = {
        ...init.headers,
        'X-Test-DB-Path': normalizedDbPath,
      };
    }
    return originalGlobalFetch(url, init);
  };
}

beforeAll(async () => {
  if (serverDbPath) {
    fs.mkdirSync(testDbsDir, { recursive: true });

    // Only create/checkpoint template.db once
    if (!fs.existsSync(templateDbPath)) {
      try {
        const tempDb = new Database(serverDbPath);
        tempDb.pragma('wal_checkpoint(TRUNCATE)');
        tempDb.close();
      } catch (err) {
        console.warn('[setup-global] Failed to checkpoint server DB:', err);
      }

      let copied = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          fs.copyFileSync(serverDbPath, templateDbPath);
          copied = true;
          break;
        } catch (err) {
          console.warn(`[setup-global] Copying template DB failed (attempt ${attempt}):`, err);
          await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
        }
      }

      if (!copied) {
        throw new Error('[setup-global] Could not create template database file.');
      }
    }

    // Copy template.db to unique file
    fs.copyFileSync(templateDbPath, uniqueDbPath);

    // Pre-initialize isolated jobs database
    const jobsDbPath = uniqueDbPath.replace(/\.db$/, '-jobs.db');
    const jobsDb = new Database(jobsDbPath);
    let schemaPath = path.resolve(__dirname, '../../../../packages/db/src/sqlite/jobs-schema.sql');
    if (!fs.existsSync(schemaPath)) {
      const candidates = [
        path.resolve(projectRoot, 'packages/db/src/sqlite/jobs-schema.sql'),
        path.resolve(projectRoot, '../packages/db/src/sqlite/jobs-schema.sql'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          schemaPath = c;
          break;
        }
      }
    }
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    jobsDb.exec(schemaSQL);
    jobsDb.close();
  }
});

afterAll(async () => {
  if (uniqueDbPath) {
    const jobsDbPath = uniqueDbPath.replace(/\.db$/, '-jobs.db');

    // Close database connections before unlinking to release Windows file locks
    try {
      const { closeDbConnection } = await import('../utils/get-db-client');
      await closeDbConnection(uniqueDbPath);
      await closeDbConnection(jobsDbPath);
    } catch (err) {
      // Best-effort
    }

    const pathsToDelete = [
      uniqueDbPath,
      `${uniqueDbPath}-wal`,
      `${uniqueDbPath}-shm`,
      jobsDbPath,
      `${jobsDbPath}-wal`,
      `${jobsDbPath}-shm`,
    ];

    for (const p of pathsToDelete) {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch (err) {
          // Best-effort
        }
      }
    }
  }
});
