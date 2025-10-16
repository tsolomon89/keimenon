#!/usr/bin/env node

/**
 * dev-boot.js
 * Automated boot script for Canvas Memory OS
 * - Checks Docker availability
 * - Starts Neo4j if not running (Docker or checks Aura connection)
 * - Delegates to dev.js for app startup
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const { waitFor } = require('./wait-for');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../apps/api/.env') });

const execAsync = promisify(exec);

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

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const skipInstall = args.includes('--skip-install');
  const skipValidation = args.includes('--skip-validation');

  printHeader();

  try {
    // Check environment setup
    await checkEnvironment();

    // Check and install dependencies if needed
    if (!skipInstall) {
      await checkDependencies();
    }

    // Determine Neo4j type (Aura vs Docker)
    const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const isAura = neo4jUri.includes('neo4j+s://') || neo4jUri.includes('databases.neo4j.io');

    if (isAura) {
      // For Aura, just verify connection
      await checkNeo4jAura(neo4jUri);
    } else {
      // For local Neo4j, ensure Docker is running
      await ensureDockerRunning();
      await ensureNeo4jRunning(neo4jUri);
    }

    // All checks passed, start the dev server
    console.log(`${COLORS.green}✓${COLORS.reset} All prerequisites met\n`);

    // Filter out our custom args before passing to dev.js
    const devArgs = args.filter(arg => !['--skip-install'].includes(arg));
    await startDevServer(devArgs);

  } catch (error) {
    console.error(`\n${COLORS.red}✗ Boot failed:${COLORS.reset}`, error.message);
    process.exit(1);
  }
}

/**
 * Print header
 */
function printHeader() {
  console.log(`${COLORS.bright}${COLORS.cyan}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🔋 Canvas Memory OS - Auto Boot');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(COLORS.reset);
}

/**
 * Check and install dependencies if needed
 */
async function checkDependencies() {
  console.log(`${COLORS.bright}━━━ Dependencies Check ━━━${COLORS.reset}\n`);

  const fs = require('fs');
  const rootNodeModules = path.join(__dirname, '../node_modules');

  if (!fs.existsSync(rootNodeModules)) {
    console.log(`${COLORS.yellow}⚠${COLORS.reset} Dependencies not installed`);
    console.log(`${COLORS.blue}→${COLORS.reset} Installing dependencies (this may take a few minutes)...\n`);

    try {
      await execAsync('npm install', {
        cwd: path.join(__dirname, '..'),
        timeout: 300000, // 5 minutes
      });
      console.log(`\n${COLORS.green}✓${COLORS.reset} Dependencies installed\n`);
    } catch (error) {
      console.log(`${COLORS.red}✗${COLORS.reset} Failed to install dependencies\n`);
      console.log(`${COLORS.yellow}Please run manually:${COLORS.reset} npm install\n`);
      throw new Error('Dependency installation failed');
    }
  } else {
    console.log(`${COLORS.green}✓${COLORS.reset} Dependencies installed\n`);
  }
}

/**
 * Check environment files exist
 */
async function checkEnvironment() {
  console.log(`${COLORS.bright}━━━ Environment Check ━━━${COLORS.reset}\n`);

  const fs = require('fs');
  const apiEnv = path.join(__dirname, '../apps/api/.env');
  const webEnv = path.join(__dirname, '../apps/web/.env.local');

  // Check API .env
  if (!fs.existsSync(apiEnv)) {
    console.log(`${COLORS.yellow}⚠${COLORS.reset} apps/api/.env not found`);
    console.log(`${COLORS.blue}→${COLORS.reset} Creating from example...`);

    const examplePath = path.join(__dirname, '../apps/api/.env.example');
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, apiEnv);
      console.log(`${COLORS.green}✓${COLORS.reset} Created apps/api/.env`);
      console.log(`${COLORS.yellow}⚠${COLORS.reset} Please configure Neo4j settings in apps/api/.env\n`);
      throw new Error('Environment file created - please configure it first');
    } else {
      throw new Error('apps/api/.env.example not found');
    }
  } else {
    console.log(`${COLORS.green}✓${COLORS.reset} apps/api/.env exists`);
  }

  // Check web .env.local (optional, create if missing)
  if (!fs.existsSync(webEnv)) {
    const examplePath = path.join(__dirname, '../apps/web/.env.example');
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, webEnv);
      console.log(`${COLORS.green}✓${COLORS.reset} Created apps/web/.env.local`);
    }
  } else {
    console.log(`${COLORS.green}✓${COLORS.reset} apps/web/.env.local exists`);
  }

  console.log('');
}

/**
 * Check if Docker is running
 */
async function ensureDockerRunning() {
  console.log(`${COLORS.bright}━━━ Docker Check ━━━${COLORS.reset}\n`);

  try {
    console.log(`${COLORS.blue}⏳${COLORS.reset} Checking Docker...`);
    await execAsync('docker info', { timeout: 5000 });
    console.log(`${COLORS.green}✓${COLORS.reset} Docker is running\n`);
  } catch (error) {
    console.log(`${COLORS.red}✗${COLORS.reset} Docker is not running\n`);
    console.log(`${COLORS.yellow}Please start Docker Desktop and try again${COLORS.reset}\n`);
    throw new Error('Docker is not running');
  }
}

/**
 * Ensure Neo4j container is running
 */
async function ensureNeo4jRunning(neo4jUri) {
  console.log(`${COLORS.bright}━━━ Neo4j Check ━━━${COLORS.reset}\n`);

  try {
    // First, check if Neo4j is already responding
    console.log(`${COLORS.blue}⏳${COLORS.reset} Checking if Neo4j is already running...`);

    try {
      await waitFor(neo4jUri, { timeout: 3000, interval: 500, verbose: false });
      console.log(`${COLORS.green}✓${COLORS.reset} Neo4j is already running\n`);
      return;
    } catch {
      // Not running, continue to start it
    }

    // Check if container exists
    console.log(`${COLORS.blue}⏳${COLORS.reset} Checking Neo4j container status...`);

    let containerExists = false;
    try {
      const { stdout } = await execAsync('docker ps -a --filter "name=canvas-neo4j" --format "{{.Names}}"');
      containerExists = stdout.trim() === 'canvas-neo4j';
    } catch (error) {
      // Container doesn't exist
    }

    if (containerExists) {
      // Container exists, check if it's running
      try {
        const { stdout } = await execAsync('docker ps --filter "name=canvas-neo4j" --format "{{.Names}}"');
        const isRunning = stdout.trim() === 'canvas-neo4j';

        if (!isRunning) {
          console.log(`${COLORS.blue}→${COLORS.reset} Starting existing Neo4j container...`);
          await execAsync('docker start canvas-neo4j');
        }
      } catch (error) {
        console.log(`${COLORS.blue}→${COLORS.reset} Starting Neo4j container...`);
        await execAsync('docker start canvas-neo4j');
      }
    } else {
      // Container doesn't exist, start with docker-compose
      console.log(`${COLORS.blue}→${COLORS.reset} Creating and starting Neo4j container...`);
      const composePath = path.join(__dirname, '../docker-compose.dev.yml');
      await execAsync(`docker-compose -f "${composePath}" up -d neo4j`);
    }

    // Wait for Neo4j to be ready
    console.log(`${COLORS.blue}⏳${COLORS.reset} Waiting for Neo4j to be ready (this may take 20-30s)...`);

    await waitFor(neo4jUri, {
      timeout: 45000,
      interval: 2000,
      verbose: false,
    });

    console.log(`${COLORS.green}✓${COLORS.reset} Neo4j is ready\n`);

  } catch (error) {
    console.log(`${COLORS.red}✗${COLORS.reset} Failed to start Neo4j\n`);
    console.log(`${COLORS.yellow}Error:${COLORS.reset}`, error.message);
    console.log(`\n${COLORS.yellow}Manual start:${COLORS.reset}`);
    console.log(`  docker-compose -f docker-compose.dev.yml up -d neo4j\n`);
    throw new Error('Failed to start Neo4j');
  }
}

/**
 * Check Neo4j Aura connection
 */
async function checkNeo4jAura(neo4jUri) {
  console.log(`${COLORS.bright}━━━ Neo4j Aura Check ━━━${COLORS.reset}\n`);

  try {
    console.log(`${COLORS.blue}⏳${COLORS.reset} Testing connection to Neo4j Aura...`);

    await waitFor(neo4jUri, {
      timeout: 10000,
      interval: 1000,
      verbose: false,
    });

    console.log(`${COLORS.green}✓${COLORS.reset} Connected to Neo4j Aura\n`);
  } catch (error) {
    console.log(`${COLORS.red}✗${COLORS.reset} Cannot connect to Neo4j Aura\n`);
    console.log(`${COLORS.yellow}Please check:${COLORS.reset}`);
    console.log(`  1. NEO4J_URI is correct in apps/api/.env`);
    console.log(`  2. NEO4J_USER and NEO4J_PASSWORD are correct`);
    console.log(`  3. Your Aura instance is running`);
    console.log(`  4. Network/firewall allows connection\n`);
    throw new Error('Cannot connect to Neo4j Aura');
  }
}

/**
 * Start the dev server
 */
async function startDevServer(args) {
  console.log(`${COLORS.bright}━━━ Starting Development Server ━━━${COLORS.reset}\n`);

  // Pass through arguments to dev.js
  const devScript = path.join(__dirname, 'dev.js');

  const devProcess = spawn('node', [devScript, ...args], {
    stdio: 'inherit',
    shell: true,
  });

  // Forward exit code
  devProcess.on('exit', (code) => {
    process.exit(code || 0);
  });

  // Handle errors
  devProcess.on('error', (error) => {
    console.error(`${COLORS.red}✗ Failed to start dev server:${COLORS.reset}`, error);
    process.exit(1);
  });
}

// Run
if (require.main === module) {
  main().catch(error => {
    console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, error);
    process.exit(1);
  });
}

module.exports = { main };
