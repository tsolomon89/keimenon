/**
 * Test server lifecycle helpers for API integration suites.
 */

import { ChildProcess, execFile } from 'child_process';
import { existsSync, mkdirSync, rmSync, unlinkSync } from 'fs';
import { createServer } from 'net';
import path from 'path';
import fetch from 'node-fetch';

// Use the repo's Node 22 runtime for API child processes even when the parent shell differs.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawnNode22 } = require(
  path.resolve(__dirname, '../../../../../scripts/project-node-runtime.js')
) as {
  spawnNode22: (nodeArgs: string[], options?: Record<string, unknown>) => ChildProcess;
};

let serverProcess: ChildProcess | null = null;
let isInitialized = false;
let isShuttingDown = false;
let currentPort = 4001;
let testDatabasePath: string | null = null;
let testLocalDocsPath: string | null = null;

function sanitizeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleanEnv: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      cleanEnv[key] = value;
    }
  }
  return cleanEnv;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function removeFileIfExists(filePath: string): void {
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch {
      // Best-effort cleanup for test artifacts
    }
  }
}

function getOrCreateTestDatabasePath(projectRoot: string): string {
  if (testDatabasePath) {
    return testDatabasePath;
  }

  const testDbDir = path.join(projectRoot, '.tmp', 'api-test-db');
  mkdirSync(testDbDir, { recursive: true });
  testDatabasePath = path.join(testDbDir, `api-${Date.now()}-${process.pid}.db`);
  return testDatabasePath;
}

function getOrCreateTestLocalDocsPath(projectRoot: string): string {
  if (testLocalDocsPath) {
    return testLocalDocsPath;
  }

  const testDocsDir = path.join(projectRoot, '.tmp', 'api-test-localdocs', String(process.pid));
  mkdirSync(testDocsDir, { recursive: true });
  testLocalDocsPath = testDocsDir;
  return testLocalDocsPath;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to resolve free port'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function isEndpointReady(url: string, timeoutMs = 1000): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal as any });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServer(maxAttempts = 90): Promise<void> {
  const readyUrl = `http://127.0.0.1:${currentPort}/ready`;
  const healthUrl = `http://127.0.0.1:${currentPort}/health`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if ((await isEndpointReady(readyUrl)) || (await isEndpointReady(healthUrl))) {
      console.log(`[test-server] Server readiness confirmed on attempt ${attempt}`);
      return;
    }
    await sleep(1000);
  }

  throw new Error(
    `Server failed to become ready after ${maxAttempts} seconds (checked ${readyUrl} and ${healthUrl})`
  );
}

export async function startTestServer(): Promise<void> {
  if (serverProcess && isInitialized) {
    console.log(`[test-server] Reusing running server on port ${currentPort}`);
    return;
  }

  if (isInitialized) {
    throw new Error('Test server initialization already in progress');
  }

  isInitialized = true;

  try {
    currentPort = await getFreePort();
    console.log(`[test-server] Starting API server on port ${currentPort}`);

    const apiSrcRoot = path.resolve(__dirname, '../../');
    const serverPath = path.join(apiSrcRoot, 'index.ts');
    const projectRoot = path.resolve(apiSrcRoot, '../../');
    const dbPath = getOrCreateTestDatabasePath(projectRoot);
    const localDocsPath = getOrCreateTestLocalDocsPath(projectRoot);
    const tsxModulePath = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    if (!existsSync(tsxModulePath)) {
      throw new Error(`Required CLI not found: ${tsxModulePath}`);
    }

    const env = sanitizeEnv({
      ...process.env,
      PORT: currentPort.toString(),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      DISABLE_RATE_LIMIT: '1',
      MAX_CONCURRENT_JOBS: '2',
      WORKER_POLL_INTERVAL_MS: '1000',
      DB_PATH: dbPath,
      SQLITE_PATH: dbPath,
      LOCAL_DOCS_PATH: localDocsPath,
      STORAGE_PATH: path.join(localDocsPath, 'storage'),
    });

    const nodeModulesBin = path.join(projectRoot, 'node_modules', '.bin');
    env.PATH = env.PATH ? `${nodeModulesBin}${path.delimiter}${env.PATH}` : nodeModulesBin;

    const spawnOptions = {
      cwd: path.resolve(__dirname, '../../../'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'] as const,
      detached: false,
    };

    serverProcess = spawnNode22([tsxModulePath, serverPath], spawnOptions);

    if (serverProcess.stdout) {
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('GET /health') && !output.includes('GET /ready')) {
          console.log(`[server] ${output}`);
        }
      });
    }

    if (serverProcess.stderr) {
      serverProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.error(`[server error] ${output}`);
        }
      });
    }

    serverProcess.on('exit', (code) => {
      if (!isShuttingDown && code !== 0 && code !== null) {
        console.error(`[test-server] Server process exited with code ${code}`);
      }
      serverProcess = null;
      isInitialized = false;
      isShuttingDown = false;
    });

    await waitForServer();

    process.env.TEST_API_URL = `http://127.0.0.1:${currentPort}`;
    process.env.DB_PATH = dbPath;
    process.env.SQLITE_PATH = dbPath;
    console.log(`[test-server] Ready at ${process.env.TEST_API_URL}`);
    console.log(`[test-server] Using test database ${dbPath}`);
  } catch (error) {
    isInitialized = false;
    console.error('[test-server] Failed to start test server:', error);

    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }

    throw error;
  }
}

export async function stopTestServer(): Promise<void> {
  if (!serverProcess) {
    return;
  }

  const activeProcess = serverProcess;
  console.log('[test-server] Stopping API test server');
  isShuttingDown = true;

  try {
    const waitForExit = new Promise<void>((resolve) => {
      activeProcess.once('exit', () => resolve());
    });

    if (process.platform === 'win32' && activeProcess.pid) {
      await new Promise<void>((resolve) => {
        execFile('taskkill', ['/pid', String(activeProcess.pid), '/T', '/F'], () => resolve());
      });
    } else {
      try {
        activeProcess.kill('SIGTERM');
      } catch {
        // Best-effort shutdown
      }
    }

    await Promise.race([waitForExit, sleep(5000)]);

    if (activeProcess.exitCode === null && activeProcess.pid) {
      if (process.platform === 'win32') {
        await new Promise<void>((resolve) => {
          execFile('taskkill', ['/pid', String(activeProcess.pid), '/T', '/F'], () => resolve());
        });
      } else {
        try {
          activeProcess.kill('SIGKILL');
        } catch {
          // Best-effort shutdown
        }
      }

      await Promise.race([waitForExit, sleep(2000)]);
    }

    activeProcess.stdout?.removeAllListeners();
    activeProcess.stderr?.removeAllListeners();
    activeProcess.stdout?.destroy();
    activeProcess.stderr?.destroy();
    activeProcess.removeAllListeners();
  } finally {
    serverProcess = null;
    isInitialized = false;
    isShuttingDown = false;

    if (testDatabasePath) {
      removeFileIfExists(testDatabasePath);
      removeFileIfExists(`${testDatabasePath}-wal`);
      removeFileIfExists(`${testDatabasePath}-shm`);
      testDatabasePath = null;
    }

    if (testLocalDocsPath) {
      try {
        rmSync(testLocalDocsPath, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup for test local docs
      }
      testLocalDocsPath = null;
    }
  }
}

export function isTestServerRunning(): boolean {
  return serverProcess !== null && isInitialized;
}

export function getTestServerUrl(): string {
  return `http://127.0.0.1:${currentPort}`;
}
