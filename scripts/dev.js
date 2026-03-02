#!/usr/bin/env node

/**
 * dev.js
 * Main development server orchestrator for Keimenon.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { checkPorts } = require('./check-port');
const { killPorts } = require('./kill-port');
const { waitFor } = require('./wait-for');
const { validateAll } = require('./validate-env');

const PORTS = {
  API: parseInt(process.env.PORT || '4001', 10),
  WEB: 3000,
};

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const processes = [];
let isShuttingDown = false;

function loadEnv() {
  const envPath = path.join(__dirname, '../apps/api/.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

function printHeader() {
  console.log(`${COLORS.bright}${COLORS.cyan}`);
  console.log('====================================================');
  console.log('  Keimenon - Development Server');
  console.log('====================================================');
  console.log(COLORS.reset);
}

async function runPreflightChecks() {
  console.log(`${COLORS.bright}--- Pre-flight Checks ---${COLORS.reset}\n`);

  const result = await validateAll({ verbose: false });

  console.log(`${COLORS.green}OK${COLORS.reset} Node.js ${process.version}`);

  try {
    const { execSync } = require('child_process');
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    console.log(`${COLORS.green}OK${COLORS.reset} npm ${npmVersion}`);
  } catch {
    // no-op
  }

  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.log(`${COLORS.yellow}WARN${COLORS.reset} ${warning}`);
    }
  }

  if (!result.valid) {
    for (const error of result.errors) {
      console.log(`${COLORS.red}FAIL${COLORS.reset} ${error}`);
    }
    throw new Error('Pre-flight checks failed');
  }

  console.log('');
}

async function handlePorts(clean) {
  console.log(`${COLORS.bright}--- Port Management ---${COLORS.reset}\n`);

  const portsToCheck = [PORTS.API, PORTS.WEB];
  const conflicts = await checkPorts(portsToCheck);

  if (conflicts.size === 0) {
    console.log(`${COLORS.green}OK${COLORS.reset} All ports available\n`);
    return;
  }

  for (const [port, info] of conflicts) {
    console.log(
      `${COLORS.yellow}WARN${COLORS.reset} Port ${port} in use (PID: ${info.pid}, Command: ${info.command})`
    );
  }

  if (!clean) {
    console.log(
      `${COLORS.yellow}WARN${COLORS.reset} Run with --clean to kill conflicting processes\n`
    );
    throw new Error('Port conflicts detected');
  }

  console.log(`${COLORS.blue}INFO${COLORS.reset} Killing conflicting processes...`);
  await killPorts(Array.from(conflicts.keys()), { force: false });
  console.log(`${COLORS.green}OK${COLORS.reset} Ports freed\n`);
}

function validateStorageMode() {
  console.log(`${COLORS.bright}--- Database Check ---${COLORS.reset}\n`);

  const storageMode = process.env.STORAGE_MODE || 'local';
  if (storageMode !== 'local') {
    throw new Error(`Unsupported STORAGE_MODE='${storageMode}'. Only 'local' is allowed.`);
  }

  console.log(`${COLORS.green}OK${COLORS.reset} Storage mode: local\n`);
}

async function startAPI() {
  console.log(`${COLORS.blue}INFO${COLORS.reset} Starting API server...`);

  const apiProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '../apps/api'),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  processes.push({ name: 'API', process: apiProcess, port: PORTS.API });

  apiProcess.stdout.on('data', (data) => {
    const lines = data
      .toString()
      .split('\n')
      .filter((line) => line.trim());
    for (const line of lines) {
      console.log(`${COLORS.magenta}[API]${COLORS.reset} ${line}`);
    }
  });

  apiProcess.stderr.on('data', (data) => {
    const lines = data
      .toString()
      .split('\n')
      .filter((line) => line.trim());
    for (const line of lines) {
      console.error(`${COLORS.red}[API]${COLORS.reset} ${line}`);
    }
  });

  apiProcess.on('exit', (code) => {
    if (!isShuttingDown) {
      console.error(`\n${COLORS.red}FAIL${COLORS.reset} API exited with code ${code}`);
      cleanup().then(() => process.exit(1));
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 2000));
}

async function waitForAPIReady() {
  console.log(`${COLORS.blue}INFO${COLORS.reset} Waiting for API readiness...`);

  await waitFor(`http://127.0.0.1:${PORTS.API}/health`, {
    timeout: 30000,
    interval: 1000,
    verbose: false,
  });

  console.log(`${COLORS.green}OK${COLORS.reset} API ready (http://127.0.0.1:${PORTS.API})\n`);
}

async function startFrontend() {
  console.log(`${COLORS.blue}INFO${COLORS.reset} Starting web app...`);

  const webProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '../apps/web'),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1', PORT: PORTS.WEB.toString() },
  });

  processes.push({ name: 'Frontend', process: webProcess, port: PORTS.WEB });

  webProcess.stdout.on('data', (data) => {
    const lines = data
      .toString()
      .split('\n')
      .filter((line) => line.trim());
    for (const line of lines) {
      console.log(`${COLORS.cyan}[WEB]${COLORS.reset} ${line}`);
    }
  });

  webProcess.stderr.on('data', (data) => {
    const lines = data
      .toString()
      .split('\n')
      .filter((line) => line.trim());
    for (const line of lines) {
      if (!line.includes('ready') && !line.includes('started')) {
        console.error(`${COLORS.red}[WEB]${COLORS.reset} ${line}`);
      } else {
        console.log(`${COLORS.cyan}[WEB]${COLORS.reset} ${line}`);
      }
    }
  });

  webProcess.on('exit', (code) => {
    if (!isShuttingDown) {
      console.error(`\n${COLORS.red}FAIL${COLORS.reset} Frontend exited with code ${code}`);
      cleanup().then(() => process.exit(1));
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 3000));
}

function printReady() {
  console.log(`\n${COLORS.bright}${COLORS.green}--- Application Ready ---${COLORS.reset}\n`);
  console.log(`${COLORS.bright}Frontend:${COLORS.reset} http://127.0.0.1:${PORTS.WEB}`);
  console.log(`${COLORS.bright}API:${COLORS.reset}      http://127.0.0.1:${PORTS.API}/api/v1`);
  console.log(`${COLORS.bright}Health:${COLORS.reset}   http://127.0.0.1:${PORTS.API}/health`);
  console.log(`${COLORS.bright}Storage:${COLORS.reset}  local mode\n`);
  console.log(`${COLORS.yellow}Press Ctrl+C to stop all services${COLORS.reset}\n`);
}

async function startServices() {
  console.log(`${COLORS.bright}--- Starting Services ---${COLORS.reset}\n`);
  await startAPI();
  await waitForAPIReady();
  await startFrontend();
  printReady();
}

function setupSignalHandlers() {
  process.on('SIGINT', async () => {
    console.log(`\n\n${COLORS.yellow}WARN${COLORS.reset} SIGINT received`);
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log(`\n\n${COLORS.yellow}WARN${COLORS.reset} SIGTERM received`);
    await cleanup();
    process.exit(0);
  });

  process.on('uncaughtException', async (error) => {
    console.error(`\n${COLORS.red}FAIL${COLORS.reset} Uncaught exception:`, error);
    await cleanup();
    process.exit(1);
  });
}

async function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${COLORS.yellow}Stopping services...${COLORS.reset}`);

  for (const { name, process: proc } of processes) {
    try {
      console.log(`${COLORS.blue}INFO${COLORS.reset} Stopping ${name}...`);

      proc.kill('SIGTERM');

      await Promise.race([
        new Promise((resolve) => proc.on('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);

      if (!proc.killed) {
        proc.kill('SIGKILL');
      }

      console.log(`${COLORS.green}OK${COLORS.reset} ${name} stopped`);
    } catch (error) {
      console.error(`${COLORS.red}FAIL${COLORS.reset} Error stopping ${name}:`, error.message);
    }
  }

  console.log(`${COLORS.green}OK${COLORS.reset} Cleanup complete\n`);
}

function keepAlive() {
  return new Promise(() => {
    // Keep process alive until SIGINT/SIGTERM
  });
}

async function main() {
  const args = process.argv.slice(2);
  const clean = args.includes('--clean');
  const skipValidation = args.includes('--skip-validation');

  loadEnv();
  printHeader();

  try {
    if (!skipValidation) {
      await runPreflightChecks();
    }

    await handlePorts(clean);
    validateStorageMode();
    await startServices();
    setupSignalHandlers();
    await keepAlive();
  } catch (error) {
    console.error(`\n${COLORS.red}FAIL${COLORS.reset} Startup failed:`, error.message);
    await cleanup();
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, error);
    process.exit(1);
  });
}

module.exports = { main };
