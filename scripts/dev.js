#!/usr/bin/env node

/**
 * dev.js
 * Main development server orchestrator for Keimenon.
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const { checkPorts } = require('./check-port');
const { killPorts } = require('./kill-port');
const { validateAll } = require('./validate-env');
const { loadApiEnv, resolveDevPorts } = require('./dev-runtime-config');
const { runShellCommandUnderProjectNode } = require('./project-node-runtime');

let PORTS = {
  API: 4001,
  WEB: 3000,
};
const ROOT_DIR = path.join(__dirname, '..');
const STARTUP_TIMEOUTS = {
  apiReadyMs: 120000,
  webReadyMs: 120000,
  pollMs: 1000,
};
const ABI_MISMATCH_PATTERNS = [
  /better[-_]sqlite3/i,
  /compiled against a different Node\.js version/i,
  /NODE_MODULE_VERSION/i,
  /ERR_DLOPEN_FAILED/i,
];

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
let apiFailure = null;
let apiReady = false;
let apiRecoveryAttempted = false;

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

  apiFailure = null;
  apiReady = false;
  const apiProcess = spawn(
    process.execPath,
    ['scripts/run-with-project-node.js', 'npm run dev --workspace=@keimenon/api'],
    {
      cwd: ROOT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1', PORT: String(PORTS.API) },
    }
  );

  processes.push({ name: 'API', process: apiProcess, port: PORTS.API });

  apiProcess.stdout.on('data', (data) => {
    const lines = data
      .toString()
      .split('\n')
      .filter((line) => line.trim());
    for (const line of lines) {
      console.log(`${COLORS.magenta}[API]${COLORS.reset} ${line}`);
      classifyApiFailureLine(line, false);
    }
  });

  apiProcess.stderr.on('data', (data) => {
    const lines = data
      .toString()
      .split('\n')
      .filter((line) => line.trim());
    for (const line of lines) {
      console.error(`${COLORS.red}[API]${COLORS.reset} ${line}`);
      classifyApiFailureLine(line, true);
    }
  });

  apiProcess.on('exit', (code) => {
    if (!isShuttingDown) {
      if (!apiReady) {
        apiFailure = {
          type: apiFailure?.type || 'api_exit',
          message: apiFailure?.message || `API exited before readiness (code=${code})`,
          code: code ?? 1,
        };
      }
      console.error(`\n${COLORS.red}FAIL${COLORS.reset} API exited with code ${code}`);
      if (!apiReady) {
        return;
      }
      cleanup().then(() => process.exit(1));
    }
  });
}

function classifyApiFailureLine(line, isError) {
  const text = String(line || '').trim();
  if (!text) {
    return;
  }

  const abiMismatch = ABI_MISMATCH_PATTERNS.some((pattern) => pattern.test(text));
  if (abiMismatch) {
    apiFailure = {
      type: 'abi_mismatch',
      message: text,
      code: 1,
    };

    const apiProcessRecord = processes.find((entry) => entry.name === 'API');
    if (apiProcessRecord && !apiProcessRecord.process.killed) {
      apiProcessRecord.process.kill('SIGTERM');
    }
    return;
  }

  if (isError && /Failed to start server/i.test(text)) {
    apiFailure = {
      type: 'api_start_failure',
      message: text,
      code: 1,
    };
  }
}

async function checkReadyEndpoint() {
  const url = `http://127.0.0.1:${PORTS.API}/ready`;
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        let payload = null;
        try {
          payload = body ? JSON.parse(body) : null;
        } catch {
          payload = null;
        }

        const ready = res.statusCode === 200 && payload?.ready === true;
        resolve({ ready, statusCode: res.statusCode, payload });
      });
    });

    req.on('error', () => resolve({ ready: false, statusCode: null, payload: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ready: false, statusCode: null, payload: null });
    });
  });
}

async function waitForAPIReady() {
  console.log(`${COLORS.blue}INFO${COLORS.reset} Waiting for backend readiness (/ready)...`);

  const startedAt = Date.now();
  let lastResult = { ready: false, statusCode: null, payload: null };
  while (Date.now() - startedAt < STARTUP_TIMEOUTS.apiReadyMs) {
    if (apiFailure) {
      const failure = new Error(apiFailure.message || 'API failed before readiness');
      failure.code = apiFailure.type;
      throw failure;
    }

    const result = await checkReadyEndpoint();
    lastResult = result;
    if (result.ready) {
      apiReady = true;
      console.log(
        `${COLORS.green}OK${COLORS.reset} Backend ready (http://127.0.0.1:${PORTS.API}/ready)\n`
      );
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, STARTUP_TIMEOUTS.pollMs));
  }

  if (apiFailure) {
    const failure = new Error(apiFailure.message || 'API failed before readiness');
    failure.code = apiFailure.type;
    throw failure;
  }

  const checks = lastResult?.payload?.checks
    ? JSON.stringify(lastResult.payload.checks)
    : 'unknown';
  throw new Error(
    `Timeout waiting for backend readiness on /ready (${STARTUP_TIMEOUTS.apiReadyMs}ms). Last status=${lastResult.statusCode ?? 'none'} checks=${checks}`
  );
}

function runRuntimeRepairForApi() {
  console.log(
    `${COLORS.yellow}WARN${COLORS.reset} Detected native module ABI mismatch. Running runtime repair once...`
  );
  const result = runShellCommandUnderProjectNode('node scripts/runtime-repair.js --skip-desktop', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  if (typeof result.status !== 'number' || result.status !== 0) {
    const status = typeof result.status === 'number' ? result.status : 1;
    throw new Error(`Automatic runtime repair failed with status ${status}`);
  }
}

async function startFrontend() {
  console.log(`${COLORS.blue}INFO${COLORS.reset} Starting web app...`);

  const webProcess = spawn(
    process.execPath,
    [
      'scripts/run-with-project-node.js',
      `npm run dev --workspace=@keimenon/web -- -p ${PORTS.WEB} -H 127.0.0.1`,
    ],
    {
      cwd: ROOT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1', PORT: PORTS.WEB.toString() },
    }
  );

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
}

async function waitForFrontendReady() {
  console.log(`${COLORS.blue}INFO${COLORS.reset} Waiting for web readiness...`);

  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUTS.webReadyMs) {
    const result = await new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${PORTS.WEB}`, { timeout: 2000 }, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });

    if (result) {
      console.log(`${COLORS.green}OK${COLORS.reset} Web ready (http://127.0.0.1:${PORTS.WEB})\n`);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, STARTUP_TIMEOUTS.pollMs));
  }

  throw new Error(`Timeout waiting for web readiness (${STARTUP_TIMEOUTS.webReadyMs}ms)`);
}

async function stopApiProcessForRecovery() {
  const apiRecord = processes.find((entry) => entry.name === 'API');
  if (!apiRecord) {
    return;
  }

  const proc = apiRecord.process;
  if (!proc.killed) {
    proc.kill('SIGTERM');
  }

  await Promise.race([
    new Promise((resolve) => proc.on('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

async function ensureApiReadyWithRecovery() {
  await startAPI();
  try {
    await waitForAPIReady();
    return;
  } catch (error) {
    const shouldAttemptRepair = !apiRecoveryAttempted && error?.code === 'abi_mismatch';
    await stopApiProcessForRecovery();

    if (shouldAttemptRepair) {
      apiRecoveryAttempted = true;
      runRuntimeRepairForApi();
      console.log(`${COLORS.blue}INFO${COLORS.reset} Retrying API startup after runtime repair...`);
      await startAPI();
      await waitForAPIReady();
      return;
    }

    if (error?.code === 'abi_mismatch') {
      error.message = `${error.message}\nRun npm run runtime:repair and retry startup.`;
    }

    throw error;
  }
}

function printReady() {
  console.log(`\n${COLORS.bright}${COLORS.green}--- Application Ready ---${COLORS.reset}\n`);
  console.log(`${COLORS.bright}Frontend:${COLORS.reset} http://127.0.0.1:${PORTS.WEB}`);
  console.log(`${COLORS.bright}API:${COLORS.reset}      http://127.0.0.1:${PORTS.API}/api/v1`);
  console.log(`${COLORS.bright}Ready:${COLORS.reset}    http://127.0.0.1:${PORTS.API}/ready`);
  console.log(`${COLORS.bright}Health:${COLORS.reset}   http://127.0.0.1:${PORTS.API}/health`);
  console.log(`${COLORS.bright}Storage:${COLORS.reset}  local mode\n`);
  console.log(`${COLORS.yellow}Press Ctrl+C to stop all services${COLORS.reset}\n`);
}

async function startServices() {
  console.log(`${COLORS.bright}--- Starting Services ---${COLORS.reset}\n`);
  await ensureApiReadyWithRecovery();
  await startFrontend();
  await waitForFrontendReady();
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

function applyResolvedPorts() {
  const { apiPort, webPort } = resolveDevPorts({ loadApi: false });
  PORTS = {
    API: apiPort,
    WEB: webPort,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const clean = args.includes('--clean');
  const skipValidation = args.includes('--skip-validation');

  loadApiEnv({ overwrite: false });
  applyResolvedPorts();

  printHeader();
  console.log(
    `${COLORS.blue}INFO${COLORS.reset} Ports configured: api=${PORTS.API}, web=${PORTS.WEB}\n`
  );

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
