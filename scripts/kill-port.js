#!/usr/bin/env node

/**
 * kill-port.js
 * Cross-platform process killer for port conflicts
 * Attempts graceful shutdown first, then force kill
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const { checkPort } = require('./check-port');

const execAsync = promisify(exec);

/**
 * Kill process on a specific port
 * @param {number} port - Port number
 * @param {object} options - Options
 * @param {boolean} options.force - Skip graceful shutdown
 * @param {number} options.timeout - Graceful shutdown timeout (ms)
 * @returns {Promise<boolean>} - True if killed, false if port was free
 */
async function killPort(port, options = {}) {
  const { force = false, timeout = 5000 } = options;

  // Check if port is in use
  const info = await checkPort(port);

  if (!info) {
    return false; // Port already free
  }

  const isWindows = process.platform === 'win32';

  try {
    if (!force) {
      // Try graceful shutdown first (Unix only)
      try {
        await killProcessGraceful(info.pid, isWindows);

        // Wait for port to be freed
        const freed = await waitForPortFree(port, timeout);
        if (freed) {
          return true;
        }
      } catch (error) {
        // Graceful kill failed (expected on Windows), continue to force kill
      }
    }

    // Force kill if graceful failed or force option
    await killProcessForce(info.pid, isWindows);

    // Verify port is freed
    await waitForPortFree(port, 2000);
    return true;
  } catch (error) {
    throw new Error(`Failed to kill process ${info.pid}: ${error.message}`);
  }
}

/**
 * Graceful process shutdown
 */
async function killProcessGraceful(pid, isWindows) {
  if (isWindows) {
    // Windows doesn't have SIGTERM, just skip graceful and go to force
    // (Windows taskkill without /F often fails with "can only be terminated forcefully")
    throw new Error('Graceful kill not supported on Windows');
  } else {
    // Unix: Send SIGTERM
    await execAsync(`kill -TERM ${pid}`);
  }
}

/**
 * Force process kill
 */
async function killProcessForce(pid, isWindows) {
  if (isWindows) {
    // Force kill with /F flag - use shell: true to avoid path interpretation issues
    await execAsync(`taskkill /F /PID ${pid}`, { shell: true });
  } else {
    // Unix: Send SIGKILL
    await execAsync(`kill -9 ${pid}`);
  }
}

/**
 * Wait for port to be freed
 * @param {number} port - Port to check
 * @param {number} timeout - Max wait time (ms)
 * @returns {Promise<boolean>} - True if freed, false if timeout
 */
async function waitForPortFree(port, timeout) {
  const startTime = Date.now();
  const interval = 100; // Check every 100ms

  while (Date.now() - startTime < timeout) {
    const info = await checkPort(port);
    if (!info) {
      return true; // Port is free
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return false; // Timeout
}

/**
 * Kill processes on multiple ports
 * @param {number[]} ports - Array of ports
 * @param {object} options - Options
 * @returns {Promise<Map<number, boolean>>} - Map of port -> success
 */
async function killPorts(ports, options = {}) {
  const results = new Map();

  for (const port of ports) {
    try {
      const killed = await killPort(port, options);
      results.set(port, killed);
    } catch (error) {
      console.error(`Failed to kill port ${port}:`, error.message);
      results.set(port, false);
    }
  }

  return results;
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const ports = args.filter(arg => !arg.startsWith('--')).map(p => parseInt(p));
  const force = args.includes('--force');

  if (ports.length === 0 || ports.some(isNaN)) {
    console.error('Usage: node kill-port.js <port> [port2...] [--force]');
    console.error('');
    console.error('Options:');
    console.error('  --force    Skip graceful shutdown, force kill immediately');
    console.error('');
    console.error('Examples:');
    console.error('  node kill-port.js 3000');
    console.error('  node kill-port.js 3000 3001 --force');
    process.exit(1);
  }

  (async () => {
    console.log(`Killing processes on ports: ${ports.join(', ')}`);
    if (force) {
      console.log('Using force kill...');
    }

    const results = await killPorts(ports, { force });

    for (const [port, killed] of results) {
      if (killed) {
        console.log(`✓ Port ${port} freed`);
      } else {
        console.log(`· Port ${port} was already free`);
      }
    }

    const allSuccess = Array.from(results.values()).every(v => v !== false);
    process.exit(allSuccess ? 0 : 1);
  })().catch(error => {
    console.error('Error:', error.message);
    process.exit(2);
  });
}

module.exports = { killPort, killPorts };
