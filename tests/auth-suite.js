#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createServer } = require('net');
const { spawnNode22, spawnNode22Sync } = require('../scripts/project-node-runtime');

const repoRoot = path.resolve(__dirname, '..');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (!port) {
          reject(new Error('Failed to allocate a free port'));
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = body ? JSON.parse(body) : null;
          } catch {
            // Ignore JSON parse failures for readiness probe.
          }
          resolve({ statusCode: res.statusCode || 0, body: parsed });
        });
      })
      .on('error', reject);
  });
}

async function waitForReady(baseUrl, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { statusCode, body } = await fetchJson(`${baseUrl}/ready`);
      if (statusCode === 200 && body && body.ready === true) {
        return;
      }
    } catch {
      // Server still starting.
    }
    await delay(1000);
  }
  throw new Error(`API readiness timed out after ${timeoutMs}ms`);
}

function stopProcess(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }

    if (process.platform === 'win32' && proc.pid) {
      spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      resolve();
      return;
    }

    let settled = false;
    const finalize = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    proc.once('exit', finalize);
    proc.kill('SIGTERM');

    setTimeout(() => {
      if (proc.exitCode === null) {
        proc.kill('SIGKILL');
      }
      finalize();
    }, 5000);
  });
}

function resolveCli(relativePath) {
  const cliPath = path.join(repoRoot, 'node_modules', ...relativePath.split('/'));
  if (!fs.existsSync(cliPath)) {
    throw new Error(`Required CLI not found: ${cliPath}`);
  }
  return cliPath;
}

async function main() {
  const tsxCli = resolveCli('tsx/dist/cli.mjs');
  const vitestCli = resolveCli('vitest/vitest.mjs');

  const port = await getFreePort();
  const apiBaseUrl = `http://127.0.0.1:${port}`;
  const testRoot = path.join(os.tmpdir(), `keimenon-auth-suite-${Date.now()}`);
  const localDocsPath = path.join(testRoot, 'local-docs');
  const sqlitePath = path.join(localDocsPath, 'keimenon-auth-suite.db');
  const storagePath = path.join(testRoot, 'storage');

  fs.mkdirSync(localDocsPath, { recursive: true });
  fs.mkdirSync(storagePath, { recursive: true });

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    STORAGE_MODE: 'local',
    LOCAL_DOCS_PATH: localDocsPath,
    SQLITE_PATH: sqlitePath,
    STORAGE_PATH: storagePath,
    DISABLE_RATE_LIMIT: '1',
  };

  const serverProcess = spawnNode22([tsxCli, 'apps/api/src/index.ts'], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (data) => {
    const text = data.toString().trim();
    if (text) {
      console.log(`[auth-suite:api] ${text}`);
    }
  });

  serverProcess.stderr?.on('data', (data) => {
    const text = data.toString().trim();
    if (text) {
      console.error(`[auth-suite:api] ${text}`);
    }
  });

  try {
    await waitForReady(apiBaseUrl);
  } catch (error) {
    await stopProcess(serverProcess);
    throw error;
  }

  const result = spawnNode22Sync(
    [
      vitestCli,
      'run',
      '--config',
      'tests/integration/vitest.config.mts',
      'tests/integration/auth.test.ts',
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        API_BASE_URL: apiBaseUrl,
      },
      stdio: 'inherit',
    }
  );

  await stopProcess(serverProcess);
  process.exit(result.status ?? 1);
}

main().catch(async (error) => {
  console.error(`[auth-suite] Failed: ${error?.message || error}`);
  process.exit(1);
});
