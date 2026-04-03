#!/usr/bin/env node

const { spawn } = require('child_process');
const { waitFor } = require('./wait-for');
const { loadApiEnv, resolveDevPorts } = require('./dev-runtime-config');

function log(prefix, data, isError = false) {
  const lines = data.toString().split('\n');
  lines.forEach((line) => {
    if (line.trim()) {
      const method = isError ? console.error : console.log;
      method(`[${prefix}] ${line}`);
    }
  });
}

function runCommand(command, args, prefix, cwd = process.cwd(), extraEnv = {}) {
  const cleanEnv = { ...process.env, FORCE_COLOR: '1', ...extraEnv };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(command, args, {
    cwd,
    shell: true,
    stdio: 'pipe',
    env: cleanEnv,
  });

  child.stdout.on('data', (data) => log(prefix, data));
  child.stderr.on('data', (data) => log(prefix, data, true));

  return child;
}

async function start() {
  loadApiEnv({ overwrite: false });
  const { webPort, apiPort } = resolveDevPorts({ loadApi: false });

  console.log('Starting Keimenon hybrid desktop dev mode...');
  console.log(`Using ports: web=${webPort}, api=${apiPort}`);

  let shuttingDown = false;

  const webProcess = runCommand(
    'node',
    [
      'scripts/run-with-node22.js',
      `npm run dev --workspace=@keimenon/web -- -p ${webPort} -H 127.0.0.1`,
    ],
    'WEB',
    process.cwd(),
    { KEIMENON_ELECTRON_DEVTOOL: '1' }
  );

  try {
    console.log(`Waiting for web readiness on http://127.0.0.1:${webPort} ...`);
    await waitFor(`http://127.0.0.1:${webPort}`, {
      timeout: 120000,
      interval: 1000,
      verbose: false,
    });
  } catch (error) {
    webProcess.kill('SIGTERM');
    throw new Error(`Web server failed readiness check: ${error.message}`);
  }

  const electronProcess = runCommand(
    'node',
    ['scripts/run-with-node22.js', 'npm run electron:dev --workspace=keimenon-desktop'],
    'ELECTRON',
    process.cwd(),
    {
      WEB_PORT: String(webPort),
      API_PORT: String(apiPort),
    }
  );

  const cleanup = (exitCode = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log('Stopping desktop dev processes...');
    webProcess.kill('SIGTERM');
    electronProcess.kill('SIGTERM');
    setTimeout(() => {
      webProcess.kill('SIGKILL');
      electronProcess.kill('SIGKILL');
      process.exit(exitCode);
    }, 1500).unref();
  };

  webProcess.on('close', (code) => {
    if (!shuttingDown) {
      console.error(`[WEB] Process exited with code ${code}`);
      cleanup(code || 1);
    }
  });

  electronProcess.on('close', (code) => {
    if (!shuttingDown) {
      console.error(`[ELECTRON] Process exited with code ${code}`);
      cleanup(code || 1);
    }
  });

  process.on('SIGINT', () => cleanup(0));
  process.on('SIGTERM', () => cleanup(0));
}

start().catch((error) => {
  console.error(`[desktop-dev] ${error.message}`);
  process.exit(1);
});
