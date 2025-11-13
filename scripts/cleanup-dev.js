/**
 * Development Environment Cleanup Script
 * Cross-platform Node.js version
 *
 * Performs comprehensive cleanup:
 * 1. Stops Node.js processes on dev ports (3000, 3001, 4001, 5173)
 * 2. Removes stale test databases
 *
 * Usage: npm run cleanup:dev
 */

const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORTS = [3000, 3001, 4001, 5173];
const TEST_DB_DIR = path.join(__dirname, '..', '.test-dbs');

console.log('\n====================================');
console.log('   Dev Environment Cleanup');
console.log('====================================\n');

/**
 * Kill Node.js processes listening on dev ports
 * (Smarter than killing ALL node processes - avoids killing this script)
 */
function killNodeProcesses() {
  console.log('[1/3] Stopping Node.js processes on dev ports...');

  const platform = os.platform();
  let killedAny = false;

  // Kill processes by port first (more targeted)
  for (const port of PORTS) {
    try {
      if (platform === 'win32') {
        const output = execSync(`netstat -ano | findstr :${port}`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });
        const lines = output.split('\n').filter((line) => line.includes('LISTENING'));

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];

          if (pid && !isNaN(pid)) {
            try {
              execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
              console.log(`  ✓ Stopped process on port ${port} (PID: ${pid})`);
              killedAny = true;
            } catch (e) {
              // Process already dead
            }
          }
        }
      } else {
        const output = execSync(`lsof -ti:${port}`, { encoding: 'utf8', stdio: 'pipe' });
        const pids = output
          .trim()
          .split('\n')
          .filter((pid) => pid);

        for (const pid of pids) {
          try {
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
            console.log(`  ✓ Stopped process on port ${port} (PID: ${pid})`);
            killedAny = true;
          } catch (e) {
            // Process already dead
          }
        }
      }
    } catch (error) {
      // Port not in use - this is fine
    }
  }

  if (!killedAny) {
    console.log('  - No dev server processes found');
  }

  // Small delay to let processes terminate
  if (killedAny) {
    console.log('  - Waiting for processes to terminate...');
    const start = Date.now();
    while (Date.now() - start < 1500) {
      // Busy wait for 1.5 seconds
    }
  }
}

/**
 * Clean up test databases
 */
function cleanupTestDatabases() {
  console.log('\n[2/2] Cleaning up test databases...');

  if (!fs.existsSync(TEST_DB_DIR)) {
    console.log('  - No test databases to clean');
    return;
  }

  try {
    const files = fs.readdirSync(TEST_DB_DIR);
    const testDbFiles = files.filter(
      (file) =>
        file.startsWith('worker-') &&
        (file.endsWith('.db') || file.endsWith('.db-wal') || file.endsWith('.db-shm'))
    );

    if (testDbFiles.length === 0) {
      console.log('  - No test databases to clean');
      return;
    }

    for (const file of testDbFiles) {
      const filePath = path.join(TEST_DB_DIR, file);
      try {
        fs.unlinkSync(filePath);
        console.log(`  ✓ Deleted ${file}`);
      } catch (err) {
        console.log(`  ✗ Failed to delete ${file}: ${err.message}`);
      }
    }
  } catch (error) {
    console.log(`  ✗ Error reading test database directory: ${error.message}`);
  }
}

/**
 * Main cleanup routine
 */
function main() {
  try {
    killNodeProcesses();
    cleanupTestDatabases();

    console.log('\n====================================');
    console.log('   Cleanup Complete!');
    console.log('====================================\n');
  } catch (error) {
    console.error('\n✗ Cleanup failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { killNodeProcesses, cleanupTestDatabases };
