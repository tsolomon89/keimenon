/**
 * Test Server Utilities
 *
 * Manages server lifecycle for integration tests.
 * Starts the production server on port 4001 for testing.
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import fetch from 'node-fetch';

// Singleton state
let serverProcess: ChildProcess | null = null;
let isInitialized = false;

/**
 * Wait for server to be ready by polling health endpoint
 */
async function waitForServer(maxAttempts = 30): Promise<void> {
  const url = 'http://localhost:4001/health';

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log('✅ Server health check passed');
        return;
      }
    } catch (error) {
      // Server not ready yet
    }

    // Wait 1 second before next attempt
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('Server failed to start within timeout period');
}

/**
 * Start test server on port 4001
 */
export async function startTestServer(): Promise<void> {
  // Return if already started
  if (serverProcess && isInitialized) {
    console.log('⚡ Test server already running on port 4001');
    return;
  }

  // Prevent concurrent initialization
  if (isInitialized) {
    throw new Error('Test server initialization already in progress');
  }

  isInitialized = true;

  try {
    console.log('\n🧪 Starting test server on port 4001...');

    // Set environment variables for test mode
    const env = {
      ...process.env,
      PORT: '4001',
      NODE_ENV: 'test',
      DISABLE_RATE_LIMIT: '1',
      MAX_CONCURRENT_JOBS: '2',
      WORKER_POLL_INTERVAL_MS: '1000',
    };

    // Start server as child process
    const serverPath = path.join(__dirname, '../../index.ts');
    const projectRoot = path.resolve(__dirname, '../../../../../');
    const tsxModulePath = (() => {
      const candidate = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
      return existsSync(candidate) ? candidate : null;
    })();

    // Ensure the spawned process can resolve local binaries (e.g., tsx)
    const nodeModulesBin = path.join(projectRoot, 'node_modules', '.bin');
    env.PATH = env.PATH ? `${nodeModulesBin}${path.delimiter}${env.PATH}` : nodeModulesBin;

    const executable = tsxModulePath ? process.execPath : 'tsx';
    const args = tsxModulePath ? [tsxModulePath, serverPath] : [serverPath];

    serverProcess = spawn(executable, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout/stderr
      detached: false,
    });

    // Log server output (useful for debugging)
    if (serverProcess.stdout) {
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('GET /health')) {
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

    // Handle server exit
    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`❌ Server process exited with code ${code}`);
      }
      serverProcess = null;
      isInitialized = false;
    });

    // Wait for server to be ready
    console.log('⏳ Waiting for server to be ready...');
    await waitForServer();

    console.log('✅ Test server running on port 4001\n');
  } catch (error) {
    isInitialized = false;
    console.error('❌ Failed to start test server:', error);

    // Cleanup if failed
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }

    throw error;
  }
}

/**
 * Stop test server and cleanup resources
 */
export async function stopTestServer(): Promise<void> {
  if (!serverProcess) {
    console.log('⚠️  Test server not running, nothing to stop');
    return;
  }

  console.log('\n🛑 Stopping test server...');

  try {
    // Send SIGTERM for graceful shutdown
    serverProcess.kill('SIGTERM');

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      if (!serverProcess) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        // Force kill if doesn't exit gracefully
        if (serverProcess) {
          console.log('⚠️  Forcing server shutdown...');
          serverProcess.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      serverProcess.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    serverProcess = null;
    isInitialized = false;

    console.log('✅ Test server stopped successfully\n');
  } catch (error) {
    console.error('❌ Error stopping test server:', error);
    throw error;
  }
}

/**
 * Check if test server is running
 */
export function isTestServerRunning(): boolean {
  return serverProcess !== null && isInitialized;
}
