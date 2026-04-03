#!/usr/bin/env node

/**
 * Clean browser-mode startup:
 * 1) hard-stop conflicting ports
 * 2) verify ports are free
 * 3) start existing browser orchestrator in ordered mode (API -> WEB)
 */

const path = require('path');
const { spawn } = require('child_process');
const { killPorts } = require('./kill-port');
const { checkPorts } = require('./check-port');
const { loadApiEnv, resolveDevPorts } = require('./dev-runtime-config');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function printHeader() {
  console.log(`${COLORS.bright}${COLORS.cyan}`);
  console.log('====================================================');
  console.log('  Keimenon - Clean Start (Browser)');
  console.log('====================================================');
  console.log(COLORS.reset);
}

async function cleanPorts(ports) {
  console.log(`${COLORS.bright}--- Cleanup ---${COLORS.reset}`);
  console.log(`${COLORS.blue}INFO${COLORS.reset} Releasing ports: ${ports.join(', ')}`);

  await killPorts(ports, { force: true, timeout: 3000 });

  const conflicts = await checkPorts(ports);
  if (conflicts.size > 0) {
    const details = Array.from(conflicts.entries())
      .map(([port, info]) => `${port} (pid=${info.pid}, cmd=${info.command})`)
      .join('; ');
    throw new Error(`Ports still occupied after cleanup: ${details}`);
  }

  console.log(`${COLORS.green}OK${COLORS.reset} Ports are clean\n`);
}

function startBrowserOrchestrator(extraArgs) {
  const target = path.join(__dirname, 'dev.js');
  const args = [target, '--clean', ...extraArgs];
  console.log(`${COLORS.bright}--- Startup ---${COLORS.reset}`);
  console.log(`${COLORS.blue}INFO${COLORS.reset} Starting ordered browser stack (API -> WEB)\n`);

  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

async function main() {
  loadApiEnv({ overwrite: false });
  printHeader();

  const { apiPort, webPort } = resolveDevPorts({ loadApi: false });
  const extraArgs = process.argv.slice(2);

  await cleanPorts([apiPort, webPort]);
  startBrowserOrchestrator(extraArgs);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\n${COLORS.red}FAIL${COLORS.reset} ${error.message}`);
    process.exit(1);
  });
}
