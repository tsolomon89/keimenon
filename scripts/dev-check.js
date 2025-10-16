#!/usr/bin/env node

/**
 * Check which development servers are currently running
 * Usage: npm run dev:check
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const PORTS = {
  api: 4001,
  web: 3000,
};

async function checkPort(port) {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      return stdout.trim().length > 0;
    } else {
      const { stdout } = await execAsync(`lsof -i :${port} | grep LISTEN`);
      return stdout.trim().length > 0;
    }
  } catch (error) {
    return false; // No process on this port
  }
}

async function getProcessInfo(port) {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      const pids = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        return parts[parts.length - 1];
      }).filter((pid, index, self) => self.indexOf(pid) === index);
      return pids;
    } else {
      const { stdout } = await execAsync(`lsof -ti :${port}`);
      return stdout.trim().split('\n').filter(Boolean);
    }
  } catch (error) {
    return [];
  }
}

async function main() {
  console.log('🔍 Checking development servers...\n');

  let anyRunning = false;

  for (const [name, port] of Object.entries(PORTS)) {
    const isRunning = await checkPort(port);

    if (isRunning) {
      const pids = await getProcessInfo(port);
      console.log(`✅ ${name.toUpperCase()} server is running on port ${port}`);
      console.log(`   PIDs: ${pids.join(', ')}`);
      anyRunning = true;
    } else {
      console.log(`❌ ${name.toUpperCase()} server is NOT running (port ${port} free)`);
    }
  }

  if (!anyRunning) {
    console.log('\n💡 No servers running. Start with:');
    console.log('   npm run dev        (orchestrated startup)');
    console.log('   cd apps/api && npm run dev   (API only)');
  } else {
    console.log('\n💡 To stop servers:');
    console.log('   npm run dev:stop');
  }
}

main().catch(error => {
  console.error('Error checking servers:', error.message);
  process.exit(1);
});
