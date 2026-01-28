#!/usr/bin/env node

/**
 * dev.js
 * Main development server orchestrator for Keimenon
 * Handles pre-flight checks, port management, service startup, and graceful shutdown
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { checkPorts } = require('./check-port');
const { killPorts } = require('./kill-port');
const { waitFor } = require('./wait-for');
const { validateAll } = require('./validate-env');

// Configuration
const PORTS = {
  API: parseInt(process.env.PORT) || 4001,
  WEB: 3000,
  NEO4J_HTTP: 7474,
  NEO4J_BOLT: 7687,
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

// Process tracking
const processes = [];
let isShuttingDown = false;

/**
 * Load .env file from API directory
 */
function loadEnv() {
  const envPath = path.join(__dirname, '../apps/api/.env');
  if (fs.existsSync(envPath)) {
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
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const clean = args.includes('--clean');
  const skipValidation = args.includes('--skip-validation');

  // Load environment variables
  loadEnv();

  printHeader();

  try {
    // Pre-flight checks
    if (!skipValidation) {
      await runPreflightChecks();
    }

    // Port management
    await handlePorts(clean);

    // Check Neo4j availability
    await checkNeo4j();

    // Start services
    await startServices();

    // Setup signal handlers
    setupSignalHandlers();

    // Keep process alive
    await keepAlive();
  } catch (error) {
    console.error(`\n${COLORS.red}✗ Startup failed:${COLORS.reset}`, error.message);
    await cleanup();
    process.exit(1);
  }
}

/**
 * Print header
 */
function printHeader() {
  console.log(`${COLORS.bright}${COLORS.cyan}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🚀 Keimenon - Development Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(COLORS.reset);
}

/**
 * Run pre-flight checks
 */
async function runPreflightChecks() {
  console.log(`${COLORS.bright}━━━ Pre-flight Checks ━━━${COLORS.reset}\n`);

  const result = await validateAll({ verbose: false });

  // Show Node.js version
  console.log(`${COLORS.green}✓${COLORS.reset} Node.js ${process.version}`);

  // Show npm version
  try {
    const { execSync } = require('child_process');
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    console.log(`${COLORS.green}✓${COLORS.reset} npm ${npmVersion}`);
  } catch {}

  // Show warnings
  if (result.warnings.length > 0) {
    result.warnings.forEach((warn) => {
      console.log(`${COLORS.yellow}⚠${COLORS.reset} ${warn}`);
    });
  }

  // Show errors
  if (!result.valid) {
    console.log('');
    result.errors.forEach((err) => {
      console.log(`${COLORS.red}✗${COLORS.reset} ${err}`);
    });
    throw new Error('Pre-flight checks failed');
  }

  console.log('');
}

/**
 * Handle port conflicts
 */
async function handlePorts(clean) {
  console.log(`${COLORS.bright}━━━ Port Management ━━━${COLORS.reset}\n`);

  const portsToCheck = [PORTS.API, PORTS.WEB];
  const conflicts = await checkPorts(portsToCheck);

  if (conflicts.size === 0) {
    console.log(`${COLORS.green}✓${COLORS.reset} All ports available\n`);
    return;
  }

  // Show conflicts
  for (const [port, info] of conflicts) {
    console.log(
      `${COLORS.yellow}⚠${COLORS.reset} Port ${port} in use (PID: ${info.pid}, Command: ${info.command})`
    );
  }

  if (clean) {
    console.log(`${COLORS.blue}→${COLORS.reset} Killing conflicting processes...`);

    const portsToKill = Array.from(conflicts.keys());
    await killPorts(portsToKill, { force: false });

    console.log(`${COLORS.green}✓${COLORS.reset} Ports freed\n`);
  } else {
    console.log(
      `${COLORS.yellow}⚠${COLORS.reset} Run with --clean to automatically kill processes\n`
    );
    throw new Error('Port conflicts detected');
  }
}

/**
 * Check Neo4j availability
 */
async function checkNeo4j() {
  console.log(`${COLORS.bright}━━━ Database Check ━━━${COLORS.reset}\n`);

  const storageMode = process.env.STORAGE_MODE || 'local';

  // Skip Neo4j check if in local mode
  if (storageMode === 'local') {
    console.log(`${COLORS.green}✓${COLORS.reset} Storage mode: local (SQLite only)`);
    console.log(`${COLORS.blue}→${COLORS.reset} Skipping Neo4j check\n`);
    return;
  }

  const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';

  try {
    console.log(`${COLORS.blue}⏳${COLORS.reset} Storage mode: ${storageMode}`);
    console.log(`${COLORS.blue}⏳${COLORS.reset} Checking Neo4j at ${neo4jUri}...`);

    await waitFor(neo4jUri, {
      timeout: 10000,
      interval: 1000,
      verbose: false,
    });

    console.log(`${COLORS.green}✓${COLORS.reset} Neo4j is available\n`);
  } catch (error) {
    console.log(`${COLORS.red}✗${COLORS.reset} Neo4j not available\n`);
    console.log(`${COLORS.yellow}Hint:${COLORS.reset} Start Neo4j with:`);
    console.log(
      `  docker run --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5.19\n`
    );
    throw new Error('Neo4j not available');
  }
}

/**
 * Start all services
 */
async function startServices() {
  console.log(`${COLORS.bright}━━━ Starting Services ━━━${COLORS.reset}\n`);

  // Start API
  await startAPI();

  // Wait for API readiness
  await waitForAPIReady();

  // Start Frontend
  await startFrontend();

  // Print success
  printReady();
}

/**
 * Start API server
 */
async function startAPI() {
  console.log(`${COLORS.blue}⏳${COLORS.reset} Starting API server...`);

  const apiProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '../apps/api'),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  processes.push({ name: 'API', process: apiProcess, port: PORTS.API });

  // Forward output with prefix
  apiProcess.stdout.on('data', (data) => {
    const lines = data
      .toString()
      .split('\n')
      .filter((l) => l.trim());
    lines.forEach((line) => {
      console.log(`${COLORS.magenta}[API]${COLORS.reset} ${line}`);
    });
  });

  apiProcess.stderr.on('data', (data) => {
    const lines = data
      .toString()
      .split('\n')
      .filter((l) => l.trim());
    lines.forEach((line) => {
      console.error(`${COLORS.red}[API]${COLORS.reset} ${line}`);
    });
  });

  apiProcess.on('exit', (code) => {
    if (!isShuttingDown) {
      console.error(`\n${COLORS.red}✗ API exited with code ${code}${COLORS.reset}`);
      cleanup().then(() => process.exit(1));
    }
  });

  // Give it a moment to start
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

/**
 * Wait for API to be ready
 */
async function waitForAPIReady() {
  console.log(`${COLORS.blue}⏳${COLORS.reset} Waiting for API to be ready...`);

  try {
    await waitFor(`http://localhost:${PORTS.API}/health`, {
      timeout: 30000,
      interval: 1000,
      verbose: false,
    });

    console.log(`${COLORS.green}✓${COLORS.reset} API ready (http://localhost:${PORTS.API})\n`);
  } catch (error) {
    throw new Error('API failed to become ready');
  }
}

/**
 * Start Frontend server
 */
async function startFrontend() {
  console.log(`${COLORS.blue}⏳${COLORS.reset} Starting Frontend...`);

  const webProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '../apps/web'),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1', PORT: PORTS.WEB.toString() },
  });

  processes.push({ name: 'Frontend', process: webProcess, port: PORTS.WEB });

  // Forward output with prefix
  webProcess.stdout.on('data', (data) => {
    const lines = data
      .toString()
      .split('\n')
      .filter((l) => l.trim());
    lines.forEach((line) => {
      console.log(`${COLORS.cyan}[WEB]${COLORS.reset} ${line}`);
    });
  });

  webProcess.stderr.on('data', (data) => {
    const lines = data
      .toString()
      .split('\n')
      .filter((l) => l.trim());
    lines.forEach((line) => {
      // Next.js logs some things to stderr that aren't errors
      if (!line.includes('ready') && !line.includes('started')) {
        console.error(`${COLORS.red}[WEB]${COLORS.reset} ${line}`);
      } else {
        console.log(`${COLORS.cyan}[WEB]${COLORS.reset} ${line}`);
      }
    });
  });

  webProcess.on('exit', (code) => {
    if (!isShuttingDown) {
      console.error(`\n${COLORS.red}✗ Frontend exited with code ${code}${COLORS.reset}`);
      cleanup().then(() => process.exit(1));
    }
  });

  // Wait a moment for Next.js to compile
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

/**
 * Print ready message
 */
function printReady() {
  const storageMode = process.env.STORAGE_MODE || 'local';

  console.log(`\n${COLORS.bright}${COLORS.green}━━━ Application Ready ━━━${COLORS.reset}\n`);
  console.log(`${COLORS.bright}🌐 Frontend:${COLORS.reset}  http://localhost:${PORTS.WEB}`);
  console.log(`${COLORS.bright}🔌 API:${COLORS.reset}       http://localhost:${PORTS.API}/api/v1`);

  // Only show Neo4j UI if not in local mode
  if (storageMode !== 'local') {
    console.log(
      `${COLORS.bright}💾 Neo4j UI:${COLORS.reset}  http://localhost:${PORTS.NEO4J_HTTP}`
    );
  }

  console.log(`${COLORS.bright}📊 Health:${COLORS.reset}    http://localhost:${PORTS.API}/health`);
  console.log(`${COLORS.bright}💿 Storage:${COLORS.reset}   ${storageMode} mode`);
  console.log('');
  console.log(`${COLORS.yellow}Press Ctrl+C to stop all services${COLORS.reset}\n`);
}

/**
 * Setup signal handlers for graceful shutdown
 */
function setupSignalHandlers() {
  process.on('SIGINT', async () => {
    console.log(`\n\n${COLORS.yellow}⚠ SIGINT received${COLORS.reset}`);
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log(`\n\n${COLORS.yellow}⚠ SIGTERM received${COLORS.reset}`);
    await cleanup();
    process.exit(0);
  });

  process.on('uncaughtException', async (error) => {
    console.error(`\n${COLORS.red}✗ Uncaught exception:${COLORS.reset}`, error);
    await cleanup();
    process.exit(1);
  });
}

/**
 * Cleanup all processes
 */
async function cleanup() {
  if (isShuttingDown) {
    return; // Already cleaning up
  }

  isShuttingDown = true;

  console.log(`${COLORS.yellow}🛑 Shutting down gracefully...${COLORS.reset}`);

  for (const { name, process: proc } of processes) {
    try {
      console.log(`${COLORS.blue}→${COLORS.reset} Stopping ${name}...`);

      // Send SIGTERM
      proc.kill('SIGTERM');

      // Wait up to 5 seconds for graceful shutdown
      await Promise.race([
        new Promise((resolve) => proc.on('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);

      // Force kill if still running
      if (!proc.killed) {
        console.log(`${COLORS.yellow}⚠${COLORS.reset} Force killing ${name}...`);
        proc.kill('SIGKILL');
      }

      console.log(`${COLORS.green}✓${COLORS.reset} ${name} stopped`);
    } catch (error) {
      console.error(`${COLORS.red}✗${COLORS.reset} Error stopping ${name}:`, error.message);
    }
  }

  console.log(`${COLORS.green}✓${COLORS.reset} Cleanup complete\n`);
}

/**
 * Keep process alive
 */
function keepAlive() {
  return new Promise(() => {
    // Process will stay alive until SIGINT/SIGTERM
  });
}

// Run
if (require.main === module) {
  main().catch((error) => {
    console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, error);
    process.exit(1);
  });
}

module.exports = { main };
