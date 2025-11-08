#!/usr/bin/env node

/**
 * E2E Development Script
 *
 * Starts the development servers (web + API) and runs Playwright tests in UI mode.
 * This script is designed for local development and debugging of E2E tests.
 *
 * Usage:
 *   npm run e2e:dev
 *   npm run e2e:dev -- --headed           # Run in headed mode
 *   npm run e2e:dev -- --project=chromium # Run only Chromium tests
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { killPorts } = require('../kill-port');

// Configuration
const WEB_PORT = 3000;
const API_PORT = 4001;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;
const MAX_STARTUP_TIME = 120000; // 2 minutes

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function checkServer(url) {
  return new Promise((resolve) => {
    http
      .get(url, (res) => {
        resolve(res.statusCode === 200);
      })
      .on('error', () => {
        resolve(false);
      });
  });
}

async function waitForServer(url, name, timeout = MAX_STARTUP_TIME) {
  log(`⏳ Waiting for ${name} to be ready at ${url}...`, colors.yellow);
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const isReady = await checkServer(url);
    if (isReady) {
      log(`✅ ${name} is ready!`, colors.green);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  log(`❌ ${name} failed to start within ${timeout / 1000}s`, colors.red);
  return false;
}

/**
 * Clean Next.js cache to prevent HMR cache poisoning
 * This fixes issues where newly created modules (like env.config.ts) are cached as 404s
 */
async function cleanNextCache() {
  const nextCachePath = path.join(__dirname, '../../apps/web/.next/cache');

  try {
    if (fs.existsSync(nextCachePath)) {
      log('🗑️  Cleaning Next.js cache to prevent HMR issues...', colors.yellow);
      fs.rmSync(nextCachePath, { recursive: true, force: true });
      log('✅ Next.js cache cleaned', colors.green);
      // Wait a moment for filesystem to catch up
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch (error) {
    log(`⚠️  Warning: Failed to clean Next.js cache: ${error.message}`, colors.yellow);
    // Non-fatal - continue anyway
  }
}

async function startServer(name, command, args, cwd, env = {}) {
  log(`🚀 Starting ${name}...`, colors.blue);

  const proc = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    shell: true,
    stdio: 'pipe',
  });

  proc.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(`${colors.cyan}[${name}]${colors.reset} ${output}`);
    }
  });

  proc.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.error(`${colors.yellow}[${name}]${colors.reset} ${output}`);
    }
  });

  return proc;
}

async function main() {
  log('\n🎭 Playwright E2E Development Environment', colors.bright);
  log('========================================\n', colors.bright);

  const processes = [];

  // Cleanup on exit
  const cleanup = () => {
    log('\n🧹 Cleaning up...', colors.yellow);
    processes.forEach((proc) => {
      if (proc && !proc.killed) {
        proc.kill();
      }
    });
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // ALWAYS kill ports first to ensure clean test environment
    // This prevents issues with zombie processes and ensures servers start in test mode
    log('🧹 Cleaning up ports to ensure fresh start...', colors.yellow);
    await killPorts([API_PORT, WEB_PORT], { force: true });
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for cleanup
    log('✅ Ports cleaned', colors.green);

    // Clean Next.js cache to prevent HMR cache poisoning
    await cleanNextCache();

    // Check if servers are already running
    const apiRunning = await checkServer(`${API_URL}/health`);
    const webRunning = await checkServer(WEB_URL);

    let apiProc, webProc;

    if (!apiRunning) {
      // Start API server with NODE_ENV=test to enable test helper routes
      // Use dev:test script which properly sets NODE_ENV via cross-env
      apiProc = await startServer(
        'API',
        'npm',
        ['run', 'dev:test'],
        path.join(__dirname, '../../apps/api'),
        { PORT: API_PORT }
      );
      processes.push(apiProc);

      // Wait for API to be ready
      const apiReady = await waitForServer(`${API_URL}/health`, 'API');
      if (!apiReady) {
        cleanup();
        return;
      }
    } else {
      log('✅ API server already running', colors.green);
    }

    if (!webRunning) {
      // Start Web server
      webProc = await startServer(
        'Web',
        'npm',
        ['run', 'dev'],
        path.join(__dirname, '../../apps/web'),
        { PORT: WEB_PORT }
      );
      processes.push(webProc);

      // Wait for Web to be ready
      const webReady = await waitForServer(WEB_URL, 'Web');
      if (!webReady) {
        cleanup();
        return;
      }
    } else {
      log('✅ Web server already running', colors.green);
    }

    log('\n✨ All servers are ready!\n', colors.green);

    // Get command-line arguments for Playwright
    const playwrightArgs = process.argv.slice(2);
    const defaultArgs = ['--ui', '--project=chromium'];
    const args = playwrightArgs.length > 0 ? playwrightArgs : defaultArgs;

    log(`🎭 Starting Playwright with args: ${args.join(' ')}\n`, colors.blue);

    // Start Playwright
    const playwrightProc = spawn('npx', ['playwright', 'test', ...args], {
      cwd: path.join(__dirname, '../..'),
      env: {
        ...process.env,
        BASE_URL: WEB_URL,
        API_BASE_URL: API_URL,
      },
      shell: true,
      stdio: 'inherit',
    });

    processes.push(playwrightProc);

    playwrightProc.on('exit', (code) => {
      log(`\n🎭 Playwright exited with code ${code}`, colors.cyan);
      cleanup();
    });
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, colors.red);
    cleanup();
  }
}

main();
