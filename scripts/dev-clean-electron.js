#!/usr/bin/env node

/**
 * Clean electron-mode startup:
 * 1) hard-stop conflicting ports
 * 2) kill stale Keimenon Electron app processes
 * 3) start existing electron orchestrator in ordered mode (WEB -> Electron -> embedded API)
 */

const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const { killPorts } = require('./kill-port');
const { checkPorts } = require('./check-port');

const execFileAsync = promisify(execFile);

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function loadApiEnv() {
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
  console.log('  Keimenon - Clean Start (Electron)');
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

  console.log(`${COLORS.green}OK${COLORS.reset} Ports are clean`);
}

async function killStaleKeimenonElectron() {
  console.log(`${COLORS.blue}INFO${COLORS.reset} Killing stale Keimenon Electron processes...`);

  let pids = [];

  if (process.platform === 'win32') {
    const psScript =
      '$procs = Get-CimInstance Win32_Process -Filter "Name=\'electron.exe\'" | ' +
      "Where-Object { $_.CommandLine -and ($_.CommandLine -match 'keimenon' -or $_.CommandLine -match 'apps\\\\desktop') }; " +
      '$procs | ForEach-Object { $_.ProcessId }';

    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', psScript]);
    pids = stdout
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  } else {
    const { stdout } = await execFileAsync('sh', [
      '-c',
      "ps -Ao pid=,command= | grep -i electron | grep -i keimenon | grep -v grep | awk '{print $1}'",
    ]);
    pids = stdout
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  if (pids.length === 0) {
    console.log(`${COLORS.green}OK${COLORS.reset} No stale Electron processes found\n`);
    return;
  }

  for (const pid of pids) {
    try {
      if (process.platform === 'win32') {
        await execFileAsync('taskkill', ['/F', '/PID', pid]);
      } else {
        await execFileAsync('kill', ['-9', pid]);
      }
    } catch {
      // Ignore already-exited processes.
    }
  }

  console.log(
    `${COLORS.green}OK${COLORS.reset} Stale Electron processes cleaned (${pids.length})\n`
  );
}

function startElectronOrchestrator(extraArgs) {
  const target = path.join(__dirname, 'dev-desktop.js');
  console.log(`${COLORS.bright}--- Startup ---${COLORS.reset}`);
  console.log(
    `${COLORS.blue}INFO${COLORS.reset} Starting ordered electron stack (WEB -> Electron -> embedded API)\n`
  );

  const child = spawn(process.execPath, [target, ...extraArgs], {
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
  loadApiEnv();
  printHeader();

  const apiPort = Number.parseInt(process.env.PORT || '4001', 10);
  const webPort = Number.parseInt(process.env.WEB_PORT || '3000', 10);
  const extraArgs = process.argv.slice(2);

  await cleanPorts([apiPort, webPort]);
  await killStaleKeimenonElectron();
  startElectronOrchestrator(extraArgs);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\n${COLORS.red}FAIL${COLORS.reset} ${error.message}`);
    process.exit(1);
  });
}
