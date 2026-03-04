#!/usr/bin/env node

/**
 * dev-boot.js
 * Local-first boot helper:
 * - validates environment files
 * - installs dependencies if needed
 * - delegates to scripts/dev.js
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const { spawnNode22 } = require('./project-node-runtime');
require('dotenv').config({ path: path.join(__dirname, '../apps/api/.env') });

const execAsync = promisify(exec);

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
  console.log('  Keimenon - Auto Boot (Local Mode)');
  console.log('====================================================');
  console.log(COLORS.reset);
}

async function checkEnvironment() {
  console.log(`${COLORS.bright}--- Environment Check ---${COLORS.reset}\n`);

  const apiEnv = path.join(__dirname, '../apps/api/.env');
  const webEnv = path.join(__dirname, '../apps/web/.env.local');

  if (!fs.existsSync(apiEnv)) {
    const examplePath = path.join(__dirname, '../apps/api/.env.example');
    if (!fs.existsSync(examplePath)) {
      throw new Error('apps/api/.env.example not found');
    }

    fs.copyFileSync(examplePath, apiEnv);
    console.log(`${COLORS.green}OK${COLORS.reset} Created apps/api/.env`);
  } else {
    console.log(`${COLORS.green}OK${COLORS.reset} apps/api/.env exists`);
  }

  if (!fs.existsSync(webEnv)) {
    const examplePath = path.join(__dirname, '../apps/web/.env.example');
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, webEnv);
      console.log(`${COLORS.green}OK${COLORS.reset} Created apps/web/.env.local`);
    }
  } else {
    console.log(`${COLORS.green}OK${COLORS.reset} apps/web/.env.local exists`);
  }

  const storageMode = process.env.STORAGE_MODE || 'local';
  if (storageMode !== 'local') {
    throw new Error(`Unsupported STORAGE_MODE='${storageMode}'. Only 'local' is allowed.`);
  }

  console.log(`${COLORS.green}OK${COLORS.reset} STORAGE_MODE=local\n`);
}

async function checkDependencies(skipInstall) {
  if (skipInstall) return;

  console.log(`${COLORS.bright}--- Dependencies Check ---${COLORS.reset}\n`);

  const rootNodeModules = path.join(__dirname, '../node_modules');
  if (fs.existsSync(rootNodeModules)) {
    console.log(`${COLORS.green}OK${COLORS.reset} Dependencies installed\n`);
    return;
  }

  console.log(`${COLORS.yellow}WARN${COLORS.reset} Dependencies not installed`);
  console.log(`${COLORS.blue}INFO${COLORS.reset} Running npm install...\n`);

  await execAsync('npm install', {
    cwd: path.join(__dirname, '..'),
    timeout: 300000,
  });

  console.log(`\n${COLORS.green}OK${COLORS.reset} Dependencies installed\n`);
}

async function startDevServer(args) {
  console.log(`${COLORS.bright}--- Starting Development Server ---${COLORS.reset}\n`);

  const devScript = path.join(__dirname, 'dev.js');
  const devProcess = spawnNode22([devScript, ...args], {
    stdio: 'inherit',
  });

  devProcess.on('exit', (code) => process.exit(code || 0));
  devProcess.on('error', (error) => {
    console.error(`${COLORS.red}FAIL${COLORS.reset} Failed to start dev server:`, error);
    process.exit(1);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const skipInstall = args.includes('--skip-install');

  printHeader();

  try {
    await checkEnvironment();
    await checkDependencies(skipInstall);

    const devArgs = args.filter((arg) => arg !== '--skip-install');
    await startDevServer(devArgs);
  } catch (error) {
    console.error(`\n${COLORS.red}FAIL${COLORS.reset} Boot failed:`, error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, error);
    process.exit(1);
  });
}

module.exports = { main };
