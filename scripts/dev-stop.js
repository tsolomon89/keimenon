#!/usr/bin/env node

/**
 * Stop all development servers gracefully
 * Usage: npm run dev:stop
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const PORTS = [4001, 3000];  // API, Web

async function killPort(port) {
  try {
    if (process.platform === 'win32') {
      // Windows: Find and kill process
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      const pids = new Set();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          pids.add(pid);
        }
      }

      if (pids.size === 0) {
        return { port, status: 'free', message: 'Port was already free' };
      }

      for (const pid of pids) {
        try {
          await execAsync(`taskkill /F /PID ${pid}`);
        } catch (killError) {
          // Process might have already exited
        }
      }

      return { port, status: 'killed', message: `Killed ${pids.size} process(es)`, pids: Array.from(pids) };
    } else {
      // Unix: Use lsof and kill
      try {
        const { stdout } = await execAsync(`lsof -ti :${port}`);
        const pids = stdout.trim().split('\n').filter(Boolean);

        if (pids.length === 0) {
          return { port, status: 'free', message: 'Port was already free' };
        }

        for (const pid of pids) {
          await execAsync(`kill -9 ${pid}`);
        }

        return { port, status: 'killed', message: `Killed ${pids.length} process(es)`, pids };
      } catch (lsofError) {
        return { port, status: 'free', message: 'Port was already free' };
      }
    }
  } catch (error) {
    return { port, status: 'error', message: error.message };
  }
}

async function main() {
  console.log('🛑 Stopping all development servers...\n');

  const results = await Promise.all(PORTS.map(killPort));

  for (const result of results) {
    if (result.status === 'killed') {
      console.log(`✅ Port ${result.port}: ${result.message}`);
      if (result.pids) {
        console.log(`   PIDs: ${result.pids.join(', ')}`);
      }
    } else if (result.status === 'free') {
      console.log(`·  Port ${result.port}: ${result.message}`);
    } else {
      console.log(`❌ Port ${result.port}: ${result.message}`);
    }
  }

  console.log('\n✨ All development servers stopped');
  console.log('\n💡 Start again with:');
  console.log('   npm run dev:check      (check status)');
  console.log('   npm run dev            (start servers)');
}

main().catch(error => {
  console.error('Error stopping servers:', error.message);
  process.exit(1);
});
