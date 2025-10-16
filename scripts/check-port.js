#!/usr/bin/env node

/**
 * check-port.js
 * Cross-platform port checker (Windows/Unix)
 * Returns process info if port is in use, null otherwise
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Check if a port is in use
 * @param {number} port - Port number to check
 * @returns {Promise<{pid: number, command: string} | null>}
 */
async function checkPort(port) {
  const isWindows = process.platform === 'win32';

  try {
    if (isWindows) {
      return await checkPortWindows(port);
    } else {
      return await checkPortUnix(port);
    }
  } catch (error) {
    // Port not in use or error checking
    return null;
  }
}

/**
 * Check port on Windows using netstat
 */
async function checkPortWindows(port) {
  try {
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);

    // Parse netstat output
    // Example line: TCP    0.0.0.0:3001    0.0.0.0:0    LISTENING    12345
    const lines = stdout.split('\n').filter(line => line.trim());

    for (const line of lines) {
      // Check if it's a LISTENING socket
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1]);

        if (!isNaN(pid)) {
          // Get process name
          try {
            const { stdout: taskOutput } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
            const taskParts = taskOutput.split(',');
            const command = taskParts[0] ? taskParts[0].replace(/"/g, '') : 'unknown';

            return { pid, command };
          } catch {
            return { pid, command: 'unknown' };
          }
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Check port on Unix/Mac using lsof
 */
async function checkPortUnix(port) {
  try {
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    const pid = parseInt(stdout.trim());

    if (isNaN(pid)) {
      return null;
    }

    // Get process command
    try {
      const { stdout: psOutput } = await execAsync(`ps -p ${pid} -o comm=`);
      const command = psOutput.trim();

      return { pid, command };
    } catch {
      return { pid, command: 'unknown' };
    }
  } catch (error) {
    return null;
  }
}

/**
 * Check multiple ports
 * @param {number[]} ports - Array of port numbers
 * @returns {Promise<Map<number, {pid: number, command: string}>>}
 */
async function checkPorts(ports) {
  const results = new Map();

  for (const port of ports) {
    const info = await checkPort(port);
    if (info) {
      results.set(port, info);
    }
  }

  return results;
}

// CLI usage
if (require.main === module) {
  const port = parseInt(process.argv[2]);

  if (!port || isNaN(port)) {
    console.error('Usage: node check-port.js <port>');
    process.exit(1);
  }

  checkPort(port).then(info => {
    if (info) {
      console.log(JSON.stringify(info));
      process.exit(1); // Port in use
    } else {
      console.log('Port free');
      process.exit(0);
    }
  }).catch(error => {
    console.error('Error:', error.message);
    process.exit(2);
  });
}

module.exports = { checkPort, checkPorts };
