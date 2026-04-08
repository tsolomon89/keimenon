#!/usr/bin/env node

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { loadApiEnv, resolveDevPorts } = require('./dev-runtime-config');
const { runShellCommandUnderProjectNode } = require('./project-node-runtime');

const ROOT_DIR = path.join(__dirname, '..');
const ABI_MISMATCH_PATTERNS = [
  /better[-_]sqlite3/i,
  /compiled against a different Node\.js version/i,
  /NODE_MODULE_VERSION/i,
  /ERR_DLOPEN_FAILED/i,
];

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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkReadyEndpoint(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/ready`, { timeout: 2000 }, (res) => {
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
        resolve({
          ready: res.statusCode === 200 && payload?.ready === true,
          payload,
          statusCode: res.statusCode,
        });
      });
    });

    req.on('error', () => resolve({ ready: false, payload: null, statusCode: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ready: false, payload: null, statusCode: null });
    });
  });
}

async function waitForApiReady(apiPort, apiState) {
  const timeoutMs = 120000;
  const startedAt = Date.now();
  let lastResult = { ready: false, payload: null, statusCode: null };
  console.log(`Waiting for backend readiness on http://127.0.0.1:${apiPort}/ready ...`);

  while (Date.now() - startedAt < timeoutMs) {
    if (apiState.failure) {
      const error = new Error(apiState.failure.message || 'API failed before readiness');
      error.code = apiState.failure.type;
      throw error;
    }

    const result = await checkReadyEndpoint(apiPort);
    lastResult = result;
    if (result.ready) {
      console.log(`Backend ready on port ${apiPort}`);
      return;
    }

    await wait(1000);
  }

  if (apiState.failure) {
    const error = new Error(apiState.failure.message || 'API failed before readiness');
    error.code = apiState.failure.type;
    throw error;
  }

  const checks = lastResult?.payload?.checks
    ? JSON.stringify(lastResult.payload.checks)
    : 'unknown';
  throw new Error(
    `Timeout waiting for API /ready (${timeoutMs}ms). Last status=${lastResult.statusCode ?? 'none'} checks=${checks}`
  );
}

async function waitForWebReady(webPort) {
  const timeoutMs = 120000;
  const startedAt = Date.now();
  console.log(`Waiting for web readiness on http://127.0.0.1:${webPort} ...`);

  while (Date.now() - startedAt < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${webPort}`, { timeout: 2000 }, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });

    if (ok) {
      console.log(`Web ready on port ${webPort}`);
      return;
    }

    await wait(1000);
  }

  throw new Error(`Timeout waiting for web readiness (${timeoutMs}ms)`);
}

function runRuntimeRepairForApi() {
  console.warn('Detected native module ABI mismatch. Running runtime repair once...');
  const result = runShellCommandUnderProjectNode('node scripts/runtime-repair.js --skip-desktop', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  if (typeof result.status !== 'number' || result.status !== 0) {
    const status = typeof result.status === 'number' ? result.status : 1;
    throw new Error(`Automatic runtime repair failed with status ${status}`);
  }
}

function classifyApiFailureLine(line, apiState, apiProcess) {
  const text = String(line || '').trim();
  if (!text) {
    return;
  }

  const abiMismatch = ABI_MISMATCH_PATTERNS.some((pattern) => pattern.test(text));
  if (abiMismatch) {
    apiState.failure = { type: 'abi_mismatch', message: text, code: 1 };
    if (apiProcess && !apiProcess.killed) {
      apiProcess.kill('SIGTERM');
    }
    return;
  }

  if (/Failed to start server/i.test(text)) {
    apiState.failure = { type: 'api_start_failure', message: text, code: 1 };
  }
}

async function stopProcess(proc) {
  if (!proc || proc.killed) {
    return;
  }
  proc.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => proc.on('exit', resolve)), wait(5000)]);
}

async function startApiWithRecovery(apiPort) {
  const apiState = { failure: null, repaired: false };

  const boot = async () => {
    apiState.failure = null;
    const apiProcess = runCommand(
      process.execPath,
      ['scripts/run-with-project-node.js', 'npm run dev --workspace=@keimenon/api'],
      'API',
      ROOT_DIR,
      { PORT: String(apiPort) }
    );

    apiProcess.stdout.on('data', (data) => {
      const lines = data
        .toString()
        .split('\n')
        .filter((line) => line.trim());
      for (const line of lines) {
        classifyApiFailureLine(line, apiState, apiProcess);
      }
    });
    apiProcess.stderr.on('data', (data) => {
      const lines = data
        .toString()
        .split('\n')
        .filter((line) => line.trim());
      for (const line of lines) {
        classifyApiFailureLine(line, apiState, apiProcess);
      }
    });
    apiProcess.on('exit', (code) => {
      if (!apiState.failure) {
        apiState.failure = {
          type: 'api_exit',
          message: `API exited before readiness (code=${code})`,
          code: code || 1,
        };
      }
    });

    return apiProcess;
  };

  let apiProcess = await boot();
  try {
    await waitForApiReady(apiPort, apiState);
    return apiProcess;
  } catch (error) {
    await stopProcess(apiProcess);
    if (!apiState.repaired && error?.code === 'abi_mismatch') {
      apiState.repaired = true;
      runRuntimeRepairForApi();
      console.log('Retrying API startup after runtime repair...');
      apiProcess = await boot();
      await waitForApiReady(apiPort, apiState);
      return apiProcess;
    }
    throw error;
  }
}

async function start() {
  loadApiEnv({ overwrite: false });
  const { webPort, apiPort } = resolveDevPorts({ loadApi: false });

  console.log('Starting Keimenon desktop dev mode (external API-first)...');
  console.log(`Using ports: web=${webPort}, api=${apiPort}`);

  let shuttingDown = false;
  let apiProcess = null;
  let webProcess = null;
  let electronProcess = null;

  const cleanup = (exitCode = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log('Stopping desktop dev processes...');
    if (electronProcess && !electronProcess.killed) electronProcess.kill('SIGTERM');
    if (webProcess && !webProcess.killed) webProcess.kill('SIGTERM');
    if (apiProcess && !apiProcess.killed) apiProcess.kill('SIGTERM');
    setTimeout(() => {
      if (electronProcess && !electronProcess.killed) electronProcess.kill('SIGKILL');
      if (webProcess && !webProcess.killed) webProcess.kill('SIGKILL');
      if (apiProcess && !apiProcess.killed) apiProcess.kill('SIGKILL');
      process.exit(exitCode);
    }, 1500).unref();
  };

  try {
    apiProcess = await startApiWithRecovery(apiPort);

    webProcess = runCommand(
      process.execPath,
      [
        'scripts/run-with-project-node.js',
        `npm run dev --workspace=@keimenon/web -- -p ${webPort} -H 127.0.0.1`,
      ],
      'WEB',
      ROOT_DIR,
      { PORT: String(webPort), API_PORT: String(apiPort) }
    );
    await waitForWebReady(webPort);

    electronProcess = runCommand(
      process.execPath,
      ['scripts/run-with-project-node.js', 'npm run electron:dev --workspace=keimenon-desktop'],
      'ELECTRON',
      ROOT_DIR,
      {
        WEB_PORT: String(webPort),
        API_PORT: String(apiPort),
        KEIMENON_SKIP_EMBEDDED_API: 'true',
      }
    );
  } catch (error) {
    console.error(`[desktop-dev] ${error.message}`);
    cleanup(1);
    return;
  }

  apiProcess.on('close', (code) => {
    if (!shuttingDown) {
      console.error(`[API] Process exited with code ${code}`);
      cleanup(code || 1);
    }
  });

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
